---
title: Source — Recommendation: quick filters + search presets (2026-09-08)
type: source
tags: [browse, search, filters, presets, recommendation, privacy, retention]
created: 2026-09-08
updated: 2026-09-08
sources:
  - raw/plans/2026-09-08-002-recommendation-quick-filters-and-search-presets.md
  - raw/plans/2026-09-08-001-brief-quick-filters-and-search-presets.md
related:
  - wiki/sources/quick-filters-and-search-presets-brief-2026-09-08.md
  - wiki/concepts/architecture/signal-architecture.md
  - wiki/concepts/product/privacy-and-gdpr.md
  - wiki/concepts/architecture/mood-rooms.md
  - wiki/registers/parking-lot.md
---

# Source: Recommendation — quick filters + search presets

Answers the [brief](quick-filters-and-search-presets-brief-2026-09-08.md). Everything in it was verified against the codebase **and the live database** on 2026-09-08. All decisions closed by Joe the same day. Four execution sessions in §10; **Session 1 (search-term logging) shipped 2026-09-08** — the rest are not started.

## Three findings that reshaped the brief (§0)

1. **Search logging already existed; native never called it.** `emitSearch` writes a `user_interactions` row (`event_type = 'search'`). Web called it from 2026-05; `native/` did not, so production held zero `search` rows. Deletion (042) and export (043/061) already covered it — what was missing was policy text and a retention position, not a table.
2. **"Documentary" is modelled three incompatible ways, and one path is a bug.** `contentAdapter` sets `type: 'doc'` on genre 99; `titleAdapter` never does (so every engine-sourced documentary is a `movie`/`tv`); Browse's Docs segment is movies-only. `applyBrowseFilters` with `contentType: 'doc'` therefore silently drops every engine-sourced documentary.
3. **Both cached surfaces can be re-sliced client-side.** The For You payload already ships `genreIds` + `type` per item, and since B5 Home is Worker-rendered and KV-cached the same way. A server-side filter on either would multiply KV entries per chip state and defeat pre-warming.

Also: there are **four** overlapping taxonomies, not three — the web For You "Refine by feeling" strip (`MOOD_REFINER_ENABLED = false`, IN-V3-003) is the fourth.

## Decisions (§1, §2, §7)

| Question | Decision |
|---|---|
| What is a "Documentary"? | TMDb **genre 99 on either media type**. Movies/TV mean `media_type` and *include* documentaries. One `isDocumentary(item)` helper; fixes finding 2 without a data migration. |
| Anime chip | **Dropped** — it is a taste cluster and a mood room, not a content type, and `originalLanguage` is only populated on the Supabase path. |
| Resulting strip | `All · Movies · TV · Documentaries` |
| What is a filtered page? | **Same page, filtered in place.** Rails apply the predicate; a rail with < 4 survivors hides; hero re-promotes; never blank — one empty-state card if everything hides. |
| Refetch on tap? | **No.** One lazy backfill for Documentaries only, after the first tap. |
| For You | Filter **client-side**; do **not** add a filter dimension to the KV key. One Worker change: render ~36 items per row so the filtered view draws from a longer, already-rotated list. Never backfill from `pool.matched` — it is pre-fatigue, pre-avoid-set. |
| Chip visibility | Data-driven: a chip renders only when the surface's payload has ≥ 8 matching items. "All" always renders. |
| Stickiness | **Ephemeral** — survives tab switches, resets on cold start, per-surface, never persisted. |
| Taste signal? | **Log it, do not learn from it.** A chip says "tonight", not "me"; the `contentMix` slider is the explicit control. |
| "Free" | Subscription-included, not free-to-air. |
| Web mood refiner | **Retired** — remove it, do not re-point it. |
| Raw search text retention | **30 days.** |

## Search-term logging (§5) — the part that shipped

`user_interactions` via the existing `emitSearch`, not a new table: deletion, export, RLS, session ids and the attribution join all already exist, and the recompute reads only timestamps.

- **Three event kinds, one shape**: typed query (`lookup`), preset tap (`semantic` flag-on / `filter` flag-off, logging `mood_key` not the phrase), FilterSheet apply (`filter`).
- **Settled queries only**: once per query, when results arrive **and** the text has been unchanged ≥ 1.5 s, or on submit, or on first result tap. Never per keystroke.
- **Retention**: raw text 30 days, nulled by a nightly pg_cron job on the `card_impressions_rollup` pattern; the row survives. The aggregate `search_terms_daily` has **no user column**, so it needs no delete/export coverage — and the migration must say so, so the IN-PX-54 drift check does not flag it.
- Honest about scale: at single-digit users the 30-day raw window is what Joe will actually read, and an aggregate over seven users is not meaningfully anonymous. Said out loud rather than pretended.

See [signal-architecture](../concepts/architecture/signal-architecture.md#search-events) and [privacy-and-gdpr](../concepts/product/privacy-and-gdpr.md) for what shipped.

## Measurement (§6)

Segment by `metadata.filter` stamped on impressions while a chip is active (the `exploration: true` pattern); re-run `eval:novelty` segmented the same way so a filtered session's smaller distinct-title count is not misread as a rotation regression. For presets, the hypothesis to test is **constraint-led cards out-tap vibe-led cards**; if they do not, revert to four vibe cards. Weekly **zero-result rate** by category is the retrieval-bug tripwire (>~10% is a bug to chase, not a presets problem).

## The Browse interaction model (§9)

One intent, refined in place — typed text, mood and filters stop being mutually exclusive modes and become one query that a refine row narrows. §10's Sessions 3 and 4 build it.

## Research check (§8)

Failed search is the documented abandonment point (19% leave; 29% of 18–24s). §8.1 predicts retrieval ("where is X") dominates discovery in typed queries — the 30-day raw terms are what settle that ratio, and it decides how much of the search surface should optimise for lookup versus discovery.
