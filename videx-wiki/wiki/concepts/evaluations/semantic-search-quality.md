---
title: Semantic search quality — first real measurement (2026-09-09)
type: concept
tags: [evaluation, search, semantic, embeddings, eval-rig, search-semantic, presets, feature-flag]
created: 2026-09-09
updated: 2026-09-09
sources:
  - scripts/test/search-semantic-fixtures.json
  - scripts/test/search-semantic-eval.ts
  - docs/plans/2026-09-08-002-recommendation-quick-filters-and-search-presets.md
related:
  - wiki/concepts/operations/phase-search-v2.md
  - wiki/registers/parking-lot.md
  - wiki/entities/codebase/rpcs.md
---

# Semantic search quality — first real measurement

The semantic-eval rig shipped in Phase Search V2 (Cluster B, B6) in May 2026 with a **two-query placeholder fixture** and was never run against real content. The presets session replaced the stub with sixteen curated entries on 2026-09-09 and ran it. This page records what that first run showed, because two of the findings change how the `search_semantic` flag should be treated and neither is visible from the code.

## What the fixture is now

Sixteen entries, in two halves that are scored differently and for a reason.

| Half | Count | What the query is | Gates the build? |
|---|---|---|---|
| Preset | 8 | The `phrase` each preset card sends to the engine, verbatim from `src/lib/content/presets.ts`, with the user-facing `sentence` recorded alongside | No — diagnostic |
| Known title | 8 | A title a user would plausibly type | Yes |

**Why only the title half gates.** A preset entry is scored against six or seven hand-picked titles out of a six-figure catalogue, so a retrieval that is entirely good but surfaces *different* good titles scores zero. Gating on that number would fail the build for being right. A known title has one right answer, so precision and MRR mean what they say and a regression is unambiguous.

Gating baseline, 2026-09-09: **precision@10 = 1.000, MRR = 0.900** across all eight titles (seven at rank 1; "the bear" at rank 5, which is fair for a two-word phrase that is also a common noun). Thresholds set to 0.9 / 0.75.

## Finding 1 — the rig was scoring rows no user can see

The rig called `match_titles_by_vector` directly and scored the raw output. The app does not: `useSemanticSearch` applies a quality floor afterwards — rating > 0, at least 20 votes, and at least 40 minutes for films.

That floor is not cosmetic. Against the raw RPC, descriptive queries returned near-literal title matches on catalogue debris with no votes at all:

| Query | Raw RPC returned |
|---|---|
| "something dark and strange for late at night" | *Late Night* (0 votes), *After Midnight* (60), *Night of Dark Shadows* (59) |
| "something easy and warm I can half-watch" | *Snug And Cozi* (0 votes), *Home Made Easy* (0), *Warm on a Cold Night* (4) |
| "something long and absorbing I can sink into" | *My Person in the Water* (3 votes), *Blue Lounge: Journey Through Emotions* (0) |

None of those can reach a user. An eval scored on them fails on results that are fine and passes on regressions that are not. The rig now applies the same floor before scoring — which, on its own, took the known-title half from 7/8 to 8/8 and fixed "everything everywhere all at once" outright.

## Finding 2 — the phrase works, the sentence does not

This is the one worth acting on. Both halves of the same string family were measured against the same engine on the same day.

**The long `phrase` retrieves the right register.**

| Preset | Top results for the phrase |
|---|---|
| `slow` | *Small Things Like These*, *The Quiet Girl*, *I'm Thinking of Ending Things*, *8½* |
| `late` | *The Haunting of Hill House*, *Marrowbone*, *The Haunting* (1963), *High Tension* |
| `comfort` | *Aftersun*, *Encanto*, *Ethel & Ernest* |

**The short `sentence` matches surface words instead.**

| Sentence | Top results |
|---|---|
| "something fast and fun where I don't have to think" | *Fastest Car*, *Fast & Furious Spy Racers*, *The Fast and the Furious*, *2 Fast 2 Furious* |
| "something easy and warm I can half-watch" | *Melting Me Softly*, *Chilly Scenes of Winter*, *Hot Frosty*, *Country Comfort* |
| "something long and absorbing I can sink into" | *The Abyss*, *Deep*, *Deep Sea*, *Deeply* |
| "something we can all watch together" | *As We See It*, *Here We Go*, *The Movies That Made Us* |

Every one of those is a word match, not an intent match: "fast", "warm", "deep"/"sink", "we".

### What follows from it

1. **The preset path is sound.** A preset tap sends the phrase, and the phrase behaves. This is the first evidence for §2.3's instruction to write phrases as full descriptions rather than two-word labels — that decision now has a measurement behind it rather than an intuition.
2. **The free-text (described) route is the weak half.** Session 3 shipped it as specified, and it is safe: `search_semantic` is per-user and default-off, the banner says *"Reading that as a feeling, not a title"* rather than pretending, and *"Search titles instead"* is one tap away. But flipping the flag turns on **both** paths, and this is the argument for not doing that on the strength of the preset path alone.
3. **This is the concrete case for §8.2's missing fourth part** — a Worker-side query-understanding step that turns free text into a phrase plus filters. The gap it closes is now measured rather than hypothesised: it is the distance between the two tables above.
4. **`Free to watch` staying phrase-less is vindicated.** Its sentence scored nothing and could not have; cost is not a property an embedding carries. That card contributes a filter, and the filter has migration 080 behind it.

## Finding 3 — the preset retrieves a documentary *about* acclaim (2026-09-09)

Found by device-testing the refine row. The *New & actually good* preset
returns **2 titles**. The catalogue holds **363** that meet its own criteria.
Three independent causes, in order of size.

> **Correction, same day.** The first write-up of this finding measured
> recency as `release_date >= current_date - 365 days`. The code does not do
> that: `buildPostFilter` compares `meta.release_year >= currentYear - 1`, a
> *year* floor. Every base rate below is re-measured with the predicate the
> code actually uses. The direction of the finding is unchanged; the
> magnitude was overstated.

### Cause 1 — the phrase describes reception, not content

The preset's phrase is *"a recent, well-reviewed film or series from the last
year that both critics and audiences rated highly"*. No film's synopsis reads
like that, because it is a statement **about** a title rather than a
description **of** one. Embedding it and asking for nearest neighbours
therefore retrieves titles whose overviews contain that vocabulary.

The two titles it returned say it outright:

| title | type | released | rating |
|---|---|---|---|
| One Battle After Another | movie | 2025-09-23 | 7.3 |
| **Mr. Scorsese** | tv | 2025-10-16 | 8.1 |

*Mr. Scorsese* is a documentary series **about a director and his critical
reception**. The query asked for well-reviewed things and retrieved a
programme about reviewing. This is Finding 2 in its purest form, and it is the
dominant term — no amount of pool-widening fixes a neighbourhood that is the
wrong neighbourhood.

The corollary is a design rule the codebase already applies elsewhere:
*Free to watch* was given `phrase: null` because cost is a fact, not a
feeling. **"New and actually good" is also a fact, not a feeling.** A card
whose whole content is two metadata predicates should carry no phrase and
resolve down the `/discover` path, where both predicates are applied
server-side across the entire catalogue instead of across 150 embedding
neighbours.

### Cause 2 — filtering after retrieval, on a thin slice

`match_titles_by_vector(vector, limit)` takes **no filter arguments**, so
`semanticRetrieval` fetches the *N* nearest neighbours and applies every
`FilterState` axis plus `minReleaseYear` as a post-filter. Shipped
`candidateLimit` is 150.

Base rates over the 34,563 embedded titles, by the year rule:

| slice | titles | share |
|---|---:|---:|
| release year ≥ currentYear − 1 | 1,690 | 4.9% |
| rated ≥ 7 with ≥ 20 votes | 6,516 | 18.9% |
| both | 363 | **1.05%** |

Survivors of a real 150-candidate pool (probe: the stored embedding for
*Conclave*):

| chip | of 150 | of 1000 |
|---|---:|---:|
| Just films | 123 | 846 |
| Under 2h | 91 | 683 |
| Higher rated | 37 | 249 |
| **Newer** | **21** | 107 |
| Newer + Higher rated | **6** | 29 |

Thin, and thinnest exactly where the preset lives. Deepening is capped anyway:
migration 076 limits the RPC to 1,000 and says why in its own error text —
past the HNSW `ef_search` ceiling the index returns roughly a thousand rows
*while reporting success*, so a deeper query silently lies.

### Cause 3 — the recent titles are not all in the catalogue

Two titles named from the New tab as obvious candidates — *Mousetrap* (2026,
rated 8) and *Mayday* (2026, rated 8) — **are not in `titles` at all**. The
only rows for either are two unrelated `Mayday` series from 2003 and 2013.
The New tab reads TMDb `/discover` live; the semantic path can only return
what has been ingested and embedded. A title absent from the catalogue is
unreachable by vector search at any pool size.

Scope of that gap is not established here and is worth its own pass.

### What "Newer" actually means, since it differs by path

| path | predicate |
|---|---|
| semantic (`buildPostFilter`) | `release_year >= currentYear - 1` — so in Sept 2026 it admits **2025 and 2026**, up to ~21 months |
| `/discover` (`useBrowseDiscover`) | `primary_release_date.gte = today - 365 days` — an exact rolling year |
| client-side (`applyBrowseFilters`) | `year >= currentYear - 1`, matching the semantic path |

The looseness is deliberate and documented in `browseFilters.ts`: `ContentItem`
carries a year, not a date, and tightening to `>= currentYear` would empty the
grid every January. Worth knowing that a chip labelled *Newer* can legitimately
return something 20 months old.

### The fix, and what it measured

`new-good` now carries `phrase: null`, joining `free` as a **fact card**. A
tap composes filters only, so it resolves down `/discover` where both
predicates are applied server-side across the whole catalogue.

Measured against Joe's real seven-service stack
(`scripts/test/newgood-path-compare.mjs`):

| path | qualifying titles | on screen |
|---|---:|---:|
| semantic (phrase + post-filter) | — | **2** |
| `/discover` (filter-only) | 99 films + 106 series = **205** | **40** |

The first card in the new grid is **Mayday** (2026, 8.0) — one of the two
titles named from the New tab as obviously missing. The other, *Mousetrap*, is
absent for cause 3 below rather than this one.

Gated eval metrics are unchanged either side of the change (p@10 1.000, MRR
0.900, threshold 0.9 / 0.75), which is the expected result: nothing about
retrieval moved, one card simply stopped calling it.

The fixture entry for this card now uses its **sentence** rather than its
retired phrase, matching how `free` is held, and its `_note` preserves the
phrase's measurement so a future session that re-adds a phrase has to justify
it against that number. The sentence scores 0.00 as well — which is the point:
neither text has a semantic answer, because the card is not a feeling.

### What was NOT changed on the strength of this

`candidateLimit` stays at 150 — raising a retrieval parameter on one probe
vector and no eval run is what this fixture rig exists to prevent. Cause 2
(filter-after-retrieval) and cause 3 (ingest coverage) both remain open under
IN-SL-005; this fix removes the card from the affected path rather than fixing
the path.

*Newer* stays on the refine row. Unlike the `cost` chip withheld from the Mode
A grid it is not inert: it does exactly what it says over a genuinely thin
slice, and the zero-result copy names it as the thing to remove. On the
`/discover` path — where the row renders for a filter-only browse — it is
applied server-side and is not thin at all.


## How to re-run

```bash
OPENAI_API_KEY=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run eval:search-semantic
```

CI runs it from `.github/workflows/search-semantic-eval.yml`. Raise the thresholds when `scripts/search/eval-moods.ts` gives a second independent reading; do not raise them by editing the expected sets to match what the engine returned, which would turn the fixture into a mirror.
