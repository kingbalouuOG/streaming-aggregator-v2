"""HDBSCAN clustering helpers for the mood rooms pipeline.

Pure functions over numpy arrays. No I/O, no DB, no env.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import hdbscan
import numpy as np


HDBSCAN_MIN_CLUSTER_SIZE = 50
HDBSCAN_MIN_SAMPLES = 5
HDBSCAN_METRIC = "euclidean"


@dataclass(frozen=True)
class ClusterResult:
    """Output of a clustering run.

    Arrays are aligned by index with the input `tmdb_ids` / `embeddings`.
    """

    labels: np.ndarray          # shape (N,), int; -1 = noise, else cluster id
    centroids: dict[int, np.ndarray]  # cluster_id -> unit-norm centroid (1536,)
    centrality: np.ndarray      # shape (N,), float32; cosine distance to own centroid
    cluster_ids: list[int]      # sorted unique non-noise cluster ids


def l2_normalise(vectors: np.ndarray) -> np.ndarray:
    """Row-wise L2 normalisation. Zero rows are left as zero."""
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0.0] = 1.0
    return vectors / norms


def run_hdbscan(embeddings: np.ndarray) -> ClusterResult:
    """Fit HDBSCAN on L2-normalised embeddings and compute centroids + centrality.

    Parameters are fixed constants at the top of this module. Treat them as
    a starting point that can be tuned if the IN-457 fallback is triggered.
    Caller is responsible for ensuring input is already L2-normalised; we
    normalise defensively because HDBSCAN's euclidean metric on unit vectors
    is equivalent to cosine distance.
    """
    normalised = l2_normalise(embeddings)

    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=HDBSCAN_MIN_CLUSTER_SIZE,
        min_samples=HDBSCAN_MIN_SAMPLES,
        metric=HDBSCAN_METRIC,
        core_dist_n_jobs=1,
    )
    labels = clusterer.fit_predict(normalised).astype(np.int64)

    cluster_ids = sorted(int(c) for c in np.unique(labels) if c != -1)

    centroids: dict[int, np.ndarray] = {}
    for cid in cluster_ids:
        members = normalised[labels == cid]
        centroid = members.mean(axis=0)
        norm = np.linalg.norm(centroid)
        if norm > 0.0:
            centroid = centroid / norm
        centroids[cid] = centroid.astype(np.float32)

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

    Stored on every `mood_rooms` row and on the `clustering_runs` audit row
    so re-runs can compare like-for-like.
    """
    return {
        "algorithm": "hdbscan",
        "min_cluster_size": HDBSCAN_MIN_CLUSTER_SIZE,
        "min_samples": HDBSCAN_MIN_SAMPLES,
        "metric": HDBSCAN_METRIC,
        "hdbscan_version": hdbscan.__version__,
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
