# Brief: quick filters + preset search categories

**Status:** ANSWERED — see [2026-09-08-002 recommendation](2026-09-08-002-recommendation-quick-filters-and-search-presets.md); two claims below are now known to be wrong (search logging exists in shared lib but is unwired on native; cost IS filterable via the web's monetization mapping) — read the recommendation first · **Date:** 2026-09-08 · **Owner:** Joe

This is deliberately **not** a solution document. It states the current state (verified against the codebase on 2026-09-08), the outcome we want, and the open questions worth answering. The session picking this up should explore options and come back with a recommendation, not implement from here.

## The single goal behind both parts

**Get people to what they actually want without making them open a filter page.**

Both halves of this brief are the same problem at different grain. The explicit end state is conversational — "let me just say what I'm looking for." Everything here is a **stopgap toward that**, and should be designed so it does not become an obstacle to it.

---

# Part 1 — Quick filters on New and For You

## Current state (verified)

**The "New" page is `native/src/app/(tabs)/index.tsx`** — the file is `index.tsx` but the tab is titled `'New'` (`_layout.tsx:88`). Tab order: For You · New · Browse · Watchlist · Profile.

**The buttons already exist and already do nothing useful.** `native/src/components/BrowseChips.tsx` renders a pill strip with:

```
CATEGORIES = ['All', 'Movies', 'TV Shows', 'Docs', 'Anime']
```

It is rendered at `index.tsx:163` as `<BrowseChips onSelect={() => router.push('/browse')} />` — **the selected category is discarded and the user is navigated away to Browse.** The component already accepts an `active` prop and renders a selected state; nothing passes it. Its own header comment says *"filter wiring lands with the Browse screen"* — it was deferred and never picked up.

So this is less "build a feature" and more "finish one that was stubbed."

**What the New page is made of.** `useHomeFeed` composes heterogeneous rails from three different kinds of source:
- TMDb `discover` / `trending` — Recently added, Free tonight, Trending ribbon, Upcoming calendar
- Supabase — per-service charts, genre spotlights
- Derived — the hero (lead title lifted out of the first per-service row), editorial spotlight

These do not share a filtering mechanism. Some could filter at the API level, others would have to filter after fetch, and some (the Upcoming calendar, per-service "Top on Netflix" charts) arguably change meaning if filtered.

**What For You is made of.** A single `/v1/foryou` Worker payload with rows built server-side (`foryouRender.ts`), cached in KV keyed on user + taste-vector freshness + sliders + services.

**Filter vocabulary already exists.** `native/src/components/browseFilters.ts` defines `BrowseFilters` with `contentType: 'all' | 'movie' | 'tv' | 'doc'`, plus genres, rating, runtime, services, watched — and `FilterSheet.tsx` is the full filter UI on Browse. Any quick filter should almost certainly express itself in this existing vocabulary rather than inventing a parallel one.

## What good looks like

One tap, the page reflows in place, no modal, no navigation, no spinner. The user stays where they are.

## Open questions

1. **Is "Documentaries" a type or a genre?** TMDb models Documentary as *genre 99*, which cross-cuts both movies and TV. `browseFilters.ts` models `'doc'` as a *content type*, sitting alongside movie and tv. These two models disagree. Which one matches what a user means when they tap it — and does tapping "Documentaries" mean "documentary films" or "documentaries of any kind"?
2. **What happens to rails that cannot honour the filter?** Hide them, show them empty, or leave them unfiltered? "Top on Netflix" filtered to Movies is coherent; the Upcoming release calendar filtered to Docs may be empty most weeks. There is a real design decision about whether a filtered New page is *the same page filtered* or *a different page*.
3. **Filter in place, or refetch?** Filtering already-fetched data is instant but may leave thin or empty rails; refetching is complete but costs a round trip. Is a hybrid acceptable (instant filter, backfill behind)?
4. **Where does For You filtering happen — Worker or client?** Note the KV feed cache is keyed on user + services + sliders. Adding a filter dimension to the key multiplies cache entries and could undo the pre-warming work. Client-side filtering of the returned payload avoids that but can only filter what was already returned.
5. **Do the two surfaces need the same categories?** "Docs" makes sense on New. Does it make sense on a personalised feed, where the taste vector may mean a user effectively never sees documentaries?
6. **Is the selection sticky?** Across tab switches, app restarts, both surfaces? Or ephemeral each visit?
7. **Is a filter a taste signal?** Repeatedly filtering to Movies is arguably a preference worth learning. Or is it purely a transient view control? (This has consequences — see constraints.)
8. **What is the empty state?** A filter that returns nothing needs a designed answer, not a blank page.

## Constraints the investigation must respect

- **Do not regress the Workstream B latency work.** No new blocking round trip on page open. Cold-open time-to-content is a hard-won number.
- **Rotation and fatigue (Workstream C) must still apply *within* a filtered view** — a filtered For You that always returns the same 20 titles reintroduces the staleness problem inside the filter.
- **Reuse `BrowseFilters`** rather than adding a parallel filter model, unless there is a clear reason not to.
- If filtering becomes a taste signal (Q7), it must not corrupt the taste vector — the existing distinction between *demoting placement* and *unlearning taste* applies here too.

---

# Part 2 — Preset search categories

## Current state (verified)

**There are exactly 4 preset cards, hardcoded**, in `native/src/components/BrowsePresearch.tsx`:

| Card | Sub | Filter preset | 
|---|---|---|
| Slow burn | Long & absorbing | Drama, runtime > 120 |
| High-energy | Fast & thrilling | Action, Comedy |
| Late-night | Strange & dark | Horror, Mystery, Thriller |
| Comfort | Easy & warm | Comedy, Romance, Family |

**Each card already carries two things**, and this is the most important fact in this brief:

- `preset: BrowseFilters` — a structured filter, used when the `search_semantic` flag is OFF
- `phrase: string` — a rich natural-language description, fed to **vector search** when the flag is ON

e.g. Slow burn's phrase is *"an understated, meditative drama that unfolds gradually and rewards your attention — thoughtful, restrained, character-driven and emotionally rich."*

**In other words, the presets are already canned natural-language prompts against a semantic search engine.** The mechanism that the conversational end goal needs already exists and is already wired. This is a strong argument that this work is not a throwaway stopgap — it is the same substrate, pre-populated.

## The gap Joe identified

All four current presets are **vibe-led** (mood/genre). But the motivating example is **constraint-led**:

> "I want a new movie that I don't have to pay for and that isn't some cheesy crap."

That decomposes to *recency + cost + quality* — three axes, none of them a mood. The current set does not cover this class of intent at all, and it is plausibly one of the most common real intents.

**Two hard constraints on that example, both verified:**

1. **Cost is not filterable on native today.** `browseFilters.ts` states: *"cost / language need per-item availability the native search doesn't fetch yet — deferred."* The "free" half of the motivating example cannot currently be expressed. Whether "free" means free-to-air (BBC/ITVX/Channel 4) or included-in-your-subscription is itself an open product question.
2. **There is no search-term logging anywhere *today*.** Analytics covers onboarding events only (`src/lib/analytics/events.ts`). **"The eight most searched" cannot currently be derived from our own data** — that data does not exist. Joe has decided to start capturing it (see *Decided: search-term logging* below), but it will not be useful for weeks, so the initial category set still has to be reasoned rather than measured.

## There are already three overlapping taxonomies

Before adding a fourth, these need reconciling — or at least a conscious decision not to:

| Existing | Count | Where |
|---|---|---|
| Browse chip categories | 5 | `BrowseChips.tsx` (Part 1) |
| Presearch moods | 4 | `BrowsePresearch.tsx` |
| Onboarding taste clusters | 16 | `tasteClusters.ts` — users pick from these |
| Mood rooms | ~69 | monthly recluster cron; weekly pool of 5 per user, reordered by time-of-day affinity |

Mood rooms in particular already solve a very similar problem — *select a personalised subset from a larger pool, rotate it* — including time-of-day affinity and a variety penalty against last week's picks. That prior art should be understood before designing a parallel mechanism.

## What to investigate

- **What are the genuinely common intents?** Without search logs, this has to come from elsewhere: the 16 taste clusters, the ~69 mood-room labels (which were LLM-generated from real cluster content), competitor patterns, and general research on how people choose what to watch. Both *vibe-led* and *constraint-led* intents need representation.
- **Are 8 and 4 the right numbers?** Both are Joe's opening guesses and explicitly exploratory.
- **How should the 4 be chosen per user?** Taste profile is the obvious input; time of day, recent behaviour, day of week, and available services are all candidates. Mood rooms already do some of this.
- **Static or data-driven?** Hardcoded set, or derived from cluster/room data so it evolves as the catalogue does?
- Search-term logging is **decided** — see the dedicated section below. It is a prerequisite that runs in parallel, not one of the open questions.

## Decided: search-term logging (2026-09-08, Joe)

**We will start logging search terms.** This is settled — the investigation should treat it as a parallel prerequisite, not an open question.

**Rationale.** Today the preset set can only be reasoned about. With a few weeks of real queries it becomes evidence, and it stays valuable long after this brief — it is also the most direct signal we will ever get about what people actually want to say to the conversational version. Ship it early and independently of the rest of this work so the data starts accruing while the design is still being explored.

**This is a different class of data to anything we currently store.** Every existing log is structured and system-generated — ids, positions, timestamps, enum event names. A search box is **free text authored by the user**, and people type things they would not click: a person's name, something about their relationship, something they would be embarrassed to have retained. That difference drives the questions below and should be treated as the defining constraint, not an afterthought.

### Non-negotiable obligations

The privacy policy (`native/src/legal/policyContent.ts`) is unusually specific, and three of its promises bind us the moment this ships:

1. **§2 "What data we collect"** enumerates every table by name and says exactly what each holds. A new bullet is required, naming the table and describing the contents honestly.
2. **§6 rights.** Both *Right to deletion* and *Right to data portability* promise coverage of "every row of data described in §2". The `delete_own_account` (migration 042) and `export_user_data` (migration 043) routines **must both be updated** to include the new table. Shipping the table without updating these silently breaks two stated legal commitments — this is the single easiest thing to miss here.
3. **§7 retention.** Every table needs a stated retention position. `card_impressions` sets the precedent: 90 days, then rolled up to aggregates and the originals deleted. A search log arguably warrants something shorter or more aggressive, given the free-text point above.

Also note **§4** already discloses that search queries flow to TMDb. What changes is that *we* now retain them, which is a materially different claim and needs saying plainly rather than leaning on the existing disclosure.

### Open design questions

- **What is the minimum worth storing?** The raw string, or a normalised/derived form? Does storing the query alone answer the question, or is it only useful alongside what came back and what the user then did (result count, whether they tapped anything)?
- **Should raw text be retained at all, or only long enough to derive aggregates?** A short raw window feeding a durable aggregate would satisfy the product need with much less retained free text.
- **Does it need to be per-user?** Answering "what are the most common intents" is an aggregate question. Personalising the shown subset is a per-user question — but that may be answerable from taste profile alone, without attributing queries to people.
- **Where does it sit?** `onboarding_events` (event name + jsonb metadata, written via `src/lib/analytics/logger.ts`) is the existing pattern and may generalise, or this may warrant its own table.
- **Which searches count?** Typed queries only, or also preset-card taps and mood-chip taps? Those are arguably the most interesting signal, since they are intents we already put words to.
- **Does the user need to be told in-product**, beyond the policy text?

### Exit criteria for this piece

Terms are being captured; the table appears in §2; deletion and export both cover it (verified, not assumed); a retention position is stated in §7 and enforced by a job if it is time-bounded.

## The bridge to conversational

Design the preset set so each one is expressible as a sentence a person would actually say. If a preset cannot be phrased naturally, it is probably a filter, not an intent. Presets that read as sentences become training data and fallbacks for the conversational version rather than something to throw away.

---

## What this investigation should produce

Not code. A short recommendation covering:

1. A decision on the Documentaries type-vs-genre modelling question, and on what a filtered New page means for rails that cannot honour the filter.
2. A recommended approach for where For You filtering happens, with the KV cache-key implication addressed.
3. A candidate set of preset categories with the reasoning behind each, explicitly spanning vibe-led and constraint-led intents, and reconciled against the three taxonomies that already exist.
4. A position on personalised selection (how the shown subset is chosen).
5. Search-term logging **shipped** (decision already made) — including the §2 policy entry, deletion/export coverage verified, and a stated retention position. This should land early and independently so data starts accruing during the rest of the investigation.
6. A measurement plan — how we would know either of these worked. Note that impression and interaction logging already exists and `npm run eval:novelty` is precedent for measuring a change of this kind.

## Guardrails

- Read the current code before proposing anything; several things here are half-built rather than absent, and the existing `BrowseFilters` vocabulary and `phrase`/`preset` dual mechanism should be the starting point.
- Do not regress the completed speed (B) or freshness (C) work.
- `native/src/lib` is a symlink to `src/lib` — never run a recursive delete inside `native/` (it wipes the real shared tree; recover with `git restore src/lib`).
- Consult `videx-wiki/` before starting; read `videx-wiki/AGENTS.md` first.
