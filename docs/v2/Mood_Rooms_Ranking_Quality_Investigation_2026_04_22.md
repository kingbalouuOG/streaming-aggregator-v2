# Mood Rooms Ranking Quality — Investigation Brief

**Status:** Working investigation document for external review.
**Date:** 22 April 2026.
**Author:** Joe Green (CTO) + Claude Code (engineering).
**Purpose:** Summarise an observed quality issue with mood-room ranking and the diagnostic data behind it, so strategists and external advisors can think about smarter consolidation approaches.

---

## 1. What mood rooms are

Mood rooms are a discovery surface inside Videx, a UK-focused streaming aggregator app. The "Mood Rooms for Tonight" row sits on the For You page (position 2, between "Recommended For You" and "Hidden Gems"). Each room is a curated taste-neighbourhood — a named cluster of films and TV shows that share a feeling, era, region, or use-case. Examples of current rooms: "Saturday Night Action", "Cosy British Comedy", "K-Drama Binge", "Tamil Crime Drama", "Wind-Down Nature".

The user sees up to **5 rooms per week** on their For You row. Tapping a room opens a dedicated page with the full title list (typically 30–800 titles, filtered to titles available on the user's selected streaming services).

Goal: surface neighbourhoods the user is likely to enjoy *tonight*, anchored in their stated preferences but with room for organic discovery. The row exists because flat genre browsing ("show me action movies") is unsatisfying and recommendations rows ("Recommended for You") feel impersonal — mood rooms are meant to feel curated.

---

## 2. The pipeline today

Three stages, ordered by data flow:

### 2.1 Clustering (monthly cron, Python)

A monthly job runs **HDBSCAN** density-based clustering over **20,098 OpenAI embeddings** (1536-dimensional `text-embedding-3-small` vectors, one per title in the catalogue). Before clustering, embeddings are projected to 10D via **UMAP** with cosine metric — a standard technique for topic clustering on sentence-transformer embeddings, since pure HDBSCAN on raw 1536D fails (it produces 2 clusters / 10% coverage due to curse of dimensionality).

Output: **69 mood rooms** at the latest run (April 2026). Cluster sizes range from 30 (the `min_cluster_size` floor) to 788. Total clustered titles: 10,652. Catalogue coverage: 53% — meaning 47% of titles sit in sparse regions of embedding space and don't belong to any room. This is a structural property of the catalogue, not a tunable parameter (verified across four orthogonal tuning passes).

Centroids and centrality are computed in the **original 1536D embedding space**, not in UMAP space (UMAP is for cluster *assignment* only). Each room stores its centroid as a `vector(1536)` column for downstream taste-fit scoring.

### 2.2 Labelling (per cluster, OpenAI)

Each cluster's 20 most-central titles are passed to `gpt-4o-mini` with a structured prompt that produces:
- A 2–4 word label in Title Case (e.g. "Saturday Night Action").
- A one-sentence description (e.g. "Mid-budget action thrillers featuring professionals, criminals, and revenge.").

Stability preservation: the next monthly run uses Jaccard similarity (≥ 0.8 threshold on title overlap) to detect "same cluster, different month". When a stable match is found, the previous label is preserved — so room identities persist over time.

A first pass of LLM-generated labels collided heavily on a small bag of evocative vocabulary (six different rooms had "Echoes" or "Whispers" in the name). That was fixed by hand for the current 69 rooms via a one-off SQL relabel, plus a permanent prompt rewrite that bans those words and threads previously-generated labels back into each subsequent prompt so the LLM avoids vocabulary collisions within a run.

### 2.3 Ranking (per request, server-side RPC)

When a user opens For You, a Postgres RPC computes:

```
For each room with ≥ 10 titles available on the user's services:
    distance = cosine_distance(user_taste_vector, room.centroid)
Order by distance ascending
Return top 5
```

This is the heart of the personalisation: a single cosine similarity comparison between the user's 1536D taste vector and each room's 1536D centroid. The 5 rooms with the smallest cosine distance become the user's pool for that week.

### 2.4 Where the user's taste vector comes from

For a brand-new account, the taste vector is **bootstrapped from three signals** during onboarding:

1. **Service centroids.** The user picks their streaming services (Netflix, Disney+, BBC iPlayer, etc). Each service has a pre-computed "taste centroid" — the mean embedding of its top-150 most-popular titles. The user's service centroid is the average of their selected services' centroids.
2. **Watched-grid embeddings.** During onboarding, the user picks titles from a grid of films/TV (typically 6–12 picks). The mean embedding of their picks is the watched-grid signal.
3. **Cluster representative embeddings.** The user picks 3–5 "taste clusters" from a list of 14 (Feel-Good & Funny, Dark Thrillers, Epic Sci-Fi & Fantasy, etc). Each cluster has 2–4 hand-picked representative titles. The mean embedding of representatives across all selected clusters is the genre signal.

These three signals are weighted-summed and L2-normalised:

| Watched-grid picks | Service weight | Watched weight | Genre weight |
|---:|---:|---:|---:|
| 0 | 55% | 0% | 45% |
| 1–4 | 40% | 40% | 20% |
| **5–12 (typical)** | **30%** | **55%** | **15%** |
| 13+ | 20% | 70% | 10% |

So for a typical onboarding flow, the **watched-grid is the dominant signal at 55% weight**. As the user interacts (taps, dwells, watches), the vector drifts toward the embeddings of titles they engage with.

---

## 3. The observed problem

A new test account was created with a deliberately representative set of preferences:

- **7 selected clusters:** feel-good-funny, dark-thrillers, epic-scifi-fantasy, mind-bending-mysteries, true-crime-real-stories, history-war, prestige-award-winners.
- **7 selected services:** apple, bbc, channel4, itvx, netflix, prime, skygo.
- Watched-grid picks made during onboarding (specific titles not retrieved from the diagnostic, but assumed typical, including titles like Lord of the Rings).

The user reported that the rooms surfaced on For You did not feel aligned with their stated preferences.

### Top 5 rooms returned by the current ranking

| Rank | Cosine distance | Room | Match against user's stated clusters |
|---:|---:|---|---|
| 1 | 0.1251 | Saturday Night Action | partial (action ≈ thriller-adjacent) |
| 2 | 0.1889 | Slow-Burn Horror | **miss** — horror not selected |
| 3 | 0.1938 | Background Procedurals | **miss** — not in any selected cluster |
| 4 | 0.1979 | Date Night Rom-Coms | partial (feel-good-adjacent) |
| 5 | 0.2038 | 90s Courtroom Thrillers | match (true-crime + dark-thrillers) |

### Strong matches that fell *outside* the visible top 5

| Rank | Cosine distance | Room | Match |
|---:|---:|---|---|
| 6 | 0.2060 | Mythological Epics | epic-scifi-fantasy + history-war |
| 7 | 0.2105 | **Cerebral Space** | **strong** — epic-scifi + mind-bending |
| 8 | 0.2116 | **Sunday-Night Crime** | **strong** — true-crime + dark-thrillers |
| 10 | 0.2263 | **WWII European Drama** | **strong** — history-war |
| 11 | 0.2269 | **Dragon Fantasy** | **strong** — epic-scifi-fantasy |
| 13 | 0.2281 | **Slow-Burn Spy** | **strong** — dark-thrillers + mind-bending |
| 14 | 0.2354 | **AI & Robots** | **strong** — epic-scifi + mind-bending |

The five strongest matches against the user's stated preferences are ranked 7–14, just below the visible top 5 cut-off. Meanwhile, two of the visible top 5 (Slow-Burn Horror, Background Procedurals) are clearly outside the user's stated preferences.

This is not a bug. The pipeline is using all three signals correctly, the math is right, and the rooms are well-formed. The output simply doesn't reflect the user's intent as cleanly as it should.

---

## 4. Why this happens — the centroid-flattening problem

Diagnostic comparison of the user's taste vector against (a) the centroids of their selected clusters' representative titles, and (b) the centroids of the top 10 ranked mood rooms:

| Sorted by cosine distance to user's taste vector |  |
|---:|---|
| 0.1251 | room — Saturday Night Action |
| 0.1889 | room — Slow-Burn Horror |
| 0.1938 | room — Background Procedurals |
| 0.1979 | room — Date Night Rom-Coms |
| 0.2038 | room — 90s Courtroom Thrillers |
| 0.2060 | room — Mythological Epics |
| 0.2105 | room — Cerebral Space |
| 0.2116 | room — Sunday-Night Crime |
| 0.2215 | room — Batman Marathon |
| 0.2263 | room — WWII European Drama |
| **0.2314** | **CLUSTER — dark-thrillers** |
| **0.2452** | **CLUSTER — mind-bending-mysteries** |
| **0.2728** | **CLUSTER — feel-good-funny** |
| **0.2868** | **CLUSTER — prestige-award-winners** |
| **0.2933** | **CLUSTER — epic-scifi-fantasy** |
| **0.3010** | **CLUSTER — history-war** |
| **0.3253** | **CLUSTER — true-crime-real-stories** |

**Every one of the user's top 10 ranked mood rooms is closer to their taste vector than ANY of their selected clusters' representative centroids.** Saturday Night Action is at 0.1251; the closest cluster (dark-thrillers) is at 0.2314 — almost twice as far.

### What this means

Two structural patterns in tension:

**Mood rooms have tight, dense centroids.** A room of 30–800 titles in a tight HDBSCAN density region produces a centroid that sits in a *concentrated* region of embedding space.

**Cluster representatives have loose, sparse centroids.** A "cluster" in onboarding is represented by 2–4 hand-picked titles. Their centroid is a noisy average over a small sample, and the chosen titles often span sub-genres.

When the user's taste vector is built by averaging across **7 broad cluster centroids** + watched picks + service centroid, the resulting vector lands in the **densest "intersection" region of embedding space** — which happens to overlap with broadly-popular thriller-adjacent content. Niche selections (history-war, true-crime, epic-scifi-fantasy) pull the vector slightly in their direction but get drowned out by the averaging.

The cosine ranker then dutifully finds the rooms closest to that average vector — which are popular thriller/horror/procedural rooms, not the niche rooms that match any single one of the user's stated preferences.

This is **the centroid-flattening problem** and it's well-known in recommender-system literature. Pure cosine similarity rewards rooms close to the *centre* of the user's preferences, not rooms that satisfy any single preference well. Users feel this as "the recommendations are mid — they don't really know what I like".

---

## 5. Cluster → best-room matching as a fix candidate

A diagnostic was run for the same user, computing for each of their 7 selected clusters the mood room whose centroid is closest to that cluster's representative centroid:

| Cluster | Best-matching room | Distance | Verdict |
|---|---|---:|---|
| feel-good-funny | Date Night Rom-Coms | 0.1523 | strong |
| dark-thrillers | 90s Courtroom Thrillers | 0.1996 | strong |
| epic-scifi-fantasy | AI & Robots (also Cerebral Space at 0.1620) | 0.1598 | strong |
| mind-bending-mysteries | Saturday Night Action | 0.2249 | weak — Inception/Memento embedding overlaps action thrillers |
| true-crime-real-stories | True Crime Deep Dives | 0.2475 | strong |
| history-war | WWII European Drama | 0.1704 | strong |
| prestige-award-winners | Teen Drama | 0.3548 | **bad** — "prestige" is a status, not a content cluster |

**Five of seven clusters have strong matches at distance < 0.25.** Two are problematic in different ways:

- **mind-bending-mysteries → Saturday Night Action (0.2249).** Inception, Memento, Shutter Island, The Prestige are stylish puzzle-thrillers; their centroid happens to sit close to the Saturday Night Action room's centroid. The match isn't "wrong" but it doesn't feel like *the* mind-bending room. There may not be one — visually-stylish puzzle thrillers don't form a coherent enough density region to spawn their own HDBSCAN cluster.

- **prestige-award-winners → Teen Drama (0.3548).** "Prestige" is a quality tier, not a content category. Nomadland and Shawshank Redemption are both prestige but live in completely different content neighbourhoods (drama vs. drama-of-incarceration), so their average centroid lands in no-man's-land. The catalogue has prestigious sci-fi, prestigious crime, prestigious history — but no "prestige" room. This cluster might need to be reframed in onboarding as a tag (an attribute that *modifies* other clusters) rather than a standalone category.

### Pool suggested by this approach (Option A)

If the system selected one room per cluster, applied a 0.30 distance threshold to drop the prestige miss, and sorted by cluster→room distance, the user's top 5 would be:

1. **Date Night Rom-Coms** (0.1523) — feel-good-funny
2. **AI & Robots** (0.1598) — epic-scifi-fantasy
3. **WWII European Drama** (0.1704) — history-war
4. **90s Courtroom Thrillers** (0.1996) — dark-thrillers
5. **Saturday Night Action** (0.2249) — mind-bending

Compared to the cosine-ranking top 5 (*Saturday Night Action, Slow-Burn Horror, Background Procedurals, Date Night Rom-Coms, 90s Courtroom Thrillers*), Option A surfaces two strong matches the cosine ranker buried (AI & Robots, WWII European Drama), drops the rooms the user didn't ask for (Slow-Burn Horror, Background Procedurals), and keeps the strong-match rooms.

### Trade-off

Option A is **deterministic** and **predictable** — it surfaces what the user said they want. But it loses the *organic discovery* the cosine ranker enables: surfacing rooms the user didn't know to ask for. There's a real cost to going fully deterministic, especially as the user's taste vector matures with use.

---

## 6. Three candidate paths forward

### Path A — Best-of-cluster diversification (covered above)

For each user-selected cluster, find the closest room. Apply a quality threshold (drop matches > 0.30 distance). Rank by cluster→room distance. Backfill remaining slots with closest user-vector matches not already in the pool.

- **Pros:** transparent, predictable, directly maps to user stated intent. Works at cold start. Easy to explain to users ("we picked one room for each genre you selected").
- **Cons:** loses cosine-driven serendipity. As the user's taste matures via interaction, this approach doesn't naturally update — you'd still anchor on onboarding cluster picks.
- **Implementation cost:** one new RPC, one small migration to pre-compute and store cluster centroids. ~1–2 hours of engineering.

### Path B — MMR-style diversity over the cosine top-N

Take the top 15 cosine candidates. Iteratively pick: each subsequent room must be at least λ-distant from already-picked rooms in centroid space. Forces the picks to *span* the user's preference space rather than cluster in one neighbourhood.

- **Pros:** keeps cosine as the primary signal; just adds a diversity constraint. Naturally updates as the taste vector matures.
- **Cons:** harder to tune (λ is a magic number). Doesn't guarantee any specific cluster is represented. Joe could still see a sci-fi-shaped pool and a thriller-shaped pool that omits true-crime.
- **Implementation cost:** medium. Algorithm changes inside the RPC. ~half a day.

### Path C — Genre boost on top of cosine

Multiply taste distance by `(1 + α × match_count)` where `match_count` is how many of the user's `home_genres` overlap with the room's dominant genres. Rooms whose genres match the user's stated taxonomy get a soft boost.

- **Pros:** smallest code change. Keeps existing scoring framework intact.
- **Cons:** room "dominant genre" isn't a stored attribute — would need to derive at request time or pre-compute. Tuning α is finicky. Diagnostic runs suggest this might pull one or two strong-match rooms into the top 5 but won't reliably surface the user's full preference set.
- **Implementation cost:** small. ~2–3 hours.

### Path D (open question) — Reframe what a "cluster pick" means in onboarding

The diagnostic exposed a deeper architectural friction. **Onboarding clusters and embedding-space rooms aren't the same thing.**

- **Onboarding clusters** are taxonomic, hand-curated, and broad ("Feel-Good & Funny" is a taxonomy bucket users understand).
- **Mood rooms** are organic, embedding-derived, and granular ("Cosy British Comedy" emerges from the data).

The mismatch between these two views *is* the problem. A user who picks "Epic Sci-Fi & Fantasy" gets fragmented across AI & Robots, Cerebral Space, Mythological Epics, Dragon Fantasy. They expect to see "their sci-fi room" but the catalogue doesn't have one — it has four flavours of it.

Possible reframes:
- **Replace cluster picker in onboarding with a representative-titles picker.** "Pick 3 films/shows that feel like you." The taste vector becomes purely embedding-driven from real titles, and there's no cluster→room translation needed.
- **Annotate each mood room with the onboarding clusters it spans**, so the mapping is explicit. "Dragon Fantasy belongs to: Epic Sci-Fi & Fantasy". Users picking that cluster see the rooms that map to it. Requires editorial work or LLM-assisted annotation.
- **Drop "prestige" from the cluster picker entirely.** It's a tag, not a category — surface it as a per-room badge (✨ Award Winners) rather than a cluster the user picks.

These are larger product decisions, not in scope for the immediate fix, but they're the deeper ground we'd want to think about with strategy input.

---

## 7. Open questions for strategy review

1. **Is "best-of-cluster" the right framing for cold start?** It guarantees the user sees their stated preferences reflected, but it makes the surface feel mechanically 1:1 (one room per pick). Does that match the "Mood Rooms for Tonight" emotional positioning, or does it feel too literal?

2. **How much weight should the watched-grid carry vs. cluster picks?** The current bootstrap weights say 55% watched, 30% services, 15% genre clusters. The data shows the user's 7 cluster picks essentially get drowned out. Should clusters carry more weight, or is the watched-grid simply the better signal we should lean into harder?

3. **Do we need 14 onboarding clusters, or fewer-but-tighter?** The current 14 include "prestige-award-winners" which doesn't have a coherent embedding signal. Trimming to 8–10 well-formed clusters might make the cluster→room mapping cleaner.

4. **Should the room set itself change?** The 69 rooms are derived organically from HDBSCAN — but maybe we need editorial overrides to *create* a "Mind-Bending Puzzles" room (Inception, Memento, etc) that doesn't exist as a density region. Force editorial structure where the embedding space is too smooth to cluster cleanly.

5. **How does this evolve as users interact?** The cold-start case is the worst case. After a user has tapped 50–100 cards, their taste vector is genuinely informed by their behaviour rather than onboarding extrapolation. Do we accept that cold-start ranking is mediocre and rely on quick learning, or do we invest in making cold-start great?

6. **Discovery vs. accuracy.** The cosine ranker can surface a room the user didn't know to ask for. Is that valuable enough to keep some slots dedicated to "organic discovery" rather than only showing best-of-cluster matches?

---

## 8. Recommendations for next steps

Pragmatic engineering proposal for shipping the next iteration:

- **Land Path A with a 0.30 threshold and backfill** as the cold-start ranker. Concretely: for each selected cluster, find best room; drop any cluster→room pair > 0.30; sort by cluster→room distance; backfill remaining slots with closest user-vector matches.
- **Document Path B and C as future work.** Both are valid evolutions once we have engagement data telling us which pattern users actually respond to.
- **Open the architectural questions in Path D for strategy input.** Specifically: what should onboarding cluster picking look like, and how should "prestige"-style tag clusters be handled?
- **Instrument the For You row's mood-rooms slot** with a click-through rate and "skip" rate (user scrolled past without tapping any room). After a few weeks of data, compare whether Path A's deterministic picks have higher engagement than the original cosine ranking — that's the empirical test.

We have all the data and infrastructure to make changes quickly. The hard work is deciding *what* to optimise for: stated intent, organic discovery, or the right balance between the two. That's what we'd value strategy input on.

---

## Resolution path — Phase 4.5 title-anchored ranking (April 2026)

This investigation is closed. The diagnostic above (centroid-flattening for the niche cluster picks) was confirmed by the side-by-side probe at [Mood_Rooms_Anchored_Probe_2026_04_26.md](Mood_Rooms_Anchored_Probe_2026_04_26.md) and resolved by the Phase 4.5 redirect documented in the Phase 4 Title-Anchored Mood Rooms kick-off.

**Resolution.** The For You "Mood Rooms for Tonight" row was flipped from global cosine-distance ranking against `mood_rooms.centroid` to **title-anchored room generation**. Five anchor titles per user per weekly refresh, drawn from a tiered ladder (behavioural intersection → cluster representatives → top-finalScore fallback) with three Tier 1 guards (combined-signal, similarity gate, cluster-coherence). One room per anchor, named "If you love {anchor}". Underlying global rooms infrastructure (`mood_rooms`, `mood_room_titles`, monthly HDBSCAN cron) is unchanged and reserved for the v2.5 dedicated browse surface and Phase 7 conversational discovery.

**Pointers to the outcome:**
- Strategy commitment: [Videx_Recommendation_Engine_v2_Strategy_v1.7.md](Videx_Recommendation_Engine_v2_Strategy_v1.7.md) §5.2.1, §9.3 item 17.
- Orchestration: [Videx_v2_Project_Orchestration_v0.4.md](Videx_v2_Project_Orchestration_v0.4.md) §3.4 (migration 033), §11 confirmed decisions.
- Composition: [Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.4.md](Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.4.md) §3.2 row 2, §3.6.
- Code: `src/lib/recommendations-v2/anchorSelection.ts`, `src/lib/recommendations-v2/anchoredRoom.ts`, `src/hooks/useAnchorMoodRooms.ts`, `src/components/AnchorMoodRoomCard.tsx`, `src/components/AnchorMoodRoomsRow.tsx`, `src/components/MoodRoomPage.tsx` (parameterised with `kind` prop).
- Migration: `supabase/migrations/033_card_impressions_anchor_room_metadata.sql`.
- Parking lot: [Videx_v2_Implementation_Notes_Parking_Lot_v0.4.md](Videx_v2_Implementation_Notes_Parking_Lot_v0.4.md) IN-463 (LLM labels), IN-464 (detail-page room generator), IN-465 (catalogue-sync gap), IN-OB-006 (onboarding cluster taxonomy review under v2 engine assumptions).

**Correction to the probe report's coverage framing.** The probe's "79.2% on-service embedding coverage (14,492 / 18,298)" headline was misdiagnosed as a keyword-precondition issue in the embedding work-queue. The Phase 4.5 backfill investigation (see IN-465) showed the actual situation: the whole `titles` table is effectively 100% embedded (20,109 / 20,116; the 7 missing rows are TMDb-deleted stubs). The "21% gap" is **3,807 tmdb_ids that appear in `streaming_availability` but are absent from the `titles` table entirely** — heavily Prime-skewed, likely outside `scripts/sync-content.ts`'s discover sweep. This is a content-sync gap, not an embedding-pipeline gap. Anchored mood rooms ship cleanly at the current coverage; closing the gap is a parking-lot follow-up, not a Phase 4.5 blocker.

---

*End of briefing document. Closed: Phase 4.5 redirect (April 2026).*
