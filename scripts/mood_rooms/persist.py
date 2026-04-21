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
import psycopg2.extras
from psycopg2.extras import Json, execute_values


# Teach psycopg2 how to serialise Python uuid.UUID objects as PostgreSQL
# UUID parameters. Without this, INSERTs that pass uuid.UUID via %s fail
# with "can't adapt type 'UUID'". register_uuid is idempotent and globally
# scoped; calling it at module import time covers every connection.
psycopg2.extras.register_uuid()


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
    original_language: str | None
    embedding: np.ndarray


@dataclass(frozen=True)
class PreviousClusterRow:
    id: uuid.UUID
    label: str
    description: str | None
    is_curated: bool
    tmdb_ids: list[int]


_CONNECTION_STRING_ENV = "SUPABASE_CONNECTION_STRING"

# Layer 2: anything that looks like postgresql://user:pw@... prefix.
_PG_URL_PATTERN = re.compile(r"postgresql://[^@\s]+@", re.IGNORECASE)

# Layer 3: any non-whitespace token containing "@" and ending in ".supabase.co".
# Catches the psycopg2 "could not translate host name" case, where a password
# fragment gets concatenated with the real host before being echoed in the
# error message (e.g. `"fragment@db.project.supabase.co"`).
_SUPABASE_HOST_LEAK_PATTERN = re.compile(
    r"\S*@\S*\.supabase\.co", re.IGNORECASE,
)

# Layer 4 trigger: specific psycopg2 failure mode that we know leaks a
# password fragment into the error message text. Swap the whole message
# for a generic hint rather than trying to scrub the bits.
_HOST_TRANSLATION_HINT = (
    "Connection failed - check URL encoding of special characters in the "
    "password (@, :, /, ? must be percent-encoded in a postgresql:// URI)."
)


def redact(message: str) -> str:
    """Scrub credentials from a log/error string.

    Three layers applied in order:

      1. Exact-match replacement of the full SUPABASE_CONNECTION_STRING
         env value (catches anything that echoes the connection string
         verbatim).
      2. Regex on any surviving `postgresql://user:pw@` prefix (catches
         partial echoes and variant psycopg2 error formats).
      3. Regex on any `<stuff>@<stuff>.supabase.co` token (catches the
         specific case where a password fragment got parsed as part of
         the host name and now appears bare, without a `postgresql://`
         prefix — see psycopg2's "could not translate host name" error).

    Layer 4 (category-specific replacement for psycopg2.OperationalError
    host-translation failures) lives in `redact_exception()`.
    """
    if not message:
        return ""
    scrubbed = message
    conn = os.environ.get(_CONNECTION_STRING_ENV)
    if conn:
        scrubbed = scrubbed.replace(conn, "[REDACTED_CONNECTION_STRING]")
    scrubbed = _PG_URL_PATTERN.sub("postgresql://[REDACTED]@", scrubbed)
    scrubbed = _SUPABASE_HOST_LEAK_PATTERN.sub("[REDACTED].supabase.co", scrubbed)
    return scrubbed


def redact_exception(exc: BaseException) -> str:
    """Redact an exception's message with awareness of its type.

    Prefer this over `redact(str(exc))` when you have the exception
    object in hand, because some failure modes (notably psycopg2's
    `OperationalError: could not translate host name ...`) leak a
    password fragment into the stringified message *before* any of
    redact()'s regex anchors exist. For those, we replace the whole
    message with a generic hint rather than attempting a scrub.
    """
    if isinstance(exc, psycopg2.OperationalError):
        text = str(exc)
        if "could not translate host name" in text:
            return _HOST_TRANSLATION_HINT
    return redact(str(exc))


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
               original_language, embedding::text
        FROM titles
        WHERE embedding IS NOT NULL
        """
    )
    rows: list[TitleRow] = []
    for tmdb_id, media_type, title, release_year, overview, original_language, emb_text in cur:
        vec = np.fromstring(emb_text.strip("[]"), sep=",", dtype=np.float32)
        rows.append(
            TitleRow(
                tmdb_id=int(tmdb_id),
                media_type=media_type,
                title=title,
                release_year=release_year,
                overview=overview,
                original_language=original_language,
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
