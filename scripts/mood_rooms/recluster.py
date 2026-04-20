"""Mood rooms monthly clustering job.

Pulls every title embedding from Supabase, runs HDBSCAN, preserves labels
for clusters stable against the previous run, generates fresh labels via
OpenAI for new clusters, and writes a new `version` of mood_rooms +
mood_room_titles. Audit trail lives in `clustering_runs`.

Usage (local):
    python scripts/mood_rooms/recluster.py --dry-run
    python scripts/mood_rooms/recluster.py

Usage (GitHub Actions): no --dry-run flag; schedule is disabled until
Gate 3 per Phase 4.5 plan §2.7.

Environment:
    SUPABASE_CONNECTION_STRING   Direct Postgres URL. Superuser credential.
    OPENAI_API_KEY               For cluster labelling.
"""

from __future__ import annotations

import argparse
import logging
import os
import random
import sys
import time
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from openai import OpenAI

# Make sibling modules importable when running via `python scripts/mood_rooms/recluster.py`.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from cluster import (  # noqa: E402
    ClusterResult,
    cluster_params_payload,
    coverage_pct,
    l2_normalise,
    run_hdbscan,
)
from label import (  # noqa: E402
    OPENAI_MAX_TITLES_PER_CLUSTER,
    PreviousCluster,
    TitleMeta,
    resolve_cluster_label,
)
from persist import (  # noqa: E402
    TitleRow,
    connect,
    fetch_embeddings,
    fetch_previous_run,
    fetch_title_genres_bulk,
    finish_run,
    next_version,
    redact,
    start_run,
    write_mood_room_titles,
    write_mood_rooms,
)


DRY_RUN_SAMPLE_CLUSTERS = 10
DRY_RUN_SAMPLE_TITLES = 5


log = logging.getLogger("recluster")


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def _select_central_members(
    titles: list[TitleRow],
    cluster_labels: np.ndarray,
    centrality: np.ndarray,
    cluster_id: int,
    limit: int,
) -> list[int]:
    """Return indices into `titles` for the `limit` most-central members."""
    mask = cluster_labels == cluster_id
    indices = np.where(mask)[0]
    if len(indices) == 0:
        return []
    # Sort by centrality ascending (low centrality = closer to centroid = more central).
    scored = sorted(indices.tolist(), key=lambda i: centrality[i])
    return scored[:limit]


def _title_meta(titles: list[TitleRow], idx: int, genre_map: dict) -> TitleMeta:
    t = titles[idx]
    genres = genre_map.get((t.tmdb_id, t.media_type), [])
    return TitleMeta(
        tmdb_id=t.tmdb_id,
        media_type=t.media_type,
        title=t.title,
        year=t.release_year,
        genres=genres,
        overview=t.overview,
    )


def _collect_central_ids_by_media(
    titles: list[TitleRow],
    central_indices_per_cluster: dict[int, list[int]],
) -> dict[str, list[int]]:
    """Flatten central title indices into {media_type: [tmdb_id, ...]} for a
    single bulk genre query. Deduplicates."""
    out: dict[str, set[int]] = {}
    for indices in central_indices_per_cluster.values():
        for i in indices:
            t = titles[i]
            out.setdefault(t.media_type, set()).add(t.tmdb_id)
    return {mt: sorted(ids) for mt, ids in out.items()}


def _print_dry_run_report(
    titles: list[TitleRow],
    cluster_result: ClusterResult,
    central_indices_per_cluster: dict[int, list[int]],
) -> None:
    print()
    print("=" * 72)
    print("DRY RUN REPORT")
    print("=" * 72)
    print(f"Titles embedded:        {len(titles)}")
    print(f"Clusters found:         {len(cluster_result.cluster_ids)}")
    print(f"Noise count:            {int((cluster_result.labels == -1).sum())}")
    print(f"Catalogue coverage:     {coverage_pct(cluster_result.labels):.1f}%")
    print()
    print("Sampling up to", DRY_RUN_SAMPLE_CLUSTERS, "clusters:")
    print()

    sampled = cluster_result.cluster_ids[:DRY_RUN_SAMPLE_CLUSTERS]
    for cid in sampled:
        cluster_size = int((cluster_result.labels == cid).sum())
        print(f"  Cluster {cid}  (titles in cluster: {cluster_size})")
        central = central_indices_per_cluster.get(cid, [])[:DRY_RUN_SAMPLE_TITLES]
        for idx in central:
            t = titles[idx]
            year = f" ({t.release_year})" if t.release_year else ""
            centrality_value = float(cluster_result.centrality[idx])
            print(f"    [{centrality_value:.4f}] {t.title}{year} [{t.media_type}]")
        print()

    print("DRY RUN COMPLETE - NO WRITES PERFORMED")
    print()


def _run_pipeline(dry_run: bool) -> int:
    start_ts = time.time()

    load_dotenv()

    if not os.environ.get("SUPABASE_CONNECTION_STRING"):
        log.error("SUPABASE_CONNECTION_STRING is not set")
        return 2
    openai_key = os.environ.get("OPENAI_API_KEY")
    openai_client: OpenAI | None = None
    if openai_key:
        openai_client = OpenAI(api_key=openai_key)
    elif not dry_run:
        log.error("OPENAI_API_KEY is required for non-dry-run execution")
        return 2

    params = cluster_params_payload()

    with connect() as conn:
        conn.autocommit = False

        # Fetch + cluster phase: read-only, no audit row yet.
        with conn.cursor() as cur:
            log.info("Pulling embeddings from titles...")
            titles = fetch_embeddings(cur)
        if not titles:
            log.error("No titles with embeddings found; aborting")
            return 3

        embeddings = np.vstack([t.embedding for t in titles])
        log.info("Loaded %d embeddings with shape %s", len(titles), embeddings.shape)

        log.info("Running HDBSCAN...")
        hdbscan_start = time.time()
        cluster_result = run_hdbscan(embeddings)
        log.info(
            "HDBSCAN fit: %d clusters, %d noise, %.1fs",
            len(cluster_result.cluster_ids),
            int((cluster_result.labels == -1).sum()),
            time.time() - hdbscan_start,
        )

        # Pick most-central titles per cluster for labelling.
        central_indices_per_cluster: dict[int, list[int]] = {
            cid: _select_central_members(
                titles, cluster_result.labels, cluster_result.centrality,
                cid, OPENAI_MAX_TITLES_PER_CLUSTER,
            )
            for cid in cluster_result.cluster_ids
        }

        if dry_run:
            _print_dry_run_report(titles, cluster_result, central_indices_per_cluster)
            return 0

        # Pre-write phase: open a run audit row inside the transaction so a
        # crash later leaves a 'failed' record, not silence.
        with conn.cursor() as cur:
            version = next_version(cur)
            log.info("Writing version=%d", version)
            run_id = start_run(cur, version, params)

            # Resolve labels (Jaccard stability then OpenAI fallback).
            central_ids_by_media = _collect_central_ids_by_media(
                titles, central_indices_per_cluster,
            )
            genre_map = fetch_title_genres_bulk(cur, central_ids_by_media)
            previous_raw = fetch_previous_run(cur)
            previous = [
                PreviousCluster(
                    id=p.id, label=p.label, description=p.description,
                    is_curated=p.is_curated, tmdb_ids=p.tmdb_ids,
                )
                for p in previous_raw
            ]

            openai_failures = 0
            mood_rooms_rows = []
            mood_room_titles_rows = []

            for cid in cluster_result.cluster_ids:
                member_mask = cluster_result.labels == cid
                member_tmdb_ids = [
                    titles[i].tmdb_id for i in np.where(member_mask)[0]
                ]
                central_titles_meta = [
                    _title_meta(titles, i, genre_map)
                    for i in central_indices_per_cluster[cid]
                ]
                resolved = resolve_cluster_label(
                    new_cluster_tmdb_ids=member_tmdb_ids,
                    title_meta_for_labelling=central_titles_meta,
                    previous_clusters=previous,
                    client=openai_client,
                )
                if resolved.openai_failed:
                    openai_failures += 1

                mood_rooms_rows.append((
                    resolved.id,
                    resolved.label,
                    resolved.description,
                    cluster_result.centroids[cid],
                    params,
                    resolved.is_curated,
                    int(member_mask.sum()),
                    version,
                ))
                for i in np.where(member_mask)[0]:
                    t = titles[i]
                    mood_room_titles_rows.append((
                        resolved.id,
                        t.tmdb_id,
                        t.media_type,
                        float(cluster_result.centrality[i]),
                    ))

            log.info(
                "Writing %d mood_rooms and %d mood_room_titles (openai_failures=%d)",
                len(mood_rooms_rows), len(mood_room_titles_rows), openai_failures,
            )
            write_mood_rooms(cur, mood_rooms_rows)
            write_mood_room_titles(cur, mood_room_titles_rows)

            error_note = None
            if openai_failures:
                error_note = f"{openai_failures} cluster(s) got placeholder labels due to OpenAI failure"

            finish_run(
                cur, run_id,
                status="success",
                cluster_count=len(cluster_result.cluster_ids),
                catalogue_coverage_pct=coverage_pct(cluster_result.labels),
                noise_count=int((cluster_result.labels == -1).sum()),
                error_message=error_note,
            )

        conn.commit()
        log.info("Run complete in %.1fs", time.time() - start_ts)
        return 0


def _run_pipeline_with_guard(dry_run: bool) -> int:
    try:
        return _run_pipeline(dry_run)
    except Exception as exc:
        # Never let psycopg2/OpenAI error messages echo the connection string.
        message = redact(str(exc))
        log.error("Run failed: %s", message)
        if dry_run:
            return 1
        # Try to stamp a 'failed' audit row in a fresh connection + transaction.
        try:
            with connect() as conn:
                conn.autocommit = False
                with conn.cursor() as cur:
                    version = next_version(cur)
                    run_id = start_run(cur, version, cluster_params_payload())
                    finish_run(
                        cur, run_id,
                        status="failed",
                        error_message=message,
                    )
                conn.commit()
        except Exception as audit_exc:  # noqa: BLE001 - best-effort audit
            log.error("Also failed to record audit row: %s", redact(str(audit_exc)))
        return 1


def main(argv: list[str] | None = None) -> int:
    _setup_logging()
    parser = argparse.ArgumentParser(description="Recluster mood rooms")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run HDBSCAN and print cluster summary; no writes, no OpenAI calls.",
    )
    parser.add_argument("--seed", type=int, default=None, help="Optional RNG seed")
    args = parser.parse_args(argv)

    if args.seed is not None:
        random.seed(args.seed)
        np.random.seed(args.seed)

    return _run_pipeline_with_guard(args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
