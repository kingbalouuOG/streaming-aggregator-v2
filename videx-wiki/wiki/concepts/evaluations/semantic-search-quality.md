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

## How to re-run

```bash
OPENAI_API_KEY=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run eval:search-semantic
```

CI runs it from `.github/workflows/search-semantic-eval.yml`. Raise the thresholds when `scripts/search/eval-moods.ts` gives a second independent reading; do not raise them by editing the expected sets to match what the engine returned, which would turn the fixture into a mirror.
