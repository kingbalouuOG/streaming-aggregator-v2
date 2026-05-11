---
title: Search v2 — Phases 2 and 3 (post-Phase-1 roadmap)
status: shortlisted
horizon: post-phase-1-search
generated: 2026-05-11
parent: ../v2-strategy/Videx_v2_Search_Strategy_Annex_v0.1.md
---

# Search v2 — Phases 2 and 3

Forward-planning entry for the two phases of the search v2 strategy that sit beyond the current build. The strategy annex is the parent doc; this is a pointer + scope sketch so the work is discoverable from the forward-planning index.

## Phase 2 — Entity search (Mode B)

**Scope.** Person resolution against TMDb `/search/person`; filmography pulled from Postgres via `cast_top_5` and `director` columns; ranked by taste fit and service availability. "More from Greta Gerwig" results page. Unrecognised-person queries fall through to Mode C (semantic) cleanly rather than to a dead end.

**Why post-Phase-1.** Mechanical. No eval rig needed. Lower leverage than semantic (Phase 1 Cluster B). Ships cleanly on top of a working Phase 1 retrieval path; ahead of Phase 1 it would just be a parallel surface.

**Dependencies.** None beyond Phase 1 close. TMDb `/search/person` is currently unused; the Layer 1 metadata it needs is already populated.

**Effort.** ~2 days active work.

**Open questions.** Whether to surface entity-only results as a separate row ("Films by Greta Gerwig") inside Mode A/C results, or as a fully separate mode page. Probably mode page for unambiguous person queries, inline row for ambiguous ones. Design call at Phase 2 kick-off.

## Phase 3 — Search-as-signal and retention

**Scope.** Wire the existing `emitSearch` event + downstream click into the taste-vector update path per annex §5. Add `session_id` and `source_surface` to the `search` interaction. Retention policy on stored queries (recommendation: 90 days, mirrors `card_impressions_daily_totals` rollup). PII pass on stored queries — confirm RLS, decide whether queries are hashed for any analytics path. Zero-result query analytics surface as a read-only Studio view.

**Why post-Phase-1.** Needs Phase 1 fleet data to design the retention policy and validate that captured queries are useful. Premature ahead of any real search volume.

**Dependencies.** Phase 1 shipped to enough users to generate signal. ~2 weeks of fleet data is probably enough.

**Effort.** ~1–2 days active work plus the analytics surface (~half day).

**Open questions.** Whether query text retention is itself a privacy-policy item that needs a privacy-policy update (Phase 5.5 ships the Privacy Policy v1; Phase 3 may need a v1.1 amendment). Coordinate with whoever owns the legal docs at the time.

## Pointer back

Full strategy: `raw/v2-strategy/Videx_v2_Search_Strategy_Annex_v0.1.md`.

Phase 1 kickoff (current build): `docs/v2/Phase_Search_V2_Kickoff.md`.
