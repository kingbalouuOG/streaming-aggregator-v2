"""Cluster labelling: stability preservation (Jaccard) + OpenAI structured output.

Three-tier fallback per Kickoff Brief §4.4:
  1. Jaccard >= 0.8 against a previous cluster -> reuse previous label, id,
     description, and is_curated flag. No OpenAI call.
  2. New/shifted cluster + OpenAI succeeds -> generated label,
     is_curated=False.
  3. New/shifted cluster + OpenAI fails -> placeholder label
     "Cluster {short_uuid}", is_curated=False. Failure is logged to the
     caller (recorded on the clustering_runs audit row).
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from typing import Iterable

from openai import OpenAI
from openai import APIError, APITimeoutError

from cluster import jaccard


STABILITY_THRESHOLD = 0.8
OPENAI_MODEL = "gpt-4o-mini"
OPENAI_TIMEOUT_SECONDS = 30.0
OPENAI_MAX_TITLES_PER_CLUSTER = 20


log = logging.getLogger(__name__)


@dataclass(frozen=True)
class TitleMeta:
    tmdb_id: int
    media_type: str
    title: str
    year: int | None
    genres: list[str]
    overview: str


@dataclass(frozen=True)
class PreviousCluster:
    """A cluster from the previous run, used for stability matching."""

    id: uuid.UUID
    label: str
    description: str | None
    is_curated: bool
    tmdb_ids: list[int]


@dataclass(frozen=True)
class LabelledCluster:
    """Resolved label for a new cluster.

    `id` is either the preserved UUID (stable match) or a fresh one.
    `openai_failed` is True only when we intended to call OpenAI but it
    failed; not set for stable matches.
    """

    id: uuid.UUID
    label: str
    description: str | None
    is_curated: bool
    openai_failed: bool


_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "mood_room_label",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "A 2-4 word room name."},
                "description": {
                    "type": "string",
                    "description": "A single sentence describing the taste neighbourhood.",
                },
            },
            "required": ["name", "description"],
            "additionalProperties": False,
        },
    },
}


def _build_prompt(titles: list[TitleMeta]) -> list[dict]:
    rows = []
    for t in titles[:OPENAI_MAX_TITLES_PER_CLUSTER]:
        year = f" ({t.year})" if t.year else ""
        genres = ", ".join(t.genres) if t.genres else "unspecified"
        overview = (t.overview or "").strip().replace("\n", " ")
        if len(overview) > 240:
            overview = overview[:237] + "..."
        rows.append(f"- {t.title}{year} [{genres}]: {overview}")

    system = (
        "You label clusters of films and TV shows that share a taste "
        "neighbourhood. Produce a short evocative room name (2-4 words) "
        "and a single sentence describing what the titles have in common "
        "at a mood or aesthetic level, not just a genre label."
    )
    user = (
        "Here are up to 20 titles most central to one cluster. Give the "
        "room a name and description.\n\n" + "\n".join(rows)
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _generate_label(client: OpenAI, titles: list[TitleMeta]) -> tuple[str, str]:
    """Call OpenAI. Raises on any API failure or schema violation."""
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        temperature=0,
        response_format=_SCHEMA,
        messages=_build_prompt(titles),
        timeout=OPENAI_TIMEOUT_SECONDS,
    )
    content = response.choices[0].message.content
    if not content:
        raise ValueError("OpenAI returned empty content")
    parsed = json.loads(content)
    name = parsed["name"].strip()
    description = parsed["description"].strip()
    if not name or not description:
        raise ValueError("OpenAI returned empty name or description")
    return name, description


def _placeholder_label() -> tuple[uuid.UUID, str]:
    fresh = uuid.uuid4()
    return fresh, f"Cluster {str(fresh)[:8]}"


def resolve_cluster_label(
    new_cluster_tmdb_ids: list[int],
    title_meta_for_labelling: list[TitleMeta],
    previous_clusters: Iterable[PreviousCluster],
    client: OpenAI | None,
) -> LabelledCluster:
    """Resolve one new cluster to a LabelledCluster.

    `title_meta_for_labelling` should already be the 20 most-central titles
    for this cluster; the caller picks them.

    `client` may be None during --dry-run; we then skip OpenAI and fall
    through to the placeholder path (which is what --dry-run wants to show).
    """
    best_match: PreviousCluster | None = None
    best_score = 0.0
    for prev in previous_clusters:
        score = jaccard(new_cluster_tmdb_ids, prev.tmdb_ids)
        if score > best_score:
            best_score = score
            best_match = prev

    if best_match is not None and best_score >= STABILITY_THRESHOLD:
        return LabelledCluster(
            id=best_match.id,
            label=best_match.label,
            description=best_match.description,
            is_curated=best_match.is_curated,
            openai_failed=False,
        )

    if client is None:
        fresh_id, placeholder = _placeholder_label()
        return LabelledCluster(
            id=fresh_id,
            label=placeholder,
            description=None,
            is_curated=False,
            openai_failed=False,
        )

    try:
        name, description = _generate_label(client, title_meta_for_labelling)
        return LabelledCluster(
            id=uuid.uuid4(),
            label=name,
            description=description,
            is_curated=False,
            openai_failed=False,
        )
    except (APIError, APITimeoutError, ValueError, json.JSONDecodeError, KeyError) as exc:
        log.warning("OpenAI labelling failed for new cluster: %s", exc)
        fresh_id, placeholder = _placeholder_label()
        return LabelledCluster(
            id=fresh_id,
            label=placeholder,
            description=None,
            is_curated=False,
            openai_failed=True,
        )
