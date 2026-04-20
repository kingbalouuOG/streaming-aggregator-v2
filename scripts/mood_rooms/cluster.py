"""HDBSCAN clustering helpers for the mood rooms pipeline.

Pipeline (per IN-457 fallback, UMAP preprocessing path):

  1. UMAP reduces 1536D OpenAI embeddings to a low-dim space (default 10D)
     using cosine distance on the raw vectors. This is required: HDBSCAN
     on raw 1536D embeddings produces 2 clusters / 10% coverage due to the
     curse of dimensionality (see Parking Lot IN-457).
  2. HDBSCAN on the low-dim output (euclidean on UMAP space) produces the
     cluster assignments.
  3. Centroids and centrality are computed in the **original 1536D space**
     so the frontend's cosineSim(tasteVector, room.centroid) still works.
     UMAP space is assignment-only, never persisted.

Pure functions over numpy arrays. No I/O, no DB, no env.
"""

from __future__ import annotations

from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version as _pkg_version
from typing import Sequence

import hdbscan
import numpy as np
import umap


EMBEDDING_DIM = 1536

UMAP_N_COMPONENTS = 10
UMAP_N_NEIGHBORS = 30  # B3: widened from 15 to smooth the manifold; reduces HDBSCAN noise rate
UMAP_MIN_DIST = 0.0
UMAP_METRIC = "cosine"
UMAP_RANDOM_STATE = 42

HDBSCAN_MIN_CLUSTER_SIZE = 30
HDBSCAN_MIN_SAMPLES = 5
HDBSCAN_METRIC = "euclidean"  # applied to UMAP space, not raw embeddings
HDBSCAN_CLUSTER_SELECTION_METHOD = "eom"  # excess-of-mass; reverted from 'leaf'
HDBSCAN_MAX_CLUSTER_SIZE = 800  # ~4% of 20K catalogue; anti-mega-cluster guard


@dataclass(frozen=True)
class ClusterResult:
    """Output of a clustering run.

    Arrays are aligned by index with the input `tmdb_ids` / `embeddings`.
    Centroids are in the **original 1536D embedding space**, not UMAP space.
    """

    labels: np.ndarray          # shape (N,), int; -1 = noise, else cluster id
    centroids: dict[int, np.ndarray]  # cluster_id -> unit-norm 1536D centroid
    centrality: np.ndarray      # shape (N,), float32; cosine distance to own centroid
    cluster_ids: list[int]      # sorted unique non-noise cluster ids


def _pkg_ver(name: str) -> str:
    try:
        return _pkg_version(name)
    except PackageNotFoundError:
        return "unknown"


def l2_normalise(vectors: np.ndarray) -> np.ndarray:
    """Row-wise L2 normalisation. Zero rows are left as zero."""
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0.0] = 1.0
    return vectors / norms


def reduce_dimensions(embeddings: np.ndarray) -> np.ndarray:
    """Project raw embeddings to a low-dim space suitable for HDBSCAN.

    Raw embeddings go in (not L2-normalised) because UMAP's cosine metric
    already handles the unit-sphere geometry; pre-normalising would change
    nothing here and confuses the input contract.
    """
    reducer = umap.UMAP(
        n_components=UMAP_N_COMPONENTS,
        n_neighbors=UMAP_N_NEIGHBORS,
        min_dist=UMAP_MIN_DIST,
        metric=UMAP_METRIC,
        random_state=UMAP_RANDOM_STATE,
    )
    reduced = reducer.fit_transform(embeddings)
    return np.asarray(reduced, dtype=np.float32)


def run_hdbscan(embeddings: np.ndarray) -> ClusterResult:
    """Full clustering pipeline: UMAP for assignment, centroids in 1536D.

    HDBSCAN receives the low-dim UMAP output. Centroids and centrality are
    computed from the **original 1536D embeddings** of the cluster members
    so that downstream cosine-similarity comparisons against the user's
    taste vector remain dimensionally consistent.

    The caller is responsible for ensuring `embeddings` is a 2D array of
    shape (N, 1536). We assert before returning to fail loudly rather
    than silently persist malformed centroids.
    """
    if embeddings.ndim != 2 or embeddings.shape[1] != EMBEDDING_DIM:
        raise ValueError(
            f"expected embeddings of shape (N, {EMBEDDING_DIM}), "
            f"got {embeddings.shape}"
        )

    reduced = reduce_dimensions(embeddings)

    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=HDBSCAN_MIN_CLUSTER_SIZE,
        min_samples=HDBSCAN_MIN_SAMPLES,
        metric=HDBSCAN_METRIC,
        cluster_selection_method=HDBSCAN_CLUSTER_SELECTION_METHOD,
        max_cluster_size=HDBSCAN_MAX_CLUSTER_SIZE,
        core_dist_n_jobs=1,
    )
    labels = clusterer.fit_predict(reduced).astype(np.int64)

    cluster_ids = sorted(int(c) for c in np.unique(labels) if c != -1)

    # Centroids: mean of the ORIGINAL 1536D members (not UMAP output),
    # L2-normalised. This is the dimensional contract the frontend expects.
    normalised = l2_normalise(embeddings)

    centroids: dict[int, np.ndarray] = {}
    for cid in cluster_ids:
        members = normalised[labels == cid]
        centroid = members.mean(axis=0)
        norm = np.linalg.norm(centroid)
        if norm > 0.0:
            centroid = centroid / norm
        centroids[cid] = centroid.astype(np.float32)

    # Assertion: every centroid must be 1536D. A dimensional mismatch here
    # silently breaks weekly-pool taste-fit scoring in the frontend.
    for cid, c in centroids.items():
        if c.shape != (EMBEDDING_DIM,):
            raise AssertionError(
                f"centroid for cluster {cid} has shape {c.shape}, "
                f"expected ({EMBEDDING_DIM},)"
            )

    # Centrality: cosine distance of each title to its own cluster centroid,
    # computed in 1536D. Low = more central.
    centrality = np.zeros(len(labels), dtype=np.float32)
    for cid, centroid in centroids.items():
        mask = labels == cid
        sims = normalised[mask] @ centroid
        centrality[mask] = (1.0 - sims).astype(np.float32)

    return ClusterResult(
        labels=labels,
        centroids=centroids,
        centrality=centrality,
        cluster_ids=cluster_ids,
    )


def cluster_params_payload() -> dict:
    """Serialisable record of the parameters used for this run.

    Captures both UMAP and HDBSCAN config with versions and seeds so that
    a future run on the same catalogue with the same params should be
    reproducible. Stored on every `mood_rooms` row and on the
    `clustering_runs` audit row.
    """
    return {
        "pipeline": "umap+hdbscan",
        "umap": {
            "n_components": UMAP_N_COMPONENTS,
            "n_neighbors": UMAP_N_NEIGHBORS,
            "min_dist": UMAP_MIN_DIST,
            "metric": UMAP_METRIC,
            "random_state": UMAP_RANDOM_STATE,
            "version": _pkg_ver("umap-learn"),
        },
        "hdbscan": {
            "min_cluster_size": HDBSCAN_MIN_CLUSTER_SIZE,
            "min_samples": HDBSCAN_MIN_SAMPLES,
            "metric": HDBSCAN_METRIC,
            "cluster_selection_method": HDBSCAN_CLUSTER_SELECTION_METHOD,
            "max_cluster_size": HDBSCAN_MAX_CLUSTER_SIZE,
            "version": _pkg_ver("hdbscan"),
        },
    }


def jaccard(a: Sequence[int], b: Sequence[int]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def coverage_pct(labels: np.ndarray) -> float:
    """Proportion of input titles assigned to a cluster (i.e. not noise)."""
    if len(labels) == 0:
        return 0.0
    return float(np.sum(labels != -1)) / float(len(labels)) * 100.0
