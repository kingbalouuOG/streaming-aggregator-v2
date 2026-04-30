---
title: Open questions register
type: register
tags: [register, open-questions, validate]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/reference/risks-register.md
  - raw/phase-summaries/phase-1-summary.md
  - raw/phase-summaries/phase-2-summary.md
  - raw/phase-summaries/phase-3-summary.md
  - raw/phase-summaries/phase-4-summary.md
related:
  - wiki/sources/engine-strategy-v1-6-3.md
  - wiki/concepts/operations/risks-register.md
  - wiki/concepts/operations/phase-history.md
  - wiki/registers/pre-launch-blockers.md
---

# Open questions register

Things to validate. Sourced from strategy v1.6.3 §8.2 (still-open subset), per-phase summaries, and the risks register. Refresh when a phase summary closes a question or a new one surfaces.

## From strategy v1.6.3 §8.2 — still open

| # | Question | When to validate |
|---|---|---|
| 1 | Do service fingerprints meaningfully improve cold-start? | Phase 2 (in progress; conditional pass on discrimination, real cold-start UX validation pending Phase 3+ usage data) |
| 2 | What's the right exploration ratio default? Start at 20-25%, measure in Phase 4. | Phase 4+ (pending real-user data) |
| 3 | Slider → pipeline mapping specifics. Confirm exact weight ranges empirically. | Phase 4+ (mappings shipped per IN-403; tune from real usage) |
| 4 | Watched-grid title selection algorithm — how to pick 6 titles per round so rounds produce differentiated, informative slices. Implementation detail: parking-lot IN-OB-002. | Phase 3 onboarding usage data |
| 6 | Auto-generated taste summary quality. Qualitative review of LLM-generated summaries before launch. | Pre-launch |
| 7 | Genre taxonomy validation. Final taxonomy reviewed during implementation (IN-OB-001). | Pending |
| 8 | Negative dwell signal calibration. Are the proposed weights the right starting points? | Phase 5+ (real usage) |
| 9 | Is pg_partman automatically creating monthly partitions as expected? | First month after Phase 0 ticks over (IN-XPS-003) |

## From strategy v1.6.3 §8.3 — deferred strategic questions

| Question | Trigger to revisit |
|---|---|
| When does collaborative filtering become viable? | ~10K MAU with regular activity |
| Do we eventually train our own item tower? | ~50K MAU with 6+ months of interaction data |
| Is arthouse coverage (MUBI, BFI, Curzon) worth adding? | Later strategic question |
| Do Mood Rooms evolve into user-shareable "list-rooms"? | After mood rooms are proven |

## From phase summaries

### From Phase 1 summary

- Backfill cost trivial; future re-embeddings cheap. **Open**: when does Phase 1.5 (Videx tags) get prioritised?
- Between-cohort cosine thresholds may need revision for Phase 3 (within/between **ratio** rather than absolute thresholds).

### From Phase 2 summary

- Discrimination threshold tuning: if cold-start quality underperforms in Phase 3 testing, weight by service exclusivity OR add recency decay to selection criterion. Phase 2.6 already discharged exclusivity weighting (5/13 services improved); curation-based refinement (IN-261) still parked.

### From Phase 3 summary

- For You loading performance ~1-2s. Further optimisation possible by moving availability filter into the pgvector RPC or adding persistent client-side cache.
- Supabase type generation: full `<Database>` generic deferred to Phase 5/6 (47 pre-existing errors across 6 out-of-scope files).

### From Phase 4 summary

- Contextual placeholder is load-bearing for the weight table. When Phase 5 ships a real `computeContextualScore()`, the 62.5/25/12.5 split needs re-evaluation.
- Coming Soon data source: `titles` doesn't carry future release dates. If Phase 5 wants contextual signals on Coming Soon, sync needs a companion fetcher for unreleased titles.
- Per-Service Charts depend on Supabase `streaming_availability` data; row may not populate for sparsely-covered services (BBC iPlayer empty).
- Hidden Gems thresholds still Phase 3 values. Tune during Phase 5 from observed engagement.
- Shared candidate pool size 500 is untuned. Phase 5 could investigate whether 300 is sufficient.

### From Phase 4.5 (no end-of-phase summary file yet)

- Coverage plateau at 53.5% — re-evaluate after 3 monthly runs (IN-459) if engagement data reveals under-served titles in sparse regions.

## From risks register (open questions section)

- Will Phase 5 contextual scoring ship before launch or be deferred?
- Does Critically Acclaimed Home row require manual curation in addition to OMDB-driven gating?
- iOS launch timing — currently Capacitor configured for Android only.
- Whether to publish Mood Room labels as user-editable favourites in a future phase.

## Phase-9-style questions worth revisiting

- "Updated your recommendations" feedback toast — deferred per detail page spec §8.8; ship without, add if users ask "is this doing anything?"
- Save for Later distinction (vs Watchlist) — deferred to v2.5 unless onboarding/design tests surface a clear need.
- Dedicated mood rooms browse surface — deferred to v2.5 once "Mood Rooms for Tonight" row engagement data is in.
- Conversational discovery (Pillar 4 / Phase 7 / v3) — see [v3-conversational-discovery](../concepts/forward-planning/v3-conversational-discovery.md) for the proposed Graphiti+Kuzu approach.

## How to use this register

1. Scan for items relevant to the current phase or sprint.
2. When closing one, mark it resolved in the originating source (strategy doc, phase summary, risks register).
3. When adding a new one, append it to the relevant source first; this register is regenerated from those.
