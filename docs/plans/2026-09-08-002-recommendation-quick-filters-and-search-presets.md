# Recommendation: quick filters + preset search categories

**Status:** recommendation + execution plans (§10), all decisions closed by Joe 2026-09-08 · **Date:** 2026-09-08 · **Answers:** [2026-09-08-001 brief](2026-09-08-001-brief-quick-filters-and-search-presets.md) · **Author:** CC (investigation session) · **Prototype:** https://claude.ai/code/artifact/bb6c19dc-0b7f-4344-831e-cd5c6c67cc08

Everything below was verified against the codebase and the live database on 2026-09-08. Nothing has been implemented. **To execute:** start a fresh session per §10 and paste that session's handoff prompt (Session 1's is at the very end). Sections 0–9 are the reasoning; §10 is the work.

---

## 0. Three findings that change the brief

These are stated first because each one reshapes a section of the brief.

### 0.1 Search-term logging already exists. Native just never calls it.

The brief says "there is no search-term logging anywhere today". The *mechanism* exists; the *data* does not.

- `src/lib/storage/interactions.ts` exports `emitSearch(query, resultCount, { mode, metadata })`. It writes a `user_interactions` row with `event_type = 'search'`, `content_id = NULL`, `session_id`, and `metadata = { query, result_count, mode, ...}`. `mode` is `'lookup' | 'filter' | 'semantic'`.
- The web app calls it from `src/hooks/useSearch.ts` (lookup at line 340, semantic at line 251).
- The taste recompute already reads these rows (`src/lib/taste-v2/interactionUpdate.ts:251`) for the search-attribution boost (IN-PX-43, shipped 2026-05). It reads only `created_at` and `session_id`, never the query text.
- **Native never calls it.** Neither `native/src/hooks/useSearch.ts`, `useSemanticSearch.ts`, nor `useBrowseDiscover.ts` import it. Production has **zero** `search` rows (live query, 2026-09-08: 9 event types present, `search` absent).

Consequences: "ship search-term logging" is a wiring job on the native side, not a new table. Deletion (migration 042, `DELETE FROM public.user_interactions`) and export (043/061, `user_interactions` key, includes `metadata`) **already cover it**. What is *not* covered is the policy text (§2's `user_interactions` bullet enumerates thumbs/watched/etc. and does not mention search text) and a retention position. See §5.

### 0.2 "Documentary" is modelled three incompatible ways, and one path is a bug

| Path | How a documentary is represented |
|---|---|
| `contentAdapter.ts:65,90` (TMDb results) | `type: 'doc'` when `genre_ids` includes 99, for **both** movie and TV |
| `titleAdapter.ts:25` (Supabase `titles` rows → For You, spotlights, per-service charts, semantic search) | `type: row.media_type` — **never `'doc'`**, even with genre 99 present |
| `useBrowseDiscover.ts:77–85` (Browse "Docs" segment) | movies only, `with_genres=99`; **TV documentaries excluded** |

So the same title is a `doc` if it arrived via TMDb search and a `movie` if it arrived via the Supabase engine, and `applyBrowseFilters` with `contentType: 'doc'` silently drops every engine-sourced documentary. This is why Q1 in the brief has to be decided *before* any chip is wired: a "Docs" chip on For You built on `item.type` would show nothing.

### 0.3 The For You payload already supports client-side re-slicing, and Home now has the same cache shape as For You

- `ForYouPayload` (`src/lib/server/foryouRender.ts:134`) ships every row's `ContentItem`s **with `genreIds` and `type`** (via `titleRowToContentItem`), plus the scored `pool` with per-title `media_type`, `genre_ids`, `runtime`. The client already re-ranks this pool on slider drags. Filtering the rendered rows client-side is the same class of operation and needs **no change to the KV key**.
- Since B5, **Home is also Worker-rendered** (`/v1/home`, KV cached 10 min, key `home:v1:{user}:{services}:{clusters}`). The brief's cache-key concern is framed as For You-only; it applies to both surfaces. A server-side filter on either would multiply KV entries by the number of chip states and defeat B2 pre-warming. Client-side filtering is the only option that keeps both caches intact.

One more: the brief counts three taxonomies. There are **four**. The web For You page has a 6-chip "Refine by feeling" strip (`src/components/ForYouPage.tsx:60`: Slow burn · Comfort · Edge of seat · Cerebral · Funny · Romance) hidden behind `MOOD_REFINER_ENABLED = false` (IN-V3-003). It overlaps the Browse presets by label but not by definition.

---

## 1. Part 1 decisions — quick filters on New and For You

### 1.1 Documentaries: a genre predicate, not a content type (Q1)

**Decision: "Documentaries" means TMDb genre 99 on either media type.** Movies and TV mean `media_type` only and *include* documentaries (a documentary film is a film).

Reasoning:
- A person tapping "Documentaries" wants documentaries. Whether *Blue Planet* is a series is not their question. Docuseries are the larger half of UK streaming docs (BBC, Netflix true crime), and the mood rooms confirm it: *True Crime Deep Dives* (304 titles), *Wind-Down Nature* (286), *Football Documentaries* (164) are predominantly series.
- TMDb, the `titles` table, and the engine all carry 99 as a genre id. The predicate `genreIds.includes(99)` works on every path today; `type === 'doc'` works on one.
- It also fixes 0.2 without a data migration.

Implementation shape (for the implementing session, not this one): one shared `isDocumentary(item)` helper on `genreIds`; `applyBrowseFilters` and `useBrowseDiscover` switch to it (discover gains the TV half via `with_genres=99` on `discoverTV`); `titleAdapter` stops needing a `doc` branch at all. Keep `ContentType = 'doc'` as a *value* in `BrowseFilters` so the vocabulary is unchanged; only its meaning is fixed.

**Anime: dropped from the quick-filter strip (Joe confirmed 2026-09-08).** It is a taste cluster (`anime-animation`) and a mood room (*Late-Night Anime Drama*, the single largest room at 788 titles), not a content type. Defining it needs `original_language = 'ja'` + genre 16, and `originalLanguage` is only populated on the Supabase path, not the TMDb path. If Joe wants it kept, it is expressible under the data-driven visibility rule in 1.5 once the field is populated on both paths.

**Resulting strip: All · Movies · TV · Documentaries.** Same component, same `BrowseFilters.contentType` vocabulary.

### 1.2 What a filtered page is (Q2, Q8)

**Decision: the same page, filtered in place. Rails filter; thin rails hide; the page is never blank.**

Rules:
- Every rail applies the predicate to its items. A rail with fewer than **4** survivors hides (the "thin rail" threshold — cheap to tune).
- **Hero** on New: if the current hero fails the predicate, promote the first passing item from the first per-service row. The hero is already derived client-side from that row in the fallback path, and the Worker payload carries the row, so this is a local operation.
- **Upcoming calendar** and **Free tonight**: filter like everything else. The brief is right that Upcoming filtered to Documentaries will usually be empty — so it hides, which is the honest answer. Leaving some rails unfiltered creates a page where "Movies" is showing TV, which is worse than a shorter page.
- **Editor's note** is not a content rail and is untouched.
- **Empty state:** when every rail hides, render one card: *"Not much [category] on your services this week"* with a single button, *Browse all [category]* → `/browse` with `contentType` preset. This is the only place the chip may navigate, and only as an explicit second tap.

Rationale: "same page filtered" keeps the user's mental model ("this is New, showing only films") and keeps the implementation a pure view over cached data. A "different page" would need its own composition, its own cache, and would reintroduce a round trip.

### 1.3 Filter in place, backfill only where it is thin (Q3)

**Decision: in place, no refetch on tap. One targeted lazy backfill for Documentaries only, and only after the first tap.**

The arithmetic: the Home payload holds ~18 recently-added, ~20 trending, 12 free, 12 upcoming, 3×15 spotlights, and per-service rows, all interleaved movie/TV roughly 1:1. Movies or TV leaves about half of every rail, comfortably above the thin threshold. Documentaries will be thin nearly everywhere — it is a genre, ~5–8% of a general pool.

So: for Documentaries, on first tap, fetch one extra rail (`discover` movie+TV, `with_genres=99`, user's providers, popularity) under its own React Query key, shown as *"Documentaries on your services"* below the filtered survivors. It never runs on page open, so Workstream B's cold-open number is untouched, and it is cached for the session.

Do not build a general "instant filter, backfill behind" hybrid in v1. Log rail-visibility on every filter application (§6) and revisit only if the data shows Movies/TV routinely thin.

### 1.4 For You: client-side on the payload, with one Worker change (Q4)

**Decision: filter the rendered rows client-side. Do not add a filter dimension to the KV key.**

Why not the key: the key is `user:taste_updated_at:sliders:services`. Adding four chip states multiplies entries 4× and, more importantly, B2's pre-warm cron writes one entry per recently-active user; it would have to write four or the chip would be a guaranteed cold render. The whole point of the chip is *no spinner*.

Why not backfill from `pool.matched`: the pool the client receives is the **raw** retrieval, before `applyFatiguePenalty` and the avoid set run (`foryouRender.ts:209–231`). Backfilling from it would resurrect fatigued and parked titles inside the filter — exactly the Workstream C regression the brief forbids.

The one Worker change worth making: **render `recommendedForYou` (and Hidden Gems) longer than the visible row** — e.g. 36 scored, fatigue-adjusted, MMR'd items instead of ~20 — and have the client show the first 20 unfiltered and up to 20 survivors when filtered. Cost is bytes, not compute; rotation (C3 ordering seed) and fatigue (C1) apply to the whole tail because it is the same ranked list. This is the correct answer to the "filtered For You always shows the same 20" concern: the filtered view draws from a longer, already-rotated list.

Rows that are inherently single-type (Because You Watched an anchor that is a series) simply filter and hide like any other.

### 1.5 Same categories on both surfaces, with data-driven visibility (Q5)

**Decision: same component, same four categories, but a chip only renders when the surface's current payload has ≥ 8 items matching it.**

This resolves Q5 without a per-surface config: a user whose taste vector never surfaces documentaries will not see a Documentaries chip on For You, but will on New (where Free tonight and the docs backfill exist). It also makes Anime cheap to reintroduce later. "All" always renders.

### 1.6 Ephemeral, not sticky (Q6)

**Decision: selection survives tab switches within a session and resets on cold start. It is per-surface. Nothing is persisted.**

Sticky filters are the classic "why is my feed empty" support ticket, and a sticky Movies filter on a tab called *New* makes the tab lie. Hoist the state to a tiny in-memory store (a module-level `useSyncExternalStore` or the existing state pattern) rather than screen-local state so the tab bar does not reset it. Revisit once the logging in §6 shows whether people re-apply the same chip on most opens.

### 1.7 Not a taste signal (Q7)

**Decision: log it, do not learn from it, in v1.**

A chip says "tonight", not "me". The product already has an explicit, reversible, user-visible control for the movie/TV preference: the `contentMix` slider. If §6's logging later shows a user filtering to Movies on the large majority of opens, the right move is to *suggest* moving that slider (explicit consent, visible in Profile), not to nudge the taste vector silently. That keeps the placement-vs-taste line the brief cites: a filter demotes placement for one session; only the user changes taste.

---

## 2. Part 2 — preset search categories

### 2.1 Reconciling the four taxonomies

Each has a distinct job. None should be merged; two should stop growing.

| Taxonomy | Count | Job | Recommendation |
|---|---|---|---|
| Browse chips (`BrowseChips`) | 5 → 4 | **View control** on New/For You. Type only. | Wire as in §1. Never carries intent. |
| Presearch presets (`BrowsePresearch`) | 4 → pool of 8, 4 shown | **Intents.** Each is a sentence with a `phrase` (semantic) and a `preset` (fallback). | Grow to the pool in 2.3. This is the substrate the conversational goal reuses. |
| Onboarding taste clusters (`tasteClusters.ts`) | 16 | **Taste seeds** chosen once at onboarding. | Do not surface as presets. Use them as the *affinity key* for choosing which vibe presets to show (2.4). |
| Mood rooms (`mood_rooms`) | 68 live | **Catalogue neighbourhoods**, LLM-labelled, monthly recluster. | Keep for the deferred browse surface (H2 stretch). Do not derive presets from them: labels churn monthly, and 21 of 68 rooms are language/region-led (Tamil, K-drama, Bollywood, Turkish, Polish, …) — right for the catalogue, wrong as a 4-card entry point. |
| Web For You "Refine by feeling" (disabled) | 6 | Duplicate of presets by another name. | **Retire (Joe, 2026-09-08).** Delete `MOOD_CHIPS`/`MOOD_GLYPHS`/`MOOD_REFINER_ENABLED` and the dead branch in `ForYouPage.tsx` in the presets session; close IN-V3-003 as superseded. |

What the mood-room labels *are* useful for: evidence about intent phrasing. Read across the 68, three patterns dominate: **time-of-day/week framing** (*Sunday-Night Crime*, *Late-Night UFOs*, *Saturday Morning Cartoons*, *Wind-Down Nature*), **audience framing** (*Family Movie Night*, *Pre-school Disney*, *Date Night Rom-Coms*), and **format/commitment framing** (*K-Drama Binge*, *Background Procedurals*, *Marvel Marathon*). Those are constraint-shaped, not genre-shaped, and they came from clustering real catalogue content. That is the strongest evidence available today that the preset set is under-weighted on constraints.

### 2.2 The motivating example is more expressible than the brief thinks

> "I want a new movie that I don't have to pay for and that isn't some cheesy crap."

| Axis | Brief's reading | Verified position |
|---|---|---|
| Recency | needs adding | `BrowseFilters` has no year axis, but `useBrowseDiscover` maps to TMDb discover, which takes `primary_release_date.gte`. Adding one axis (`released: 'any' \| 'last_12_months'`) is small and stays in the vocabulary. |
| Cost ("free") | "not filterable on native today" | **Joe's definition (2026-09-08): free = included in a subscription you already pay for, or genuinely free; paid = rent/buy on top.** The web already implements exactly this: `src/hooks/useBrowse.ts:92–103` maps `costs: ['free']` to TMDb discover `with_watch_monetization_types=flatrate\|free\|ads`, and `src/lib/search/filterState.ts` carries the `Cost` type. Native deferred the axis; porting it to `useBrowseDiscover` is one parameter. On the engine/semantic path, `streaming_availability.stream_type` distinguishes `subscription`/`free`/`rent`/`buy` per title per service (migration 064 already uses it for the paid-only row), so a SQL predicate exists; note `titles.available_services` (075) aggregates all stream types, so a free-only semantic filter needs a stream_type-aware variant or a post-filter — the one real gap, and only on the flag-ON path. |
| Quality | — | `minRating` exists. Pair with a `voteCount` floor (the semantic hook already uses ≥ 20) so a 9.0 with 12 votes does not qualify. |

**Decided (Joe, 2026-09-08):** "free" means included in your subscriptions (Netflix titles are free; an Amazon or Apple rental is paid). Not free-to-air. So the *Free to watch* preset is a `cost: 'free'` axis on `BrowseFilters`, ported from the web's mapping, not a services list. The Home "Free tonight" rail (free-to-air only) is a different, narrower thing and keeps its name.

### 2.3 Candidate pool (8) — each phrased as a sentence

The test from the brief: if it cannot be said, it is a filter, not an intent. Every entry has the sentence, the `preset` fallback, and the semantic `phrase` direction. The four existing presets are kept as-is; they are good.

**Vibe-led (existing four, unchanged)**

| # | Card | Sentence a person would say | Preset (flag OFF) |
|---|---|---|---|
| 1 | Slow burn | "Something long and absorbing I can sink into." | Drama, > 120 min |
| 2 | High-energy | "Something fast and fun. I don't want to think." | Action, Comedy |
| 3 | Late-night | "Something dark and strange for late at night." | Horror, Mystery, Thriller |
| 4 | Comfort | "Something easy and warm I can half-watch." | Comedy, Romance, Family |

**Constraint-led (new four)**

| # | Card | Sentence | Preset (flag OFF) | Phrase direction (flag ON) | Needs |
|---|---|---|---|---|---|
| 5 | **New & actually good** | "Something recent that isn't rubbish." | `released: last_12_months`, `minRating ≥ 7`, vote floor | "a recent, well-reviewed film or series from the last year that both critics and audiences rated highly" | new `released` axis |
| 6 | **Free to watch** | "Something I don't have to pay for." | `cost: 'free'` → discover `with_watch_monetization_types=flatrate\|free\|ads` on the user's providers | (filter-only; semantic adds nothing — run the phrase from whichever vibe is active with the cost constraint kept; needs a stream_type-aware availability filter on the semantic path) | new `cost` axis (port from web `filterState.ts`) |
| 7 | **Finish it tonight** | "A film I can actually finish tonight." | `contentType: movie`, `runtime: 60_120` | "a tight, satisfying, self-contained film under two hours" | nothing |
| 8 | **Whole family** | "Something we can all watch." | Family, Animation, Adventure | "a warm, funny family film or series that adults enjoy as much as children — nothing frightening or adult" | nothing |

Why these four: they are the four constraint classes the mood rooms and the motivating example surface — **recency + quality**, **cost**, **commitment/length**, **audience**. Each is orthogonal to the vibe set, so a vibe and a constraint compose ("Comfort" + "Free to watch" is a real Sunday intent, and is *precisely* Joe's example once the cheesy-crap half is read as minRating).

Two candidates considered and held back:
- *Made in Britain* ("something British") — clearly a real intent (five of the 68 rooms are explicitly British), but `original_language`/origin is the deferred axis, and semantic-only presets would behave differently with the flag off. Add when the axis lands.
- *Binge-worthy series* — mostly "TV + high rating", already covered by the chip + #5. Not distinct enough to earn a card.
- *Background watching* ("something I can half-watch while doing other things") — Netflix ships it as an "Ask Netflix" chip and the *Background Procedurals* mood room exists (§8). Overlaps Comfort; swap in for Comfort if §5 data shows Comfort under-tapped, rather than growing the pool.

**Placeholder as on-ramp (from §8):** rotate the eight sentences through the Browse search field placeholder — *"Try: a film I can finish tonight"* — so the sentence form is visible even when the grid is not. The `phrase` and the placeholder sentence are the same string family; keep them in one place in code.

**Numbers:** pool of 8, **4 shown** (2 vibe + 2 constraint, always). Four is right for the 2×2 grid the screen already has and matches the "one tap, no scanning" goal. Eight is the smallest pool that gives every slot at least two alternatives to rotate through. Revisit both once §5's data exists.

**Compose, don't replace:** a preset tap sets the preset onto the existing `BrowseFilters` state rather than replacing it, so a constraint card and a vibe card stack. This is the single change that turns the motivating sentence into two taps. The `FilterSheet` pill row already shows active axes, so the user can see and clear the stack.

### 2.4 Choosing the four per user

**Decision: static pool in code, deterministic selection, no new persistence.** Same primitives the anchor-room selection already uses (a weekly bucket seed, a "not last week" exclusion, time-of-day bucket).

- **Slot A (vibe, contextual):** pick by `getContextualTimeBucket(hour, dow)` (`contextual.ts`) — late-night → Late-night; weekday morning → Comfort; weekend evening → High-energy; else Slow burn. The pipeline already scores with these buckets, so the card and the results agree.
- **Slot B (vibe, taste):** map each vibe preset to the taste clusters it serves (Slow burn ↔ Heartfelt Drama / Award-Winners / Cult & Indie; High-energy ↔ Action & Adrenaline; Late-night ↔ Horror / Dark Thrillers / Mind-Bending; Comfort ↔ Feel-Good / Rom-Coms / Family). Pick the highest-affinity vibe the user's `selectedClusters` hit that is not Slot A and was not Slot B last week (weekBucket seed, mirroring `featuredLastWeek`). Cold users with no clusters fall back to the pool order.
- **Slot C (constraint, fixed):** *New & actually good*. It is the thesis of the brief and the most universal intent; it does not rotate.
- **Slot D (constraint, rotating):** *Free to watch* on weekdays; *Whole family* Fri–Sun daytime; *Finish it tonight* weekday evenings after 21:00. Time-of-day again, no taste input.

No taste-vector similarity, no mood-room RPC, no server round trip: the selection runs from data the app already holds (profile clusters, clock). Once search logs exist, the natural upgrade is to reorder by the user's own preset-tap history — which §5 captures via `metadata.mood_key`.

### 2.5 The bridge to conversational

The presets are already canned prompts against the semantic engine. Three things keep them on the path rather than in its way:

1. **The `phrase` is the product.** Keep writing them as full sentences in the user's register. They become (a) the fallback library the conversational surface uses when the model is unsure, (b) eval fixtures for `search-semantic-eval` (each preset is a ready-made query with a known-good intent), and (c) examples for the H3 MCP `recommend-tonight` tool.
2. **Search logs are the corpus.** §5 logs typed queries and preset taps in the same table with the same shape, so "what people say" and "what we offered" are directly comparable. Whether typed free text drifts toward or away from the preset sentences is the first real measurement of the conversational thesis.
3. **Never let a preset need a bespoke code path.** Every card must be `phrase` + `BrowseFilters`. The moment a card needs its own fetcher it has become a feature, not an intent, and will not port.

---

## 3. Part 1 cross-cutting constraints (verified against code)

| Constraint | How the recommendation honours it |
|---|---|
| No new blocking round trip on open (Workstream B) | Both chips are pure client-side views over the cached payload. The only fetch is the Documentaries backfill, on tap, cached. |
| Rotation/fatigue apply within a filtered view (Workstream C) | Filtering happens *after* fatigue, avoid-set and ordering seed have run server-side. Longer rendered rows (1.4) give the filter a rotated tail to draw from. No client backfill from the raw pool. |
| Reuse `BrowseFilters` | Chips set `contentType`; presets set `BrowseFilters` fields; two new axes (`released`, `cost` — the latter ported from the web's `filterState.ts`, so it is the web vocabulary, not a new one). Documentaries meaning is fixed *inside* the existing vocabulary. |
| No taste-vector corruption | Chips and presets are logged, not learned (1.7). Search-as-signal L2 (IN-PX-44) stays deferred behind IN-PX-40. |

---

## 4. Things the brief did not know it was asking (found in passing)

- **Native Browse/search results do not appear to record impressions.** `grep sourceSurface` across `native/src/app/(tabs)/browse.tsx` and `PosterGridCard.tsx` returns nothing, while the `'search'` and `'browse'` surfaces exist in `ImpressionSurface`. Without this, preset CTR (§6) cannot be computed. Verify and fix in the presets session.
- **Every keystroke is a search on native.** `useSearch` debounces 300 ms and fires at ≥ 2 characters, so "documentar" would log eight rows if `emitSearch` were naively added. The web solves this with a dispatch nonce. Native must log only *settled* queries — see §5.3. The policy's "no keystroke tracking outside explicit forms" line makes this a compliance point, not a tidiness one.
- **Store data-safety declarations.** Google Play's Data Safety form has an explicit "In-app search history" category and Apple's privacy label has "Search History". Retaining queries means both declarations need updating on the next submission. The brief lists only the in-app policy.
- **§10 notification.** The policy promises to notify signed-in users of changes. Adding retained search text is material. Whoever ships §5 needs to know how (or whether) the last-updated bump triggers that in-app.

---

## 5. Search-term logging — decided; how to ship it well

### 5.1 Where: `user_interactions`, via the existing `emitSearch`. Not a new table.

- Deletion and export already cover it (verified: 042 line 49; 043/061 `user_interactions` key with `metadata`).
- RLS, session ids, and the attribution join already exist.
- The recompute already reads these rows and reads only timestamps.
- One table to reason about for privacy rather than two.

The brief's instinct that free text is "a different class of data" is right, and it is handled by **retention on the field**, not by a separate table (5.4).

### 5.2 What counts: typed queries, preset taps, and filter applies — all three, same shape

| Event | `mode` | `metadata` |
|---|---|---|
| Typed search settled | `lookup` | `{ query, result_count, category }` |
| Preset card tap | `semantic` (flag on) or `filter` (flag off) | `{ query: <phrase or null>, mood_key, result_count, semantic: bool }` |
| Filter-only browse (FilterSheet apply) | `filter` | `{ query: null, filters: <BrowseFilters>, result_count }` |
| Quick-filter chip (Part 1) | `filter` | `{ query: null, surface: 'new' \| 'for_you', category, rails_visible, items_visible }` |

Preset taps are the most valuable rows: they are intents we already put words to, so their tap share directly ranks the pool. Log `mood_key`, not the phrase, so rows stay small and the phrase can be edited in code without breaking history.

"Did they then tap something" needs no new field: the 60-second search-attribution window (IN-PX-43) already links the next positive interaction to the search by `session_id`. Confirm `getCurrentSessionId()` is live on native before relying on it (the impression batcher uses sessions, so it should be).

### 5.3 Settled queries only

Emit once per *settled* query: when results arrive **and** the query has been unchanged for ≥ 1.5 s, or on keyboard submit, or on first result tap — whichever comes first, once. A query that is a strict prefix of the next settled query within the same window is not emitted. This mirrors the web's nonce-per-dispatch behaviour and keeps the promise about keystrokes.

### 5.4 Retention position (recommended)

- **Raw query text: 30 days.** A nightly pg_cron job (same pattern as `card_impressions_rollup`) sets `metadata.query` to null on `search` rows older than 30 days. The row itself is kept (event type, session, timestamp, mode, result count, mood key) because the attribution recompute needs it and none of that is free text.
- **Aggregate: indefinite, not personal.** Before nulling, the job upserts into `search_terms_daily (day, term_normalised, mode, count, median_result_count)` with **no user id**. Normalisation: lower-case, trimmed, whitespace-collapsed. Stated plainly in §7 as "a count of how often each search term was used, with no record of who searched it".
- The aggregate table has no user column, so it needs no deletion/export coverage — and the migration comment should say so, so the IN-PX-54 drift check does not flag it.
- At current scale (single-digit users), the 30-day raw window is what Joe will actually read to choose the pool. That is fine and should be said out loud rather than pretending an aggregate over seven users is anonymous.

**What the retention number actually decides.** The number is how long the *literal text a user typed* stays attached to their account (on their `user_interactions` row) before the nightly job blanks it. It does not affect: the row itself (kept, so attribution and the taste recompute keep working), preset taps (`mood_key` is not free text and is never stripped), or the aggregate counts (no user link, kept indefinitely). It does affect: how long the text appears in a "Download my data" export, how long Joe can read raw queries qualitatively, and the sentence in §7.

| Option | For | Against |
|---|---|---|
| 7 days | Smallest exposure; easiest to defend | Too short to read patterns at current traffic; Joe would need to look weekly |
| **30 days (DECIDED — Joe, 2026-09-08)** | Enough to read a month of intent; shorter than any other stated retention, which signals the free-text point was taken seriously | Nothing material |
| 90 days | Matches the `card_impressions` precedent, one number in §7 | Free text kept three times longer than it needs to be for the product question |

The 60-second search-attribution window is unaffected by any of these. The decision is one number plus confirming that the user-free aggregate may be kept indefinitely.

### 5.5 Policy text changes (§2, §4, §7)

- **§2, `user_interactions` bullet — append:** "…and, when you search, the words you typed or the mood card you tapped, together with how many results came back."
- **§4 TMDb bullet — append:** "Videx also keeps a copy of your search text itself — see §2 and §7."
- **§7 — new bullet:** "The text of your searches is removed from `user_interactions` rows after 30 days. Before it is removed we add it to a count of how often each search term was used across all users; that count has no link to you."
- Bump *Last updated*; trigger §10 notification.

### 5.6 Exit criteria (as the brief states them, checked against the above)

Terms captured on native (all three event kinds) · §2 names the table and the content · deletion **and** export verified by running `delete_own_account`/`export_user_data` against a test account and inspecting `user_interactions` · §7 states 30 days and the aggregate · cron job live and observed to run once · store data-safety forms updated at next submission.

---

## 6. Measurement plan

Precedents reused: `card_impressions.metadata` (the `exploration: true` pattern), the search-attribution join, `npm run eval:novelty`.

**Quick filters**
- Stamp `metadata.filter = <category>` on every impression recorded while a chip is active (home and for_you surfaces). This is the `exploration: true` pattern and lets every downstream query segment by filter.
- Metrics (2-week read after launch): chip use rate per New open and per For You open; CTR of filtered impressions vs unfiltered on the same surface; empty-state rate per category; Documentaries backfill hit rate; rails-visible distribution from the `filter` events.
- Re-run `eval:novelty` **segmented by `metadata.filter`** so a filtered session's smaller distinct-title count is not read as a rotation regression.
- What "worked" looks like: chips used on ≥ 20% of opens, filtered CTR ≥ unfiltered, empty state < 5% for Movies/TV.

**Presets**
- Preset tap share of Browse sessions; per-`mood_key` tap counts (this ranks the pool); tap → `detail_view` within the 60 s window (needs §4's impression fix for CTR proper); `result_count` distribution per preset (a preset that routinely returns < 10 is a bad preset or a thin catalogue).
- The specific hypothesis to test: **constraint-led cards out-tap vibe-led cards.** If they do, the brief's thesis holds and the next pool should lean further that way. If they do not, revert to four vibe cards and put the constraints in FilterSheet.
- **Zero-result rate**, weekly: share of settled typed queries with `result_count = 0`, split by `category`. Failed search is the documented abandonment point (§8.1: 19% leave, 29% of 18–24s). Anything above ~10% is a retrieval bug to chase (title spelling, year parsing, catalogue gap), not a presets problem.
- **Retrieval vs discovery split**: classify the 30-day raw terms as title-shaped (matches a `titles.title` or a TMDb top hit) vs descriptive. §8.1 predicts retrieval dominates; the actual ratio decides how much of the search surface should optimise for "where is X" versus "what should I watch".
- Typed-query drift: monthly, compare the 30-day raw terms against the eight sentences. Queries that read like the sentences validate the conversational path; queries that are all title lookups say people use search for retrieval, not discovery, and the presets carry the discovery load alone.

---

## 7. Sequencing and handoffs

Per Joe's one-conversation-per-concern preference, four sessions, in this order. Detailed per-session plans with files, acceptance criteria and copy-paste handoff prompts are in **§10**.

1. **Search logging** (small, now — data starts accruing). Handoff prompt at the end of this document.
2. **Quick filters** on New + For You (after 1, so chip events log). Includes the Documentaries predicate fix (0.2) and the longer-row Worker change (1.4).
3. **Presets, compose, free-text routing** — the pool (2.3), selection (2.4), the `released`/`cost` axes, the single intent state and title-vs-description routing (§9), retiring the web mood refiner.
4. **Refine row** (§9.2) — the five-chip row replacing the category pills and the Filters/Sort cluster.

**Decisions from Joe (2026-09-08), all four closed:** "free" = subscription-included, not free-to-air (2.2); Anime removed from the quick-filter strip (1.1); raw search text retained **30 days** (5.4); the disabled web "Refine by feeling" strip (`MOOD_REFINER_ENABLED`, IN-V3-003) is **retired** — remove it in the presets session rather than re-pointing it (2.1).

---

## 8. Research check — is the stopgap the right shape? (2026-09-08)

Joe asked whether a filters-and-presets stopgap is compatible with the conversational end goal, and what the most modern discovery behaviour looks like. Two web-research passes ran the same day: one on viewer behaviour (Ofcom, YouGov, Nielsen/Gracenote, Hub, Deloitte, TiVo), one on what platforms have shipped. Sources and dates are in the two reports summarised here; vendor press releases are marked as such.

### 8.1 What the evidence says

**Discovery mostly starts outside the app.** GB adults rank friends and family first (56–68%), then the platform's own suggestions (~50%), then social media (~43%), then trailers (~38%) — YouGov Profiles, Jan 2026. Among UK 16–24s, 85% watch short-form weekly and **87% have started a full show after seeing a clip** — YouGov, Mar 2026. Ofcom Media Nations 2026 puts the UK "first port of call" at Netflix 26%, BBC 25%, ITV 15%. Implication: a large share of in-app searches are *retrieval* ("where is the thing I heard about"), not *discovery*. Title lookup speed and the share-link/title-page loop (H0 Stream B) carry more weight than any preset.

**Search quality is the most-valued feature, and failed search is where people leave.** "Easy search" rated very important by 60% vs personal recommendations 31% — Hub, Jul 2026 (US). Gracenote/Nielsen, Nov 2025 (six countries incl. UK, vendor-run): 14 minutes average to choose; **19% abandon when search fails, 29% of 18–24s**; 66% want one cross-service guide. That last figure is the aggregator thesis in one number.

**The conversational on-ramp that has actually shipped is chips beside an input, not a chat window.** Netflix's TV "Ask Netflix" voice test (May 2026) launches with canned intents — *"I need a good cry"*, *"watch in the background"*, *"help me stay awake"*. YouTube's TV "Ask" button (GA Mar 2026) ships default prompts. Disney+'s closed beta (Aug 2026) accepts text, voice **or suggested prompts**. Spotify's Prompted Playlist (UK beta Feb 2026) ships "3 prompts to try" and tells users detailed prompts beat vague ones. Alexa+ on Fire TV demos as *ask, then refine* ("something newer", "with a female lead"); Amazon claims 40% more top-pick selections (press release, US only).

**Intent and situation cards are replacing genre tiles.** Prime Video "AI Topics" (Dec 2024, US beta) are refinable topic cards; Apple TV "Genius Browse" (Mar 2026) uses labels like *"Good for a Pick-Me-Up"*; Netflix's chips above are situations, not genres. Two of Netflix's three are constraint-led (background, stay awake), which is the brief's thesis from a competitor's product.

**Netflix's mobile text-chat search quietly stalled.** The OpenAI-powered iOS beta (May 2025) was never expanded to Android or announced as general availability; 16 months on it resurfaced as TV voice with chips. Treat a free-text chat box on a phone as unproven, and *describe-then-refine with prompts* as the form that survived.

**Assistant-side is real but early, and aggregators are invisible there.** Tubi shipped the first streamer app inside ChatGPT (Apr 2026). Google TV's Gemini search reached the UK via TCL in Jun 2026, and "Where to Watch" answers deep-link to apps (Sep 2026). A Mar–Apr 2026 AI-visibility index found Netflix dominates "what to watch" answers and aggregators barely appear. Gen Alpha (13–14) already rates chatbots the best source of recommendations (49%) but **75% verify answers elsewhere** — Nielsen, Apr 2026, US. UK adults want AI for assistance, not generated content, and only 6% would pay extra for personalised recommendations — YouGov, Feb 2026.

**Chips are wanted even when the platform moves on.** Airbnb demoted its category chips and users petitioned to bring them back. Pulling filters out in favour of AI is a known way to annoy people.

**Gaps in the evidence.** Nobody has published an in-app search-vs-browse split since Netflix's 2015 paper (~80% of hours from recommendations). No survey quantifies UK adults using ChatGPT/Alexa to choose what to watch. No mood or vibe feature anywhere has published engagement data. Our own §5 logging will be the first data we hold on any of this.

### 8.2 Verdict on the stopgap

**It is the right shape, and it is not a stopgap in the throwaway sense.** The preset cards *are* the suggested-prompt pattern every conversational launch ships with. The conversational version of Videx is "describe, then refine", and this work builds three of its four parts: the phrases (the prompts), stacked filters (the refinement vocabulary), and the semantic retrieval behind the flag. The missing fourth part is a query-understanding step that turns free text into a phrase plus filters — a small Worker-side LLM call, not a new product. Nothing recommended here has to be removed when that lands; the cards become the "try asking" chips beside the box.

Three adjustments the research justifies, folded into the sections above:

1. **Surface the sentences, not just the cards.** Rotate the preset sentences through the search field placeholder (*"Try: a film I can finish tonight"*). The 2×2 grid stays as the empty state; the placeholder is the always-visible on-ramp. Zero cost, and it starts training users in the language the conversational version will want.
2. **Measure zero-result rate as a first-class metric** (§6). Failed search is the documented abandonment point; `result_count = 0` per settled query is now captured by §5 and should be watched weekly.
3. **Add "Background watching" to the held-back candidates** (§2.3): Netflix ships it as a chip and a mood room (*Background Procedurals*) already exists. It overlaps Comfort; if §5 data shows Comfort under-tapped, swap rather than add.

Two things *not* to do on the strength of this research: do not build a chat window in the app (the one platform that tried it on mobile shelved it), and do not build a vertical clip feed (Netflix, Disney+ and HBO Max all did, but it is a content-licensing play, not a discovery-app play — and trailers already rank below friends and platform rows as a source). Both are parking-lot notes, not roadmap items.

### 8.3 Beyond this brief (for the roadmap, not for these sessions)

- The retrieval-heavy pattern argues for making "where can I watch X" the fastest path in the app, including from a share link or a clipboard title. Ties to H0 Stream B, not to this work.
- Assistant-side invisibility is the strongest new argument for H3 Bet 1 (the MCP taste layer). The preset phrases are the ready-made example prompts for its `recommend-tonight` tool.
- The UK "6% would pay for personalised recommendations" figure is worth a line in the Premium positioning: sell the rotation coach and the availability truth, not the recommendations.

---

## 9. The Browse interaction model — one intent, refined in place (2026-09-08)

Joe asked whether "search, then adjust filters in a sheet" still holds. It does not, and the reason is in the code as much as the research. Prototype of the five states: https://claude.ai/code/artifact/bb6c19dc-0b7f-4344-831e-cd5c6c67cc08 (static mockups matched to the native tokens; annotations on the canvas name each state).

### 9.1 What Browse does today (`native/src/app/(tabs)/browse.tsx`)

- Three **mutually exclusive** modes: typed search (`searching`), semantic mood (`semanticMode`), filter-only discover (`filterOnlyMode`). `handleMood` with the flag on calls `setFilters(DEFAULT_FILTERS)` and clears the query; typing calls `setMood(null)`. Filters and a mood cannot coexist.
- Filters on typed results are applied **client-side** to the ~40 TMDb hits (`applyBrowseFilters` in `shown`), so they thin the grid rather than widen the search.
- Typed text **never reaches the semantic engine** on native. Only the four `phrase` strings do (`useSemanticSearch(mood?.phrase)`). The web has a free-text → semantic fork (`src/hooks/useSearch.ts`, the "opt-in CTA" when Mode A returns few results and the query looks free-text); native does not.
- Three control clusters when results show: category pills (All/Movies/TV/Docs), a Filters button with count, a Sort menu.

### 9.2 The model

**One state.** `intent = { text: string; phrase: string | null; moodKey: string | null; filters: BrowseFilters }`. Nothing clears anything else. A preset tap sets `phrase`/`moodKey` and *merges* its `preset` into `filters`. A chip toggles one `filters` field. Typing sets `text`. "Clear all" resets the lot.

**Route typed text by shape.** On a settled query:
1. Run Mode A (TMDb + Postgres ILIKE) as today.
2. If the top hit is confident (title similarity high, `reRankSearchResults` score above a threshold to be set from the eval fixture) → **title-hit layout**: the hit as a wide card with where-to-watch and the deep-link button first, other matches in the grid below, **no refine row**. Retrieval must stay instant; this path never waits on the semantic call.
3. Else, if the `search_semantic` flag is on → set `phrase = text` and run `useSemanticSearch` with `filters` applied server-side → **described layout** with the refine row. Show a one-line banner *"Reading that as a feeling, not a title"* with *"Search titles instead"* to force Mode A.
4. Flag off → today's Mode A grid with the refine row (client-side filters, honestly thin).

**Refine row.** Five one-tap toggles, each a single existing or newly-added `BrowseFilters` field, in this order: *Just films* (`contentType: movie`), *Newer* (`released: last_12_months`), *Under 2h* (`runtime: 60_120`), *Free to watch* (`cost: free`), *Higher rated* (`minRating: 7`). Then *More filters* (opens `FilterSheet`) and *Sort*. The category pills are absorbed (Just films / a *Just TV* variant when the user has toggled films off is not needed in v1; TV lives in the sheet). Toggling a chip **refetches** on the discover and semantic paths; it only post-filters on the title-hit path, where it is hidden anyway.

**Refine only where it helps.** The row renders for described, mood, and filter-only results. It is hidden on a confident title hit.

**Placeholder.** Rotates the eight preset sentences (§2.3). Below the field, one line: *"Type a title, or describe what you feel like."*

**Presearch grid.** Unchanged 2×2, four cards chosen per §2.4. Kicker copy becomes *"Or just say what you want"*.

### 9.3 What this is not

- Not a chat window. No message history, no assistant turns. The one platform that shipped mobile text-chat search quietly shelved it (§8).
- Not a new filter model. Two axes are added to `BrowseFilters` (`released`, `cost`); everything else is the existing vocabulary.
- Not a change to the sheet. `FilterSheet` stays as the long tail.

---

## 10. Execution plans (one session each — copy the prompt, start a fresh session)

Order is fixed: 1 → 2 → 3 → 4. Each session: worktree branch off `main`, relative worktree paths, never recursive-delete inside `native/` (`native/src/lib` is a symlink to `src/lib`), `npx expo lint` in `native/` before PR, wiki updated from the same worktree, PR body ends with the standard footer. Session 1's prompt is at the end of this document; sessions 2–4 follow.

### Session 2 — Quick filters on New and For You

> **Amended 2026-09-08, after Session 1 shipped.** Two things this section predates. (a) Search emission is gated on the per-user `search_logging` feature flag, default false, and **the gate lives inside `emitSearch`** (`src/lib/storage/interactions.ts`) rather than at the call sites — it was moved there precisely because this session calls `emitSearch` directly from a store and would otherwise have logged for everyone. (b) The attribution boost is gated on content intent (`isContentIntentSearch`), which excludes `mode: 'filter'` rows without a `mood_key` — i.e. exactly the chip events below. Both are intended; neither needs work in this session.

**Scope.** §1 in full. Documentaries predicate fix, the four-chip strip wired in place on both tabs, thin-rail hiding, hero re-pick, empty state, Documentaries lazy backfill, longer rendered For You rows, data-driven chip visibility, ephemeral per-surface state, filter events logged, impression metadata stamped.

**Files.**
- `src/lib/adapters/contentAdapter.ts`, `src/lib/recommendations-v2/titleAdapter.ts`, `native/src/components/browseFilters.ts`, `native/src/hooks/useBrowseDiscover.ts` — add `isDocumentary(item)` (genreIds includes 99) to `browseFilters.ts`; switch `applyBrowseFilters` `'doc'` branch to it; in `useBrowseDiscover` add `with_genres=99` to the **TV** discover call too for `'doc'`; leave `type` mapping alone (it stays media_type-only on the Supabase path; the TMDb adapters may keep setting `'doc'` but nothing should branch on it any more — grep `=== 'doc'` and replace each with the helper).
- `native/src/components/BrowseChips.tsx` — categories become `['All','Movies','TV','Documentaries']`; accept `counts: Record<Category, number>` and hide a chip below 8 (All always shown); keep the existing active styling.
- New `native/src/lib/quickFilter.ts` (or under `native/src/state/` if one exists) — module-level store (`useSyncExternalStore`) holding `{ new: Category; forYou: Category }`, reset on app start, not persisted; `applyQuickFilter(items, category)` and `isThinRail(items, min = 4)`.
- `native/src/app/(tabs)/index.tsx` — replace `onSelect={() => router.push('/browse')}` with the store; derive `visible = applyQuickFilter(...)` per rail; hide rails under 4; hero re-pick from the first per-service row when the hero fails; empty-state card when every rail hides (copy in §1.2); Documentaries backfill as a `useQuery` keyed `['native','home','docsBackfill', services]`, `enabled: category === 'Documentaries'`, fetching movie+TV discover `with_genres=99` on the user's providers, rendered as *"Documentaries on your services"*.
- `native/src/app/(tabs)/foryou.tsx` — same strip and store; filter each row's items; `recommendedForYou`/`hiddenGems` show first 20 unfiltered, up to 20 survivors filtered.
- `src/lib/server/foryouRender.ts` — render `recommendedForYou` and `hiddenGems` to 36 items (constant, named; note the payload size delta in the PR). Confirm the MMR/exploration slot logic is applied to the longer list, not the first 20. Re-run `npm run eval:eng1` and `npm run eval:novelty`.
- `src/lib/instrumentation/impressionBatcher.ts` + `PosterCard`/`MagazineHero` call sites on home/for_you — pass `metadata: { filter: category }` when a chip is active.
- Logging — call `emitSearch('', itemsVisible, { mode: 'filter', metadata: { surface, category, rails_visible, items_visible } })` from the store on every change. **Nothing else is needed:** since Session 1, `emitSearch` gates itself on the per-user `search_logging` flag, so a direct call from a store cannot log for a user who has not consented. Do not add a second gate. These events carry no `mood_key`, so `isContentIntentSearch` deliberately excludes them from the search-attribution taste boost — a chip is a re-slice of the current page, not a statement of what the user wants (§1.7). That is the behaviour, not a bug.

**Acceptance.**
- Tapping Movies on New reflows in place with no navigation, no spinner, no network call (verify in the Worker logs: no new `/v1/home` request).
- A documentary series from the engine path (For You) survives the Documentaries chip. (This is the §0.2 bug; write a unit test on `isDocumentary` against both adapter outputs.)
- Documentaries on New shows the backfill rail after first tap and caches it for the session.
- Switching tabs and back keeps the selection; killing the app resets it.
- `card_impressions.metadata.filter` populated while a chip is active; `eval:novelty` run segmented by it shows no regression unfiltered.
- No change to `foryouCache.ts` keys.

**Handoff prompt.**
```
Context: Videx native app (native/, Expo). Prototype of the target states: https://claude.ai/code/artifact/bb6c19dc-0b7f-4344-831e-cd5c6c67cc08 (read it with the Artifact tool, action read; state 5 is the New tab). Implement Session 2 of docs/plans/2026-09-08-002-recommendation-quick-filters-and-search-presets.md — read §0.2, §1, §3 and §10 "Session 2" in full first. Session 1 (search logging) is merged, including a follow-up that moved the consent gate, so emitSearch is available on native. Two things to know, neither of which needs work from you: (1) search emission is gated on the per-user `search_logging` flag (default false) and the gate is INSIDE emitSearch (src/lib/storage/interactions.ts) — §10 tells you to call emitSearch directly from the quick-filter store, which is safe now, because the gate was moved into the emitter for exactly this reason; do not add a second gate, and do not remove the one that is there (src/lib/storage/__tests__/emitSearchGate.test.ts covers it). (2) The attribution boost is gated on content intent (src/lib/taste-v2/searchAttribution.ts, isContentIntentSearch); quick-filter chip events are mode 'filter' with no mood_key, so they deliberately do NOT earn the taste boost — that is the reason the rule exists, do not "fix" it. Session 1 also found three defects that only on-device testing surfaced, so budget for real device verification (the OTA path is .github/workflows/ota-update.yml — it cannot be published from Windows; the workflow header explains why). Do exactly the Session 2 scope: Documentaries genre-predicate fix, four-chip quick filter wired in place on New (index.tsx) and For You (foryou.tsx), thin-rail hiding, hero re-pick, empty state, Documentaries lazy backfill, longer For You rows (36) in src/lib/server/foryouRender.ts, data-driven chip visibility (≥8), ephemeral per-surface store, filter events via emitSearch, card_impressions metadata.filter. Do NOT touch the KV cache keys, do NOT add a filter dimension to /v1/foryou or /v1/home, do NOT persist the selection, do NOT touch Browse. Worktree branch off main; relative paths; native/src/lib is a symlink — never recursive-delete inside native/. Run npm run eval:eng1 and eval:novelty after the foryouRender change and paste both summaries in the PR. Update videx-wiki (home-surface.md, for-you-surface.md, log.md) from the same worktree. Acceptance list is in §10; tick each in the PR body.
```

### Session 3 — Presets, compose, and free-text routing

**Scope.** §2 and §9.2 except the refine row: the eight-preset pool, four-slot selection, compose-don't-replace, the `released` and `cost` axes, free-text → semantic routing behind the flag, title-hit layout, rotating placeholder, retire the web mood refiner.

**Files.**
- `native/src/components/browseFilters.ts` — add `released: 'any' | 'last_12_months'` and `cost: 'any' | 'free'` to `BrowseFilters` + `DEFAULT_FILTERS` + `countActiveFilters`; `applyBrowseFilters` handles `released` via `item.year`; `cost` cannot be applied client-side (items carry no stream type) — document that it is server-side only.
- `native/src/hooks/useBrowseDiscover.ts` — map `released` to `primary_release_date.gte` / `first_air_date.gte` (today − 365d); map `cost: 'free'` to `with_watch_monetization_types: 'flatrate|free|ads'` (copy the mapping and comment from `src/hooks/useBrowse.ts:92–103`).
- `src/lib/recommendations-v2/search/semanticRetrieval.ts` (+ the RPC it calls) — accept `released` and `cost`. `released` is a `release_date` predicate. `cost: 'free'` needs a stream_type-aware availability check: add an RPC variant or post-filter against `streaming_availability` where `stream_type IN ('subscription','free')` for the user's services — verify live schema with `to_regclass` first; new migration number 079+ (Session 1 took 079; use the next free).
- New `native/src/lib/presets.ts` — the pool of eight (`key`, `label`, `sub`, `hue`, `icon`, `sentence`, `phrase`, `preset: Partial<BrowseFilters>`, `kind: 'vibe' | 'constraint'`, `clusters: string[]` for vibe cards). Move the four existing `MOODS` here unchanged. Add the four constraint cards from §2.3. Export `selectPresets({ hour, dow, selectedClusters, weekBucket }): Preset[4]` implementing §2.4 (reuse `getContextualTimeBucket` from `src/lib/recommendations-v2/contextual.ts`; weekly seed as in `anchorSelection.ts`).
- `native/src/components/BrowsePresearch.tsx` — consume `selectPresets`; kicker copy per §9.2; sentence shown as the card `sub` where it fits.
- `native/src/app/(tabs)/browse.tsx` — replace the three-mode state with the single `intent` object from §9.2. `handleMood` merges the preset into `filters` **and** sets `phrase`; typing no longer clears the mood; the semantic query receives `filters` (server-side). Rotating placeholder from the eight sentences (change on focus loss, not per keystroke). Free-text routing: on settled query with the flag on, if Mode A's top hit is not confident, set `phrase = text` and render the described layout with the banner and *"Search titles instead"*. Title-hit layout: a `TitleHitCard` (new component; wide card, where-to-watch badges via `useItemServices`, deep-link button via `openDeepLink`) above the grid when the top hit is confident. Confidence threshold: start from `reRankSearchResults` score; calibrate against the 20-query fixture (IN-PX-40 — if it is still a stub, author at least the 8 preset sentences + 8 known titles into it in this session).
- `src/components/ForYouPage.tsx` — delete `MOOD_CHIPS`, `MOOD_GLYPHS`, `MOOD_REFINER_ENABLED` and the dead branch; `src/lib/constants/genreGlyphs.ts` — drop `MOOD_GLYPH_NAMES` if orphaned. Close IN-V3-003 in the wiki parking lot.
- Logging — preset taps already emit via Session 1; add `metadata.slot` (A–D) and `metadata.selection_reason` (`'time' | 'taste' | 'fixed' | 'rotation'`) so §6 can tell whether the selection logic earns its keep.

**Acceptance.**
- Tapping *Comfort* then *Free to watch* shows both active and the grid reflects both (flag on: semantic + server-side filters; flag off: discover with genres + monetization).
- Typing "severance" shows the title-hit card with a working deep link and no refine row; typing "something recent that isn't rubbish" with the flag on shows the described layout and the banner.
- The four cards differ by time of day and by a user's selected clusters (write a unit test for `selectPresets` covering the four slots and the not-last-week exclusion).
- Placeholder rotates through all eight sentences.
- The web build has no mood-refiner code left; `npm run build` passes.
- `scripts/test/search-semantic-fixtures.json` has ≥16 entries and `npm run eval:search-semantic` runs.

**Handoff prompt.**
```
Context: Videx native app (native/, Expo) + shared src/lib. Implement Session 3 of docs/plans/2026-09-08-002-recommendation-quick-filters-and-search-presets.md — read §2, §8.2, §9 and §10 "Session 3" in full first, and open the prototype (https://claude.ai/code/artifact/bb6c19dc-0b7f-4344-831e-cd5c6c67cc08 — Artifact tool, action read) to see the five target states. Sessions 1 and 2 are merged. Scope: the eight-preset pool + four-slot selection (native/src/lib/presets.ts), compose-don't-replace intent state in browse.tsx, the released and cost axes on BrowseFilters/useBrowseDiscover/semanticRetrieval (cost:'free' = subscription-included; port the mapping from src/hooks/useBrowse.ts; the semantic path needs a stream_type-aware availability filter — new migration, verify live schema with to_regclass first), free-text → semantic routing behind search_semantic with the title-hit layout and the "Reading that as a feeling" banner, rotating placeholder, and deletion of the web mood refiner (ForYouPage.tsx MOOD_CHIPS/MOOD_GLYPHS/MOOD_REFINER_ENABLED). Do NOT build the refine chip row (Session 4). Do NOT build a chat UI. Author ≥16 entries into scripts/test/search-semantic-fixtures.json (8 preset sentences + 8 known titles) and make eval:search-semantic run. Worktree branch off main; relative paths; native/src/lib is a symlink — never recursive-delete inside native/. Update videx-wiki (phase-search-v2.md, parking-lot.md: close IN-V3-003, log.md) from the same worktree. Acceptance list is in §10; tick each in the PR body.
```

### Session 4 — The refine row

**Scope.** §9.2 "Refine row" and "Refine only where it helps". Five toggles, the *More filters* and *Sort* controls folded into the same row, category pills removed, refetch on toggle for discover and semantic paths, hidden on title hits, logged.

**Files.**
- New `native/src/components/RefineRow.tsx` — horizontal scroll, the five chips bound to `filters` fields, active/inactive styling copied from `BrowseChips`, `×` glyph on active chips, then *More filters* (opens sheet, shows count) and *Sort*.
- `native/src/app/(tabs)/browse.tsx` — replace the category pill row and the Filters/Sort row with `RefineRow`; render only when `!titleHit`; every toggle updates `intent.filters`, which already drives the discover and semantic queries after Session 3.
- `native/src/hooks/useSearch.ts` — drop the `SearchCategory` parameter (the row's *Just films* covers it; TV-only lives in the sheet). Keep the hook keyword-only.
- Logging — each toggle emits `emitSearch(text, resultCount, { mode: 'filter', metadata: { refine: field, on: boolean, ...filters } })`.
- Empty state — when a toggle empties the grid, the empty copy names the chip to remove: *"Nothing free under two hours — try removing Under 2h."* (extend the existing `EmptyState` in browse.tsx).

**Acceptance.**
- On the described layout, tapping *Under 2h* refetches (network request visible) and the count line updates; tapping again removes it.
- On a title hit, no row renders.
- The sheet and the row stay in sync (a sheet change lights the matching chip; a chip change shows in the sheet's count).
- Zero-result state names the last-added chip.
- Result-grid impressions on Browse record `sourceSurface: 'search'` or `'browse'` (fix the §4 gap here if Session 3 did not).

**Handoff prompt.**
```
Context: Videx native app (native/, Expo). Implement Session 4 of docs/plans/2026-09-08-002-recommendation-quick-filters-and-search-presets.md — read §9 and §10 "Session 4" first; open the prototype (https://claude.ai/code/artifact/bb6c19dc-0b7f-4344-831e-cd5c6c67cc08 — Artifact tool, action read; states 3 and 4 show the row). Sessions 1–3 are merged: browse.tsx holds a single intent state with released/cost axes and free-text routing. Scope: RefineRow component (Just films · Newer · Under 2h · Free to watch · Higher rated · More filters · Sort), replacing the category pills and the Filters/Sort row; hidden on title hits; each toggle refetches on discover/semantic paths; sheet and row in sync; zero-result copy names the last chip; refine toggles logged via emitSearch mode 'filter'; ensure Browse result impressions record sourceSurface 'search'/'browse'. Do NOT add new BrowseFilters axes. Worktree branch off main; relative paths; native/src/lib is a symlink — never recursive-delete inside native/. Update videx-wiki (phase-search-v2.md, log.md). Acceptance list is in §10; tick each in the PR body.
```

---

### Handoff prompt — Session 1 (search-term logging)

```
Context: Videx native app (native/, Expo). Joe decided 2026-09-08 to start logging search terms. Read docs/plans/2026-09-08-002-recommendation-quick-filters-and-search-presets.md §0.1 and §5 first — the mechanism already exists (src/lib/storage/interactions.ts emitSearch → user_interactions event_type 'search'); native never calls it, production has zero rows.

Do, in a worktree branch off main (relative worktree paths; native/src/lib is a symlink to src/lib — never recursive-delete inside native/):
1. Call emitSearch from native/src/hooks/useSearch.ts (mode 'lookup', metadata {query, result_count, category}), native/src/hooks/useSemanticSearch.ts (mode 'semantic', metadata {mood_key, result_count}), the flag-off preset path and FilterSheet apply in native/src/app/(tabs)/browse.tsx (mode 'filter', metadata {mood_key|filters, result_count}). Log only SETTLED typed queries: once per query, when results arrive and the text has been unchanged >=1.5s, or on submit/first tap — never per keystroke. Confirm getCurrentSessionId() works on native.
2. Migration 079: pg_cron nightly job (pattern: migration 014 card_impressions_rollup) that upserts search_terms_daily(day, term_normalised, mode, count, median_result_count) — no user_id — from 'search' rows older than 30 days, then sets metadata.query to null on those rows (keep the rows). Comment in the migration that the aggregate has no user column and needs no delete/export coverage. Verify live schema with to_regclass first (remote schema_migrations is not authoritative).
3. Policy: native/src/legal/policyContent.ts — §2 user_interactions bullet, §4 TMDb bullet, new §7 bullet, bump Last updated (wording in the recommendation §5.5). Check how the §10 "notify signed-in users" promise is fulfilled in-app.
4. Verify, don't assume: run delete_own_account and export_user_data against the joegreenwas@gmail.com test account and confirm search rows are deleted and exported.
5. Note in the PR that Google Play Data Safety ("In-app search history") and Apple privacy label ("Search History") need updating at next store submission.
6. Commit docs/plans/2026-09-08-001-brief-quick-filters-and-search-presets.md and docs/plans/2026-09-08-002-recommendation-quick-filters-and-search-presets.md in this PR (they are untracked on main). Prototype for context: https://claude.ai/code/artifact/bb6c19dc-0b7f-4344-831e-cd5c6c67cc08 (Artifact tool, action read).
7. Update videx-wiki from the same worktree: signal-architecture.md (search event now emitted on native), privacy-and-gdpr.md (retention row), log.md entry. Also ingest the brief and the recommendation: copy docs/plans/2026-09-08-001-brief-… and 2026-09-08-002-recommendation-… into videx-wiki/raw/plans/ (Joe has directed this), add wiki/sources pages for each, and update index.md. Register in wiki/registers/parking-lot.md: close IN-V3-003 (web mood refiner retired); file "native Browse/search results record no impressions"; file "free-only filter on the semantic path needs a stream_type-aware availability filter". Do NOT wire quick filters or presets — separate sessions.
```
