"""Postgres I/O for the mood rooms pipeline.

Uses psycopg2 with Supabase's direct PostgreSQL connection (per IN-456).
PostgREST / supabase-py would cap embedding bulk pulls at PGRST_MAX_ROWS;
the direct connection has no such cap.

Security: the connection string is a superuser credential. Never log it,
never echo it, never include it in error messages. `redact` scrubs every
string that might carry it before we write to the clustering_runs audit row.
"""

from __future__ import annotations

import logging
import os
import re
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Iterator

import numpy as np
import psycopg2
from psycopg2.extras import Json, execute_values


CONNECT_TIMEOUT_SECONDS = 30
STATEMENT_TIMEOUT_MS = 300_000  # 5 minutes per statement


log = logging.getLogger(__name__)


@dataclass(frozen=True)
class TitleRow:
    tmdb_id: int
    media_type: str
    title: str
    release_year: int | None
    overview: str
    embedding: np.ndarray


@dataclass(frozen=True)
class PreviousClusterRow:
    id: uuid.UUID
    label: str
    description: str | None
    is_curated: bool
    tmdb_ids: list[int]


_CONNECTION_STRING_ENV = "SUPABASE_CONNECTION_STRING"
_PG_URL_PATTERN = re.compile(r"postgresql://[^@\s]+@", re.IGNORECASE)


def redact(message: str) -> str:
    """Scrub credentials from a log/error string.

    Two layers: exact match on the env var, then regex on any
    `postgresql://user:pw@` prefix that survives exception formatting.
    """
    if not message:
        return ""
    scrubbed = message
    conn = os.environ.get(_CONNECTION_STRING_ENV)
    if conn:
        scrubbed = scrubbed.replace(conn, "[REDACTED_CONNECTION_STRING]")
    scrubbed = _PG_URL_PATTERN.sub("postgresql://[REDACTED]@", scrubbed)
    return scrubbed


@contextmanager
def connect() -> Iterator[psycopg2.extensions.connection]:
    conn_string = os.environ[_CONNECTION_STRING_ENV]
    conn = psycopg2.connect(
        conn_string,
        connect_timeout=CONNECT_TIMEOUT_SECONDS,
        options=f"-c statement_timeout={STATEMENT_TIMEOUT_MS}",
    )
    try:
        yield conn
    finally:
        conn.close()


def next_version(cur) -> int:
    """Return prev_version + 1. First run sees prev_version == 0."""
    cur.execute("SELECT COALESCE(MAX(version), 0) FROM mood_rooms")
    prev = cur.fetchone()[0]
    return int(prev) + 1


def start_run(cur, version: int, cluster_params: dict) -> uuid.UUID:
    """Insert a clustering_runs row with status='running' and return its id."""
    cur.execute(
        """
        INSERT INTO clustering_runs (status, cluster_params, version)
        VALUES ('running', %s, %s)
        RETURNING id
        """,
        (Json(cluster_params), version),
    )
    return cur.fetchone()[0]


def finish_run(
    cur,
    run_id: uuid.UUID,
    *,
    status: str,
    cluster_count: int | None = None,
    catalogue_coverage_pct: float | None = None,
    noise_count: int | None = None,
    error_message: str | None = None,
) -> None:
    cur.execute(
        """
        UPDATE clustering_runs
        SET status = %s,
            completed_at = NOW(),
            cluster_count = %s,
            catalogue_coverage_pct = %s,
            noise_count = %s,
            error_message = %s
        WHERE id = %s
        """,
        (
            status,
            cluster_count,
            catalogue_coverage_pct,
            noise_count,
            redact(error_message) if error_message else None,
            run_id,
        ),
    )


def fetch_embeddings(cur) -> list[TitleRow]:
    """Pull all titles with embeddings, including media_type for mood_room_titles.

    Embeddings live in the `titles.embedding` column as pgvector; psycopg2
    returns them as their text representation `[v1, v2, ...]`. We parse into
    np.ndarray here so the pipeline can work in numpy end-to-end.
    """
    cur.execute(
        """
        SELECT tmdb_id, media_type, title, release_year, COALESCE(overview, ''),
               embedding::text
        FROM titles
        WHERE embedding IS NOT NULL
        """
    )
    rows: list[TitleRow] = []
    for tmdb_id, media_type, title, release_year, overview, emb_text in cur:
        vec = np.fromstring(emb_text.strip("[]"), sep=",", dtype=np.float32)
        rows.append(
            TitleRow(
                tmdb_id=int(tmdb_id),
                media_type=media_type,
                title=title,
                release_year=release_year,
                overview=overview,
                embedding=vec,
            )
        )
    return rows


def fetch_title_genres_bulk(cur, tmdb_ids_by_media: dict[str, list[int]]) -> dict[tuple[int, str], list[str]]:
    """Return {(tmdb_id, media_type): [genre_name, ...]} for the given titles.

    Called once per run for the most-central titles selected for labelling,
    not for every title in the catalogue.
    """
    out: dict[tuple[int, str], list[str]] = {}
    for media_type, ids in tmdb_ids_by_media.items():
        if not ids:
            continue
        cur.execute(
            """
            SELECT tmdb_id, genre_name
            FROM title_genres
            WHERE media_type = %s AND tmdb_id = ANY(%s)
            """,
            (media_type, ids),
        )
        for tmdb_id, genre_name in cur:
            out.setdefault((int(tmdb_id), media_type), []).append(genre_name)
    return out


def fetch_previous_run(cur) -> list[PreviousClusterRow]:
    """Load clusters from the latest mood_rooms version. Empty on first run."""
    cur.execute(
        """
        SELECT m.id, m.label, m.description, m.is_curated,
               COALESCE(array_agg(mrt.tmdb_id), ARRAY[]::integer[])
        FROM mood_rooms m
        LEFT JOIN mood_room_titles mrt ON mrt.mood_room_id = m.id
        WHERE m.version = (SELECT MAX(version) FROM mood_rooms)
        GROUP BY m.id
        """
    )
    rows: list[PreviousClusterRow] = []
    for mid, label, description, is_curated, tmdb_ids in cur:
        rows.append(
            PreviousClusterRow(
                id=mid,
                label=label,
                description=description,
                is_curated=bool(is_curated),
                tmdb_ids=[int(t) for t in tmdb_ids if t is not None],
            )
        )
    return rows


def _vector_literal(vec: np.ndarray) -> str:
    """pgvector text format: '[v1,v2,v3,...]'."""
    return "[" + ",".join(f"{v:.8f}" for v in vec.tolist()) + "]"


def write_mood_rooms(
    cur,
    rooms: list[tuple[uuid.UUID, str, str | None, np.ndarray, dict, bool, int, int]],
) -> None:
    """Bulk insert mood_rooms.

    Each row tuple: (id, label, description, centroid, cluster_params,
    is_curated, title_count, version).
    """
    if not rooms:
        return
    records = [
        (rid, label, description, _vector_literal(centroid), Json(params), is_curated, tcount, version)
        for rid, label, description, centroid, params, is_curated, tcount, version in rooms
    ]
    execute_values(
        cur,
        """
        INSERT INTO mood_rooms
          (id, label, description, centroid, cluster_params,
           is_curated, title_count, version)
        VALUES %s
        """,
        records,
        template="(%s, %s, %s, %s::vector, %s, %s, %s, %s)",
    )


def write_mood_room_titles(
    cur,
    memberships: list[tuple[uuid.UUID, int, str, float]],
) -> None:
    """Bulk insert mood_room_titles.

    Each row tuple: (mood_room_id, tmdb_id, media_type, centrality).
    """
    if not memberships:
        return
    execute_values(
        cur,
        """
        INSERT INTO mood_room_titles
          (mood_room_id, tmdb_id, media_type, centrality)
        VALUES %s
        """,
        memberships,
    )
