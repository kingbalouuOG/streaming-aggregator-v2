"""Cluster labelling: stability preservation (Jaccard) + OpenAI structured output.

Three-tier fallback per Kickoff Brief 4.4:
  1. Jaccard >= 0.8 against a previous cluster -> reuse previous label, id,
     description, and is_curated flag. No OpenAI call.
  2. New/shifted cluster + OpenAI succeeds + validation passes -> generated
     label, is_curated=False.
  3. New/shifted cluster + OpenAI fails OR validation fails -> placeholder
     label "Cluster {short_uuid}", is_curated=False.

The prompt is governed by the "Mood Rooms Relabelling Brief" (April 2026,
approved by Joe). Pattern C is the default (occasion/mood + content
marker); Pattern B is the fallback for regional-language clusters. A
running list of already-generated labels is threaded into each call so
the LLM can avoid vocabulary collisions within a single run — this was
the single biggest quality fix identified during run #2 review.
"""

from __future__ import annotations

import json
import logging
import re
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


# Headline-noun vocabulary that the old prompt over-used. Checked
# programmatically after the LLM returns; a hit in the label tokens
# (case-insensitive) triggers the placeholder fallback even if the LLM
# claims forbidden_words_check=True. Derived from brief 2.3 plus the
# forbidden-phrasing fragments called out in the system prompt.
FORBIDDEN_WORDS: frozenset[str] = frozenset({
    "whispers",
    "echoes",
    "shadows",
    "whimsical",
    "tales",
    "chronicles",
    "realm",
    "allure",
    "reverie",
    "dreamscape",
    "odyssey",
    "tapestry",
    # Generic "Unveiled"/"Unleashed" suffixes called out in the prompt.
    "unleashed",
    "unveiled",
})


# Compound-noun carve-outs (IN-461). A forbidden single token is permitted
# when it appears as part of one of these established multi-word phrases,
# which name a concrete, predictable category rather than the generic
# evocative usage the forbidden list targets (e.g. "Fairy Tales" the genre
# vs. bare "Tales" / "Tales of Destiny").
#
# Surfaced by the mood-room recluster review: the generated label "Bedtime
# Fairy Tales" is carried across runs by Jaccard stability but a fresh
# regeneration (cluster drift below the 0.8 threshold) would be wrongly
# rejected by the flat token check and fall back to a "Cluster {uuid}"
# placeholder. Phrases are matched case-insensitively against the whole
# label. Keep this list tight — every entry is a deliberate exception.
ALLOWED_COMPOUNDS: frozenset[str] = frozenset({
    "fairy tales",
})


log = logging.getLogger(__name__)


@dataclass(frozen=True)
class TitleMeta:
    tmdb_id: int
    media_type: str
    title: str
    year: int | None
    genres: list[str]
    overview: str
    original_language: str | None


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
    `openai_failed` is True only when we intended to call OpenAI but
    the call or validation failed; not set for stable matches.
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
                "label": {
                    "type": "string",
                    "description": "2-4 word label, Title Case, no punctuation.",
                },
                "description": {
                    "type": "string",
                    "description": "One plain sentence, max 20 words.",
                },
                "pattern_used": {
                    "type": "string",
                    "enum": ["C", "B"],
                    "description": "Which pattern was chosen.",
                },
                "forbidden_words_check": {
                    "type": "boolean",
                    "description": "True if no forbidden words appear in the label.",
                },
            },
            "required": ["label", "description", "pattern_used", "forbidden_words_check"],
            "additionalProperties": False,
        },
    },
}


_SYSTEM_PROMPT_TEMPLATE = """\
You are naming a mood room - a discovery tile shown to UK users on a streaming app. Your job is to produce a label that lets a user understand what's in the room at a glance, paired with a one-sentence description.

The mood rooms row is titled "Mood Rooms for Tonight". Labels should reinforce occasion-led framing where appropriate.

LABELLING RULES

Pattern selection:
- DEFAULT: Pattern C (occasion or mood with content marker). Frame the room around when or how a user would watch the content, paired with a clear content marker.
  Examples: "Saturday Night Action", "True Crime Deep Dives", "Cosy British Comedy", "Sunday Period Drama", "Date Night Rom-Coms".

- FALLBACK: Pattern B (descriptive) when the room is defined by a non-English language or specific regional cinema/TV industry. The region or language IS the appeal; mood framing is forced and reads worse.
  Examples: "Tamil Crime Drama", "Bollywood Romance", "Italian Crime Drama", "Spanish-Language Drama", "Turkish Drama", "Polish Crime".

Decision rule for Pattern C vs Pattern B:
- If 60%+ of titles share a non-English original_language, use Pattern B.
- If 60%+ of titles share a specific regional industry (Bollywood, Tamil cinema, K-drama, Nordic noir, etc.), use Pattern B.
- Otherwise, use Pattern C.

Format:
- 2 to 4 words. Title Case. No punctuation.
- One descriptor maximum (adjective or qualifier). "Dark K-Drama" is fine; "Dark Late-Night Korean Crime Drama" is not.
- The label must be predictable from the content. A UK user reading only the label, with no description, must be able to predict the broad category.

Forbidden words (never use as the headline noun):
- Whispers, Echoes, Shadows, Whimsical, Tales, Chronicles, Realm, Allure, Reverie, Dreamscape, Odyssey, Tapestry.
- Avoid generic evocative phrasings like "Hidden ___", "___ of Destiny", "___ of Valor", "___ Unleashed", "___ Unveiled".
- "Showcase" is allowed only in established phrases like "Stand-Up Showcase". Otherwise avoid.

Description (separate field):
- One plain sentence. Max 20 words.
- States who would enjoy the room or what defines it.
- Does not start with "A collection of..." or "Featuring..."
- Does not rescue a vague label. The description complements; the label leads.

GROUNDING

Derive the label from the actual titles provided. The 20 most-central titles are listed with title, year, media_type, original_language, genres, and a short overview. Pay attention to:
- original_language (decisive for Pattern B fallback)
- year range (era can be a useful descriptor: "Classic", "90s", "Modern")
- genre overlap across titles (defines the content marker)
- thematic patterns (defines the mood adjective)

If the cluster is genuinely incoherent (titles don't share a clear theme), prefer a generic-but-honest label like "Mixed Drama" over a label that misrepresents.

PREVIOUSLY USED LABELS IN THIS RUN

The labels already generated for other clusters in this run are listed below. Avoid duplicating themes or vocabulary across clusters. If two clusters could plausibly take similar labels, differentiate them on the dimension that distinguishes their content (era, region, sub-genre, tone).

{previous_labels_block}"""


_USER_PROMPT_HEADER = """\
Cluster ID: {cluster_id}
Cluster size: {n_titles} titles
Most central {n_listed} titles:

"""


def _first_sentence(overview: str) -> str:
    """Return the first sentence of `overview`, trimmed and deduped of whitespace."""
    cleaned = (overview or "").strip().replace("\n", " ")
    if not cleaned:
        return ""
    # Split on ". " (sentence boundary) or "? "/"! " for the rare case.
    parts = re.split(r"(?<=[.!?])\s+", cleaned, maxsplit=1)
    first = parts[0].strip()
    # Trim runaway sentences to keep the prompt compact.
    if len(first) > 240:
        first = first[:237].rstrip() + "..."
    return first


def _previous_labels_block(previous_labels: list[str]) -> str:
    """Render the injected-labels section for the system prompt.

    On the first cluster of a run the list is empty. We still render a
    visible placeholder so the LLM gets an explicit signal that this is
    the first generation rather than receiving an empty / ambiguous slot.
    """
    if not previous_labels:
        return "(no prior labels in this run yet)"
    return "\n".join(f"- {lbl}" for lbl in previous_labels)


def _build_prompt(
    titles: list[TitleMeta],
    previous_labels: list[str],
    cluster_id: int | str = "(current)",
) -> list[dict]:
    listed = titles[:OPENAI_MAX_TITLES_PER_CLUSTER]
    rows = []
    for t in listed:
        year = f", {t.year}" if t.year else ""
        genres = ", ".join(t.genres) if t.genres else "unspecified"
        lang = t.original_language or "unknown"
        overview = _first_sentence(t.overview)
        rows.append(
            f"- Title: {t.title} ({t.media_type}{year})\n"
            f"  Language: {lang}\n"
            f"  Genres: {genres}\n"
            f"  Overview: {overview}"
        )

    system = _SYSTEM_PROMPT_TEMPLATE.format(
        previous_labels_block=_previous_labels_block(previous_labels),
    )
    user = (
        _USER_PROMPT_HEADER.format(
            cluster_id=cluster_id,
            n_titles=len(titles),
            n_listed=len(listed),
        )
        + "\n".join(rows)
        + "\n\nGenerate a label and description following the rules above."
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _validate_label(label: str, self_check: bool) -> None:
    """Raise ValueError if the label violates the forbidden-word rules.

    Two layers: the LLM's own self-report (which it can lie about) and a
    programmatic token overlap against FORBIDDEN_WORDS (which it cannot).
    """
    if not self_check:
        raise ValueError("LLM reported forbidden-word violation")
    lowered = label.lower()
    tokens = {t.strip(".,!?;:()'\"").lower() for t in label.split()}
    hits = tokens & FORBIDDEN_WORDS
    # Drop hits that are covered by an allowed compound noun (IN-461).
    if hits:
        for phrase in ALLOWED_COMPOUNDS:
            if phrase in lowered:
                hits -= set(phrase.split())
    if hits:
        raise ValueError(f"label contains forbidden word(s): {sorted(hits)}")


def _generate_label(
    client: OpenAI,
    titles: list[TitleMeta],
    previous_labels: list[str],
    cluster_id: int | str = "(current)",
) -> tuple[str, str]:
    """Call OpenAI and validate. Raises on any API failure or validation violation."""
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        temperature=0,
        response_format=_SCHEMA,
        messages=_build_prompt(titles, previous_labels, cluster_id),
        timeout=OPENAI_TIMEOUT_SECONDS,
    )
    content = response.choices[0].message.content
    if not content:
        raise ValueError("OpenAI returned empty content")
    parsed = json.loads(content)
    label = parsed["label"].strip()
    description = parsed["description"].strip()
    self_check = bool(parsed.get("forbidden_words_check", False))
    if not label or not description:
        raise ValueError("OpenAI returned empty label or description")
    _validate_label(label, self_check)
    return label, description


def _placeholder_label() -> tuple[uuid.UUID, str]:
    fresh = uuid.uuid4()
    return fresh, f"Cluster {str(fresh)[:8]}"


def probe_openai_label(
    client: OpenAI,
    titles: list[TitleMeta],
    previous_labels: list[str] | None = None,
    cluster_id: int | str = "(probe)",
) -> tuple[str, str]:
    """One-shot label call used by the --dry-run probe.

    Bypasses Jaccard stability so we always hit OpenAI. The purpose is to
    verify the API shape and credentials live, before any real run writes.
    `previous_labels` defaults to empty so existing probe callers don't
    break; for a proper multi-probe collision check the caller should
    thread successful probe labels back through.
    """
    return _generate_label(client, titles, previous_labels or [], cluster_id)


def resolve_cluster_label(
    new_cluster_tmdb_ids: list[int],
    title_meta_for_labelling: list[TitleMeta],
    previous_clusters: Iterable[PreviousCluster],
    client: OpenAI | None,
    previous_labels: list[str] | None = None,
    cluster_id: int | str = "(current)",
) -> LabelledCluster:
    """Resolve one new cluster to a LabelledCluster.

    `title_meta_for_labelling` is the 20 most-central titles for this
    cluster; the caller picks them.

    `client` may be None during --dry-run; we then skip OpenAI and fall
    through to the placeholder path.

    `previous_labels` is the running accumulator of labels generated
    earlier in this run, used to avoid vocabulary collisions. Safe to
    pass None (treated as empty list).
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
        label, description = _generate_label(
            client, title_meta_for_labelling, previous_labels or [], cluster_id,
        )
        return LabelledCluster(
            id=uuid.uuid4(),
            label=label,
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
