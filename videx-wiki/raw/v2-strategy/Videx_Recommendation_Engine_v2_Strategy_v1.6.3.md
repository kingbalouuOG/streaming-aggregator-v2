# Videx Recommendation Engine v2 — Strategy Document

**Author:** Head of Strategy & Engineering (with Joe)
**Date:** April 2026
**Status:** v1.6.3 — §6 migration numbers renumbered by +2 to absorb Phase 0's in-phase deviations (migrations 015 and 016); Phase 0 description updated to reflect actual scope
**Version:** 1.6.3

**Changes from v1.6.2:**
- §6 migration numbers renumbered by +2 from Phase 0.5 onwards to absorb the two in-phase Phase 0 deviations (migrations 015 and 016 for `card_impressions` partition RLS).
- Phase 0 description updated to reflect actual scope (5 migrations, not 3) — adds migrations 015 (existing-partition RLS hardening) and 016 (event trigger for new partitions).
- Phase 0.5 migration reference updated from 015 → 017.
- Phase 1 migration references updated from 016/017 → 018/019.
- Phase 2 migration reference updated from 018 → 020.
- Phase 3 migration references updated from 019/020 → 021/022.
- Phase 4.5 migration reference updated from 021 → 023.

**Changes from v1.6.1:**
- Section 6.4 `card_impressions` schema tuple corrected: `tmdb_id` → `content_id` for consistency with the dedicated schema in Detail Page Signal Capture Spec Section 5.2
- See Corrections v0.3.2 patch document for the full diff

**Changes from v1.6:**
- Column references aligned to actual schema: `event_type` (not `interaction_type`), `content_id` (not `tmdb_id`)
- Share signal removed from weight tables — not implementable without a share button in the v1 codebase
- Phase 3 hook rewrite scope updated from 8 to 9 files (added `LazyGenreSection.tsx`)
- Quiz weight column header clarified as confidence gain, not vector weight
- Slider name formatting standardised to "Focused ↔ Varied"
- See Corrections v0.3.1 document for the full diff

**Inputs:** Streaming Recommendation Algorithms Report (April 2026); consolidated research brief; JustWatch hands-on testing; Home & For You Composition Hypothesis v0.3; Detail Page Signal Capture Spec v0.3; Implementation Notes Parking Lot v0.3; Project Orchestration v0.3; CC codebase review rounds 1-3.

**Changes from v1.5:**
- **Section 1.4 (new):** v1-archival reframe explicitly documented. No parallel run, no feature flags, no Phase 6.5 cleanup phase.
- **Section 4.0 (Content metadata layering):** clarified that `title_genres` is resolved via static TMDb genre mapping (reusing existing `GENRE_NAMES` in `genres.ts`), not by populating the empty `title_genres` table.
- **Section 4.1 (signal table):** added runtime capture to the content metadata enrichment scope; embedding template updated to include runtime line.
- **Section 5.2 (User taste vector):** detail page "More Like This" scoring approach locked — batch Supabase query for candidate embeddings + client-side cosine similarity. Phase 1 wire format spike added as a prerequisite for Phase 3.
- **Section 5.2 (Mood Rooms):** HDBSCAN execution environment locked as Python + GitHub Actions monthly cron, using psycopg2 for direct PostgreSQL connection. TypeScript HDBSCAN alternatives ruled out.
- **Section 5.2 (Vector store):** Supabase Pro tier commitment reflected in capacity planning. HNSW index build time noted as a one-time phase-1 operation requiring dedicated compute.
- **Section 6.4 (Instrumentation):** card impression tracking commits to a dedicated `card_impressions` table with pg_partman partitioning (not a JSONB extension of `user_interactions`). Client-side batching approach specified.
- **Section 7.2 (Phasing):** Phase 3 scope expanded to include explicit hook-level rewrites. Phase 6.5 (Legacy Cleanup) removed — cleanup happens in-phase. Phase 0 includes the `dismiss` → `not_interested` rename with `getDismissedIds()` rewrite as a transitional fix.
- **Section 9 (Summary):** all new locked decisions captured as commitments.

---

## 1. Strategic Context

### 1.1 The market we're in

The UK streaming aggregator market has two defining features: **it is a mature, multi-service environment**, and **it is plateaued**. Two-thirds of UK households have subscribed to at least one SVOD service since 2021 — that number has not moved in four years. What has changed is behaviour within that subscription base: ad-tier adoption on Netflix doubled year-on-year (13% → 28%), Disney+ ad-tier more than tripled (7% → 23%), and broadcaster streaming (BBC iPlayer, ITVX, Channel 4, My5) now accounts for roughly a quarter of all broadcaster viewing.

UK users are not buying more services. They are squeezing more value from what they have.

This is the structural backdrop against which Videx competes. It is the backdrop the "catalogue depth as a feature" thesis in our research brief maps directly onto. It is also why the Spend Dashboard is strategically correct.

### 1.2 The competitive landscape

Our direct competitors are JustWatch, Reelgood, and Plex. Based on hands-on testing of JustWatch and public-source analysis of Reelgood and Plex:

**JustWatch** is the market leader and, since December 2023, operates a modern two-tower recommendation architecture with approximate nearest neighbour vector search. They have architectural parity with Netflix-grade systems. Their onboarding captures minimal explicit signal (service selection + "what are you currently watching?") but works because they have enough users for collaborative filtering to locate taste quickly. Their UX is search-and-availability-first with recommendations bolted on, and they monetise via affiliate click-through, a PRO paywall, and sponsored title placements. Their coverage in the UK is broader than ours on arthouse services (MUBI, BFI, Curzon).

**Reelgood** covers 100+ services with an explicit tracking interface — users manually mark every episode as watched. They shipped "Cue", an LLM-based chatbot that gives a verdict on any title ("Should you watch this?") in mid-2023. **Cue is iOS-only**, meaning Reelgood cannot reach the roughly 55–60% of UK users on Android with their differentiated feature.

**Plex** is a hybrid: personal media server + streaming discovery. Different positioning; not a direct competitor for our core use case.

### 1.3 What this means for Videx

The market-leader (JustWatch) has closed the architecture gap. Our differentiation cannot come from "we have a modern recommendation engine" — that is table-stakes as of late 2023. Our differentiation has to come from three places:

1. **Signals we capture that they don't** (device, viewing context, mood, catalogue-age preference, co-viewing).
2. **UX that is recommendation-first, not search-first** (a clean, mobile-native, uncluttered experience that treats discovery as the primary act).
3. **UK-specific content and context depth** (BVoD/PSB integration, multi-service household dynamics, the catalogue-depth thesis).

Everything in this strategy document flows from those three differentiation axes.

### 1.4 Migration model: v1 archived, v2 builds forward

**A central architectural decision sits above the rest of this document: v1 is being archived as a Git tag rather than run in parallel with v2.** This reframe, locked through strategy review rounds 1-3, changes how the v2 build is sequenced and organised. It does not change the strategic commitments below — the recommendation engine restructure, the two-surface architecture, the 5-step onboarding, the embedding-based taste vector, mood rooms, and all other product decisions are locked regardless of migration model.

What the archival reframe means in practice:

- v1 is tagged as `v1-archive` on the current `main` commit. v2 builds forward on `main` as a series of phase feature branches.
- There is no parallel run between v1 and v2. When a v2 phase replaces a v1 subsystem, the v1 code is deleted in that same phase.
- There is no feature flag or A/B rollout mechanism. The two-prototype-user context makes this unnecessary.
- There is no Phase 6.5 legacy cleanup phase. Cleanup is continuous and happens in-phase.
- There is no migration path for existing users. The two prototype users will re-onboard on v2 at cutover.

The frontend shell, design system, content rendering components, navigation, platform integrations, and non-recommendation features (Browse, Watchlist, Calendar, Spend Dashboard, Detail Page UI shell) are retained and enhanced where needed. What gets replaced is the taste model, recommendation engine, onboarding flow, and signal capture infrastructure.

Full details of the migration model, branching strategy, and infrastructure approach are in **Project Orchestration v0.3**.

---

## 2. Our USP Thesis — The Four Pillars

Videx is the recommendation-first, UK-native streaming discovery app that helps you get more from the services you already pay for. Our differentiation rests on four pillars:

### Pillar 1 — Two-Surface Architecture: Discovery and Personalisation, Each With Catalogue Depth

**UK users want more value from existing subscriptions. We deliver this through two distinct surfaces — Home for discovery and For You for personalisation — each surfacing catalogue depth in different ways.**

Most streaming aggregators collapse "what's on" and "what's for me" into a single home surface, with rows that mix popularity-driven content and personalised recommendations in confusing ways. Videx splits these into two distinct primary tabs in the bottom navigation:

**Home is the discovery surface.** It answers "what's available to watch right now across my services?" without needing to know anything about the user's individual taste beyond their service selections. Home leads with recency (Recently Added → Trending → Coming Soon), supports per-service browsing (Popular on Netflix, Popular on Prime Video, etc.), and surfaces critical consensus through a "Critically Acclaimed New Releases" row driven by Rotten Tomatoes and IMDb scores. Home applies only light taste influence (15-20% weight on row ordering, 30-40% on the Featured Hero) to keep the surface honest to its discovery purpose. The Home surface uses zeitgeist language ("trending", "popular", "recently added") and never mentions personalisation.

**For You is the personalised surface.** It answers "what would I love that I might not find on my own?" using the user's full taste profile, watch history, ratings, and slider preferences. For You is where Mood Rooms live as the dominant content type — organically clustered, LLM-labelled taste neighbourhoods that emerge from the content embedding space rather than being defined by hand. A mood room might be "Slow-burn character dramas", "Surreal dark comedies", "Thoughtful post-9/11 political thrillers", or "Comfort-watch British sitcoms." These are not genre filters and they are not standard personalised recommendations — they are curated-feeling discovery surfaces that give users a way to explore the catalogue by aesthetic and emotional register.

Mood rooms are generated by running density-based clustering (HDBSCAN) over the full content embedding space, then labelling each cluster with a two-pass LLM process that names and describes the room based on its most central titles. The clustering re-runs monthly with stability constraints so room identities persist over time. Editorial review can refine auto-generated labels asynchronously without disrupting the pipeline.

On the For You surface, mood rooms appear as a "Mood Rooms for Tonight" row showing 3-5 rotating rooms. The full set refreshes weekly on a predictable schedule (Spotify Discover Weekly model), with shuffled session ordering within the week to maintain freshness without daily disorientation. A dedicated mood rooms browse surface is deferred to v2.5 — for v2 MVP, the row on For You is the only entry point.

This two-surface architecture is a genuine USP. JustWatch gives users a single home surface with mixed content types and genre/service filters. Reelgood gives the same plus a verdictive AI assistant. Neither separates "what's out there" from "what's for me" into two distinct mental modes. Both surfaces deserve top-level navigation because they answer different questions, and the two-surface architecture makes the distinction visible to users from the moment they open the app.

For You also exposes four sliders (Catalogue age, Comfort zone, Content mix, Focused ↔ Varied) that let users tune how recommendations are served. Sliders use a dual-access model ("Option C"): canonical state lives in Profile (the "Tune Your Recommendations" sub-page), with contextual access from For You via a collapsed "Tune your recommendations" entry point that opens as a modal or bottom-sheet tray. State is shared between the two locations.

Mood rooms are also a natural foundation for Pillar 4 (conversational discovery): a user typing "something slow and atmospheric like Drive My Car" maps onto a mood room rather than requiring a from-scratch LLM generation.

### Pillar 2 — Contextual Ranking Adjustments
**Context shapes ranking; it does not filter content out.**

We capture and act on signals that JustWatch and Reelgood do not: device type, viewing context (solo / with partner / with kids), and time-availability. These signals act as **soft nudges to ranking**, not hard filters. A 2-hour film on mobile is not wrong — it's just slightly less likely than a 90-minute one, all else being equal. The goal is that recommendations feel sensitive to when and how someone is watching, without ever saying "you can't see this because you're on your phone."

### Pillar 3 — Subscription Portfolio as Prior
**Your services reveal your taste before you've rated anything.**

A user with Netflix + MUBI + BFI has different taste priors from one with Disney+ + Now TV. We will encode each service's content personality as a "service taste fingerprint" and use the user's subscription portfolio to bootstrap their taste vector from day zero, before any onboarding signal or interaction. This is an aggregator-exclusive signal. Individual platforms cannot use it; generic CF-based aggregators ignore it.

### Pillar 4 — Conversational Discovery (Post-v2)
**"Describe what you're in the mood for" — and have a real exploratory conversation.**

Reelgood's Cue is verdictive ("should you watch this?") and iOS-only. We will ship the generative version ("describe what you want and let's explore together"), built on top of our embedding store and taste vectors, cross-platform. Not shipped in v2 engine, but designed as a UX surface that sits on top of the v2 engine from day one.

---

## 3. Core Strategic Commitments

Three things we commit to explicitly in v2:

**(a) Privacy-forward positioning.** We capture age ranges, not dates of birth. We store viewing context (solo/couple/family) as a user setting, not as a tracked behaviour. We do not capture gender. This is both an ethical choice and a competitive positioning choice against the big platforms.

**(b) Designed-in exploration.** With a small user base, feedback loops amplify faster and more dangerously. We reserve a meaningful slice of every recommendation surface (~20–25% initially, tapering as confidence grows) for exploration — surfacing content outside the predicted comfort zone. This is not optional; it is architected in from day one.

**(c) Measurability before shipping.** We commit to a specific set of evaluation metrics (Section 6) and we instrument impression tracking before any v2 code ships. Without this, we cannot know if v2 is better than v1.

---

## 4. Signal Architecture — What We Capture, Infer, and Decline

### 4.0 Content metadata layering (foundational)

Before signals reach the recommendation engine, content metadata flows through three distinct layers. Understanding this layering matters because each layer has different storage, query, and ownership requirements.

**Layer 1 — Raw first-party metadata (persistent in Supabase)**
TMDb keywords, top 5 cast, director, content rating, runtime, and other structured attributes, stored as queryable fields on the `titles` table. This layer serves three purposes: (a) it is the input to embedding generation, (b) it enables structured queries that vector search cannot answer (e.g. "all films directed by Christopher Nolan"), and (c) it is the source material for LLM-based enrichment in Layer 2.

**Genre handling specifically:** the `title_genres` table exists in the current Supabase schema but is empty in production (no sync script populates it). Rather than backfilling it, v2 uses a static TMDb genre ID to name mapping from the existing `GENRE_NAMES` constant in `src/lib/constants/genres.ts`. The mapping is small (~20 entries for movies, ~16 for TV) and stable. Embedding generation resolves `titles.genre_ids` (integer array) against `GENRE_NAMES` at embedding time to produce human-readable genre strings for the embedding template. The `title_genres` table is not used and can be dropped in Phase 0.5 or left empty indefinitely.

**Layer 2 — LLM-generated enrichment tags ("Videx tags")**
Richer, more consistent semantic descriptors generated by an LLM from Layer 1 source material. Example: existing TMDb keywords for a title might be "family business, wealthy family"; the Videx-tag layer might add "corporate power struggle, generational conflict, morally grey protagonists, satirical tone." This is our equivalent of Disney's Magic Words pattern. Stored as a separate queryable field on `titles`.

**Layer 3 — Vector embeddings (pgvector)**
Mathematical representation used by the recommendation engine, generated from Layer 1 + Layer 2 combined. This is what cosine similarity operates over.

**Each layer depends on the one below.** Skipping Layer 1 limits Layer 2's quality and forces Layer 3 to be rebuilt whenever the missing data is added. Therefore Layer 1 is a hard prerequisite for any production embedding work.

**Strategic commitment:** All recommendation-relevant metadata must live as persistent first-party data in Supabase — not on-device, not fetched live from TMDb per request. This is a foundational v2 decision that precedes embedding work.

### 4.1 Signals we will capture (new in v2)

**Onboarding signals (captured once, updatable in settings):**

| Signal | Captured where | Required? | Why it matters |
|---|---|---|---|
| **Age range** | Step 1 (Create Account) — dropdown labelled "(optional)"; users can leave blank | Optional | Soft demographic prior. Informs Step 3 title curation and long-term segmentation. Missing → population-level prior used. |
| **Viewing context** | Step 1 (Create Account) — "How do you usually watch?" (Solo / With a partner / With family / Mix), labelled "(optional)"; users can leave blank | Optional | Household viewing pattern. Persistent setting; informs Step 3 curation and ranking. Missing → solo default. |
| **Services subscribed** | Step 2 | Required (minimum 1) | Drives service fingerprint cold-start (Pillar 3). |
| **Watched titles (multi-select grid)** | Step 3 — 6-title grid, 3 rounds with differentiated slices and "skip round" affordance | Optional per round | Primary cold-start content signal. Richer than A/B pairs. |
| **Genre preferences** | Step 4 (What do you watch?) — multi-select, minimum 3 genres, no upper cap | Required (minimum 3) | Foundational taste signal, used throughout retrieval and ranking. |
| **Delivery sliders** | Step 5 (Here's what we've learned) — 4 continuous sliders: catalogue-age, comfort-zone, films-vs-TV, Focused ↔ Varied | Defaults set to Balanced | Tune how recommendations are *served*, not what is recommended. Modify pipeline weights, not taste vector. |

**Ongoing signals (captured in-app):**

| Signal | Captured where | Why it matters |
|---|---|---|
| **Device type** | Session context (mobile / tablet / TV via Capacitor platform detection) | Soft ranking nudge. Not a hard filter. |
| **Card impressions** | Passive — instrumented on all surfaces with source surface tagging (`home`, `for_you`, `browse`, `watchlist`, `search`, `detail`) | **Prerequisite for meaningful evaluation.** Stored in dedicated `card_impressions` table (see Section 6.4). |
| **Dwell time + exit outcome on detail pages** | Passive — time spent on detail view AND what the user did when they left | Critical: dwell time alone is meaningless. See Detail Page Signal Capture Spec v0.3 Section 3.2 for the full interpretation matrix. |
| **Deep-link click-through** | Passive — elevated to highest behavioural weight (+0.8) with confidence tagging based on AppLauncher.openUrl() outcome | Strongest proxy for "did you watch this?" we can get. See Detail Page Signal Capture Spec v0.3 Section 2.6. |
| **"Not Interested" affordance** | Active — new v2 detail page button (binary, no reason menu) | Hard filter on the title; no taste vector update. Renamed from the existing but unused `dismiss` event type in Phase 0. |
| **Search queries** | Passive — user-initiated searches | New in v2: search queries become a taste signal. |

**Phase 0.5 Layer 1 metadata enrichment scope:**

- `keywords` — TMDb keywords (array)
- `cast_top_5` — top 5 billed cast members
- `director` — director or primary creator
- `content_rating` — UK certification (PG/12/15/18)
- `runtime` — duration in minutes (movies: `runtime` field; TV: `episode_run_time[0]` if available, omit if empty)

All five columns are added to the `titles` table. Backfill runs as a one-time script from Joe's laptop against the ~20K existing titles. Ongoing enrichment of new titles happens via a separate Edge Function (`enrich-new-titles`) that runs after the main sync and processes titles where enrichment columns are NULL.

**Embedding template (locked):**

```
{title} ({release_year}) - {media_type}
Genres: {genres}
Overview: {overview}
Keywords: {keywords}
Cast: {cast}
Runtime: {runtime} minutes
```

Empty lines are omitted (don't write "Keywords: " with nothing after). Runtime line is omitted if null. Trim to ~2000 characters maximum. Genres are resolved from `genre_ids` against the static `GENRE_NAMES` mapping in `genres.ts`.

**Note on deferred/removed signals:**
- **Scroll depth** was considered and deferred to post-v2.
- **Trailer playback** is not applicable — Videx has no in-app trailers.
- **"Back-from-rec bounces"** are subsumed into the dwell + exit outcome model.

### 4.2 Signals we already capture, kept or elevated in v2

| Signal | v1 weight | v2 weight | v2 treatment |
|---|---|---|---|
| Thumbs up | 1.0 | **+1.0** | Kept as the primary explicit positive |
| Thumbs down | 0.6 | **−0.6** | Kept as the primary explicit negative; propagates to similar titles |
| Watchlist add | 0.3 | **+0.3** | Kept |
| Watchlist remove | 0.4 | **−0.4** | Kept as negative signal |
| Mark as watched | 0.5 | **+0.5** | Kept (already exists in v1) |
| Watched + thumbs up | (separate) | **+1.5** | New combined signal — replaces both individual signals when both occur |
| Quiz answers | 0.20 / 0.10 / 0.05 (confidence gain per dimension, not vector weight) | **REMOVED** | The 24D handcrafted quiz subsystem is replaced by the watched-grid in Step 3 of onboarding. Quiz code is removed in Phase 3 alongside the rest of the v1 taste system. |

### 4.3 Signals we decline to capture (privacy stance)

- No date of birth (age range only, if at all)
- No gender
- No precise location (UK-regional at most)
- No cross-app tracking or device fingerprinting
- Viewing context stored as a user setting, not behavioural tracking

**This is a product decision with strategic weight.** We compete on trust as well as quality.

### 4.4 Subscription portfolio as signal (Pillar 3 implementation)

Each supported streaming service gets a pre-computed **service taste fingerprint** — an embedding generated from the aggregate metadata of its top catalogue titles. Examples of what these encode:

- **Disney+** → family, franchise, animation, superhero, Star Wars, broad-appeal
- **Apple TV+** → prestige drama, slow-burn, contemporary, limited series, understated
- **MUBI** → arthouse, international, auteur, experimental
- **BBC iPlayer** → UK drama, documentary, period, comedy, factual
- **Netflix** → broad, genre-diverse, global, high-variance

When a user selects their services during onboarding, we blend those service fingerprints (weighted by reported usage if available, equally if not) to form a **Bayesian prior** on their taste vector. This is their day-zero taste representation, before any onboarding signal or in-app interaction.

**Validation step:** generate and validate the service fingerprints empirically in Phase 2. Take top 100–200 titles from each service (by popularity/ratings), embed them, compute the centroid. Cross-check that the centroids produce meaningful discrimination between services.

### 4.5 Onboarding flow specification

The onboarding flow has been designed to maximise signal capture per step while minimising friction. Target: ~90 seconds end-to-end. **Designs are complete and approved as of v1.5.**

**Step 1 — Create Account**
- Email, username, password (required)
- Terms of Service and Privacy Policy acknowledgement (implicit on Continue tap, link included)
- Age range dropdown labelled "(optional)" — users can leave blank
- "How do you usually watch?" labelled "(optional)" — Solo / With a partner / With family / Mix
- Copy framing: *"This helps us recommend the right content for how you watch. Entirely optional."*

**Step 2 — Your Services**
- Multi-select service grid in UK market share order: Netflix → Prime Video → Disney+ → BBC iPlayer → ITVX → Channel 4 → NOW → Sky Go → Apple TV+ → Paramount+
- "Select All" affordance
- Selection counter at the bottom
- Minimum 1 service required
- Drives service fingerprint cold-start

**Step 3 — What have you watched?**
- 6-title grid with real TMDb poster art, multi-select per round
- 3 rounds with differentiated slices:
  - Round 1: broadly popular, recognisable mainstream content
  - Round 2: recent prestige content from the user's selected services
  - Round 3: deeper-cut content matching emerging signals from Rounds 1-2
- Title pool filtered to user's selected services from Step 2
- Mixed across film and TV, mixed across UK and international content
- Each round includes "See different titles" affordance AND "I haven't watched any of these — skip this round" affordance
- Cold-start can still proceed if all 3 rounds are skipped (relies on Step 4 + service fingerprints)

**Step 4 — What do you watch? (Genre preferences)**
- Multi-select genre grid
- Minimum 3 genres required, no upper cap
- Genre taxonomy is placeholder in the designs; final taxonomy reviewed during implementation

**Step 5 — Here's what we've learned (Sliders + Summary)**
- **Taste summary card at the top** — natural-language summary describing inferred content identity
- **4 delivery sliders** that tune how recommendations are *served*:

  | Slider | Poles | What it modifies |
  |---|---|---|
  | **Catalogue age** | New releases ↔ Best match regardless of age | Recency weight in Stage 2 ranking (baseline 20%) |
  | **Comfort zone** | Stick with what I like ↔ Surprise me | Exploration ratio (baseline 20–25%) |
  | **Content mix** | Focus on films ↔ Focus on TV series | Content-type filter in Stage 1 retrieval |
  | **Focused ↔ Varied** | Go deeper ↔ See more variety | Row diversity vs depth in Stage 3 row selection |

- **Sliders are continuous, not snap-to-state.** Each slider has a descriptive state label that updates dynamically as the user drags
- Sliders **do not modify the taste vector** — they modify pipeline parameters
- Sliders auto-save on release

**Note on the "Focused ↔ Varied" slider:** this replaces the earlier "Depth vs breadth" framing which implied episode-level progress tracking. Videx has no per-episode state and cannot know whether a user is mid-series. The slider still modulates row composition (deeper similar-content rows vs greater row variety) but the copy now reflects what the mechanism actually does.

**Progress indicator:** visible throughout flow ("Step 2 of 5"). No skip paths. Back button on each step preserves state.

**Total steps:** 5. **Target duration:** ~90 seconds.

---

## 5. Engine Architecture — Principles and Specific Recommendations

### 5.1 Architectural principles

**Principle 1 — Multi-stage pipeline, not monolithic scoring.** v1 is a single scoring function. v2 separates (a) candidate retrieval, (b) ranking, (c) row selection, (d) within-row ordering. Each stage has a clear job, can be evaluated independently, and can be upgraded without rewriting the whole system.

**Principle 2 — LLM embeddings for content, hand-built model for user taste.** We do not need to train our own item tower. We use off-the-shelf embeddings for content vectors. User taste is still a model we build ourselves — because user behaviour data is what we own, and user taste is what differentiates us.

**Principle 3 — Pragmatism over cleverness at our scale.** We do not have enough users for collaborative filtering to work well, nor enough data to train neural ranking models. v2 is a well-engineered content-based + contextual system. We can add collaborative signals later when user volume supports them.

**Principle 4 — Evaluation before deployment.** No v2 stage ships without offline evaluation against the metrics defined in Section 6.

### 5.2 Specific architectural recommendations

**Content embeddings (locked):**
- **Model:** OpenAI `text-embedding-3-small` (1536-dim, $0.02/M tokens)
- **Rationale:** won head-to-head against Voyage 3.5-lite on 510-title sample (~1.8x better genre separation, ~2.1x better service discrimination)
- **Cost:** one-time backfill of 20K titles ≈ £0.20; ongoing ≈ £0.50/month. Trivial.
- **Validation step:** embed 500 representative titles, cluster, verify clusters are semantically coherent.
- **What we embed:** title + year + media type + genres + overview + keywords + cast + runtime (per embedding template in Section 4.1).

**Vector store (locked):**
- **Extension:** Supabase's pgvector
- **Index:** HNSW for approximate nearest neighbour search
- **Capacity planning:** 20K titles × 1536-dim × 4 bytes ≈ 117MB for vectors. HNSW index adds ~2-3x overhead → ~350MB total. Comfortably within Supabase Pro's 8GB database limit.
- **Index build:** one-time operation during Phase 1, run after bulk embedding insert (not concurrently). Runs from a migration script or from Joe's laptop, not from an Edge Function (Edge Functions have 150s timeout; HNSW index build at 20K vectors takes minutes but not hours).
- **Phase 1 wire format spike (prerequisite):** before Phase 3 depends on client-side retrieval of embeddings, Phase 1 validates the pgvector-to-TypeScript serialization path. The Supabase JS client's deserialization of `vector(1536)` columns is version-dependent — it may return vectors as PostgREST-serialized strings (`"[0.1,0.2,...]"`) or as parsed arrays. The spike inserts test embeddings, queries them via the Supabase JS client, and confirms the returned format. If deserialization requires a workaround, Phase 1 produces a locked pattern (Supabase RPC casting to `float4[]`, or a view with `::float4[]` cast, or a client-side parser). This pattern becomes the locked approach for Phase 3's detail page scoring.

**User taste vector (v2):**
- **Representation:** single vector in the same embedding space as content (1536-dim)
- **Computation:** weighted aggregate of content vectors from user interactions, where weights are (per Detail Page Signal Capture Spec v0.3):
  - Thumbs up: +1.0
  - Watched + thumbs up: +1.5 (combined signal replaces both individual signals)
  - Mark as watched: +0.5
  - Watchlist add: +0.3
  - Deep-link click-through: +0.8 (highest behavioural signal — the user committed to watching)
  - Watchlist remove: −0.4
  - Thumbs down: −0.6
  - Not interested: hard filter only (no taste vector update)
  - Detail view dwell + back-to-previous (no action): weak negative (−0.15 to −0.35 by dwell duration)
  - Detail view dwell < 3s: ignored as accidental tap
  - Negative dwell session cap: −1.0 cumulative per session
- **Decay:** explicit signals (thumbs, watchlist, watched) decay with a 180-day half-life. Behavioural signals (dwell-based) decay with a 90-day half-life.
- **Confidence floor:** first 20 interactions weighted at 1.5x to accelerate cold-start convergence.
- **Bootstrapping:** initial taste vector = weighted blend of service fingerprints + watched-grid signals from onboarding Step 3 + genre selections from Step 4.

**Candidate retrieval (Stage 1):**
- **Method:** cosine similarity between user taste vector and all content vectors, filtered by: (a) availability on user's services, (b) device-appropriate length, (c) not-yet-on-watchlist, (d) not-recently-dismissed (via `user_interactions WHERE event_type = 'not_interested'`), (e) not previously thumbs-downed.
- **Retrieval volume:** top 500 candidates per request.

**Ranking (Stage 2):**
- **Method:** re-rank retrieved candidates using a weighted score:
  - **50%** taste-vector similarity (from Stage 1)
  - **20%** recency (modulated per user by Catalogue-age slider)
  - **10%** contextual fit (device, viewing-context — soft nudges only)
  - **10%** intra-list diversity
  - **10%** cross-service / portfolio spread
- **Weights will be tuned** via offline evaluation (Section 6).
- **All scoring on the same numerical scale.** The v1 `scoreCandidate()` bug (cosine similarity on 0-100 scale added to weighted components) is explicitly not carried forward. v2 uses weighted sums of unit-length embedding deltas for taste, and ranking weights as percentages summing to 100%. No mixing of raw and normalised scores.

**Phase 4 implementation (shipped):** The 50/20/10/10/10 table represents intent. In implementation, the three *scoring* components (taste, recency, contextual) form the Stage 2 weighted sum normalised to 1.0 — taste 62.5% / recency 25% / contextual 12.5% — while intra-list diversity and cross-service spread are implemented as **post-processing stages** (genre-spread + de-clustering), not as literal scoring components. Weight constants live in `src/lib/recommendations-v2/weights.ts`. The contextual component returns a neutral 0.5 in Phase 4 (placeholder); when Phase 5 replaces it with a real scorer, the 62.5/25/12.5 split should be re-evaluated. The Catalogue-age slider modulates recency weight between 10-30% with proportional re-normalisation of the other two components.

**Slider modifications to pipeline:**
- **Catalogue-age slider** → scales recency weight (default 20%, range ~10–30%)
- **Comfort-zone slider** → scales exploration ratio in Stage 3 (default 20–25%, range ~10–40%)
- **Content-mix slider** → filters retrieval in Stage 1 (films-weighted vs TV-weighted)
- **Focused ↔ Varied slider** → modifies Stage 3 row selection (deeper similar-content rows vs greater row variety)

**Row selection (Stage 3) — split by surface:**

Row composition is materially different between Home and For You. The full row composition specifications live in the **Home & For You Composition Hypothesis v0.3** — this section summarises.

**Home rows (in order):**
1. Featured Hero Carousel — 3-5 large rotating heroes, taste weight 30-40%
2. Recently Added to Your Services — last 30 days, taste weight 15-20%
3. Trending Across Your Services — cross-service popularity, taste weight 15-20%
4. Coming Soon — upcoming releases on user's services
5. Per-Service Charts — one row per service (top 3 most-used services)
6. Critically Acclaimed New Releases — algorithmically selected from titles with Rotten Tomatoes ≥80%, IMDb ≥7.5, released in last 90 days
7. Genre Spotlight — rotating, one genre per session

Maximum 7-9 rows. Light taste influence throughout.

**Note on "Critically Acclaimed New Releases" sequencing:** this row depends on OMDB-sourced Rotten Tomatoes scores being current. The current OMDB daily refresh job has a multi-week backfill window. The row is gated on OMDB backfill completion — it does not ship until OMDB data is populated for at least 80% of the relevant recent releases.

**For You rows (in order):**
1. Sliders entry point — collapsed "Tune your recommendations" affordance, opens as modal/tray
2. Recommended For You — flagship row, full v2 ranking pipeline output
3. Mood Rooms for Tonight — 3-5 rotating mood rooms, weekly refresh with shuffled session ordering
4. Hidden Gems — low-popularity, high-taste-fit titles
5. Because You Watched [Title] — up to 2 rows, anchored on titles that satisfy BOTH watchlist add AND thumbs-up
6. More From [Director/Actor] — conditional
7. Outside Your Usual — exploration row, sized by Comfort Zone slider
8. From Your Watchlist — utility row at the bottom

Maximum 7-8 rows. Heavy personalisation throughout.

**Detail page "More Like This" in v2 (locked):**

The v1 `useContentDetail.ts` hook currently computes 24D content vectors inline in the browser for every similar/recommended title. This works because 24D vectors are cheap and deterministic from genre IDs. With 1536D embeddings, client-side vector computation is impossible — embeddings come from an API call not made client-side.

v2's approach: when the detail page loads, the hook fetches candidate similar titles from TMDb's similar/recommended endpoints (unchanged), then issues a single Supabase batch query to pull pre-computed embeddings for those candidates:

```sql
SELECT tmdb_id, embedding FROM titles WHERE tmdb_id = ANY($1)
```

The returned embeddings (20-40 candidates × 1536-dim × 4 bytes ≈ 246KB per request) are used for client-side cosine similarity against the user's taste vector (also loaded client-side). Scoring and sorting happen in TypeScript, same as the v1 pattern, just with different vector dimensions.

**One extra Supabase roundtrip per detail page view.** This is acceptable — detail pages are not high-frequency and 246KB is trivial over modern connections.

**Alternatives considered:**
- Server-side RPC: clean but splits scoring logic across TypeScript and SQL/plpgsql, invites divergence bugs
- Simplified client-side heuristic without taste vector: loses personalisation on the detail page, regression from v1

Both alternatives rejected in favour of the batch query + client-side scoring approach.

**Prerequisite:** this approach depends on the Phase 1 wire format spike (see Vector store subsection above). If the spike finds that pgvector deserialization requires a workaround, Phase 3's detail page rewrite uses whatever pattern the spike produces.

**Within-row ordering (Stage 4):**
- Titles ordered by ranking score from Stage 2, with diversity constraints (no two titles from same franchise consecutively, genre variation within row).

**Mood Rooms (Pillar 1 personalised discovery surface):**
- **Definition:** organically clustered, LLM-labelled taste neighbourhoods emerging from the content embedding space. Clustering is global (same rooms for all users). Which rooms appear on a given user's For You surface and in what order is taste-fit-driven.
- **Clustering method:** UMAP preprocessing (1536D → 10D) followed by density-based clustering (HDBSCAN) on the low-dim output. Pure HDBSCAN on raw 1536D embeddings fails on this catalogue (2 clusters, 10% coverage) because of the curse of dimensionality; UMAP is the canonical fix used by BERTopic / Top2Vec and is required here. Centroids and centrality are computed in the **original 1536D space** so the frontend's taste-fit scoring works against 1536D taste vectors.
- **Expected output:** 30–60 mood rooms, each containing 30–800 titles, covering ~50–60% of the catalogue.
- **Coverage ceiling is structural, not tunable.** Phase 4.5 ran four orthogonal tuning passes (UMAP `n_neighbors`, HDBSCAN `min_cluster_size`, `cluster_selection_method`, `max_cluster_size`) and coverage moved within a 51–58% band. ~45% of the 20K catalogue sits in sparse regions of the embedding space without dense neighbours. The pre-data estimate of 70–80% coverage proved optimistic for OpenAI `text-embedding-3-small` on this UK-focused catalogue. Full tune sequence: Parking Lot IN-457.
- **Hybrid clustering (HDBSCAN + k-means on noise) rejected.** Would buy coverage at the cost of incoherent synthetic rooms — titles forced into clusters they don't belong to, which undermines the mood-rooms UX. Non-clustered titles still surface via other For You rows (Recommended, Hidden Gems, Because You Watched). Quality is prioritised over coverage. Revisit after 3 monthly runs per Parking Lot IN-459 if engagement data reveals under-served titles in sparse regions.
- **Execution environment (locked):** Python script running via GitHub Actions monthly cron. HDBSCAN has no production-quality TypeScript implementation; the canonical Python library (`hdbscan`) is the right tool. Running it from GitHub Actions avoids the operational cost of a dedicated Python service or microservice.
- **Script location:** `scripts/mood_rooms/recluster.py` in the main repo.
- **Dependencies:** `hdbscan`, `numpy`, `psycopg2-binary`, `openai`, pinned in `scripts/mood_rooms/requirements.txt`.
- **Database connection:** the script uses `psycopg2` with Supabase's direct PostgreSQL connection string (available in the Supabase dashboard), not the Supabase Python REST client. This avoids PostgREST's default row limit when pulling 20K embeddings and is faster for bulk vector reads.
- **Runtime expectation:** 5-15 minutes per run at 20K titles. Well within GitHub Actions' 6-hour per-job limit.
- **Schedule:** `cron: '0 3 1 * *'` — 03:00 UTC on the 1st of each month. Workflow file: `.github/workflows/mood-rooms-recluster.yml`.
- **Secrets:** `SUPABASE_CONNECTION_STRING` and `OPENAI_API_KEY` via GitHub Actions Secrets.
- **Labelling:** two-pass LLM labelling. First pass sends each cluster's 20 most central titles to GPT with prompt: "Generate a 2-4 word name and a 1-sentence description for the taste neighbourhood these titles share." Second pass is manual editorial review and override of weak labels.
- **Re-clustering cadence:** monthly, with stability constraints. Clusters that remain >80% stable across re-clustering (same core titles) preserve their ID, label, and user data.
- **Storage:** new `mood_rooms` table on Supabase with `id`, `label`, `description`, `cluster_params`, `created_at`, `updated_at`, `is_curated` (flag for manual label override), `title_count`, and `version`. Cluster membership stored in a `mood_room_titles` join table linking to `titles.tmdb_id`.
- **Editorial layer:** mood room labels and descriptions can be manually overridden. Editorial overrides persist across re-clusterings as long as the cluster remains stable.

**Vector store vs row selection interaction:** the For You "Mood Rooms for Tonight" row queries `mood_rooms` and `mood_room_titles` tables, not the embedding index directly. Room selection is a join-and-filter query, not a vector search.

### 5.3 What we explicitly do NOT build in v2

- **Two-tower neural model with trained towers.** Premature; we don't have the training data.
- **Thumbnail personalisation.** Netflix-scale feature; not our fight.
- **Reinforcement learning.** Worth revisiting when we have 12+ months of user data.
- **Collaborative filtering.** Re-evaluate when we hit ~10K MAU with consistent activity.
- **Full conversational discovery.** Designed for on top of v2, built next.
- **Feature flag infrastructure.** Not needed; there is no v1/v2 parallel run (see Section 1.4).
- **A/B rollout framework.** Not needed for the same reason.
- **Migration path for v1 users.** Two prototype users re-onboard on v2 at cutover.

---

## 6. Evaluation Framework

### 6.1 North Star metrics (Tier 1)

| Metric | Target direction | Measured how |
|---|---|---|
| **Detail-view rate @ 10** | ↑ vs v1 baseline | Of top-10 recs shown, what % clicked into detail |
| **Watchlist conversion rate @ 10** | ↑ vs v1 baseline | Of top-10 recs shown, what % added to watchlist |
| **Deep-link click-through rate** | ↑ vs v1 baseline | Of detail views from recs, what % clicked deep-link |

**These are the three metrics v2 must improve.** If they don't, v2 isn't better than v1.

### 6.2 Diversity / serendipity metrics (Tier 2)

| Metric | Target direction |
|---|---|
| **Intra-list diversity (ILD)** | Maintained or ↑ |
| **Catalogue coverage (% of cache recommended in 30 days)** | ↑ |
| **Long-tail ratio (% recs below-median popularity)** | ↑ |
| **Cross-service ratio** | ↑ |

### 6.3 Engagement / session metrics (Tier 3)

| Metric | Target direction | Notes |
|---|---|---|
| **Conversion rate from detail view to action** | ↑ | "Action" = thumbs up, watchlist add, mark watched, or deep-link click |
| **Deep-link click rate from detail page** | ↑ | Strongest behavioural commitment signal |
| **7-day return rate** | ↑ | Standard retention metric |
| **Sessions per active user per week** | ↑ or maintained | Engagement frequency |
| **"Not Interested" rate** | Maintained or ↓ | High rates suggest recommendations are missing the mark |

**Note:** dwell time and scroll depth are NOT used as standalone engagement metrics in v2 — they're misleading without exit outcome context.

### 6.4 Instrumentation prerequisites (must ship in Phase 0)

1. **Card impression tracking via dedicated `card_impressions` table.** Schema: `(id, user_id, content_id, source_surface, position, session_id, shown_at)` with typed columns (not JSONB). Monthly partitioning via `pg_partman` extension (available on Supabase Pro). 90-day row-level retention, then aggregation to daily totals and deletion of individual rows. Source surface values: `home`, `for_you`, `browse`, `watchlist`, `search`, `detail`.

    **Client-side batching (required):** do not emit one Supabase INSERT per card impression. Accumulate impression events in a client-side buffer and flush via a single `supabase.from('card_impressions').insert(batch)` call. Flush triggers:
    - 10-second interval timer
    - Buffer reaches 100 events
    - App lifecycle: background, foreground
    - Bottom nav tab change (any switch between Home / For You / Browse / Watchlist / Profile)
    - Detail page entry (before the detail page loads)
    - Component unmount on app close
    - Retry once on network failure, then drop the batch (impressions are not critical data)

    Tab change and detail page entry are natural batch boundaries — without them, impressions from one surface sit in the buffer while the user browses another, breaking session-based analysis. Both hooks already exist in `App.tsx`: `handleTabChange` for tab switches and `handleItemSelect` for detail page navigation.

2. **Session identifier.** Generated as a UUID on app foreground after >5 minutes of background time. All interactions during a session are tagged with the session_id. Used for session-based metrics and the negative dwell session cap.

3. **Dwell time + exit outcome capture.** Timer from detail-page mount to exit, captured alongside the `exit_reason` (deep_link_click, added_to_watchlist, thumbs_up, thumbs_down, marked_watched, not_interested, back_to_previous, app_backgrounded). The timer pauses on `appStateChange { isActive: false }` and resumes on `appStateChange { isActive: true }`. See Detail Page Signal Capture Spec v0.3 for full lifecycle details.

4. **"Not Interested" affordance.** New v2 detail page button (binary, no reason menu). Replaces the existing unused `dismiss` event type with the renamed `not_interested` event_type.

5. **Lifecycle manager.** A new module (`src/lib/lifecycle/appState.ts`) centralises `App.addListener('appStateChange')` for Capacitor, exposes subscribe/unsubscribe for components that need background/foreground awareness, and exposes a `flushImpressions()` function called by the impression batcher. Both the dwell timer and the impression batcher subscribe to this manager rather than registering their own Capacitor listeners.

### 6.5 Offline evaluation methodology

Before shipping v2 (end of Phase 4), we replay existing `user_interactions` events against v2's ranking and compare against a synthetic v1-style baseline. With only two prototype users, this is a sanity check rather than a statistically meaningful comparison — v2's real validation comes from post-launch Tier 1 metrics against actual usage. The offline replay serves to catch obvious regressions before shipping (e.g., the ranking pipeline returning empty results for known users, ranking being dramatically worse on canonical examples).

---

## 7. Phased Roadmap

### 7.1 Design exploration status (all complete)

As of v1.5, all design exploration areas are complete and approved:

- ✅ Onboarding flow (5 steps, end-to-end)
- ✅ Profile restructure (landing page with 7 action rows, all sub-pages designed)
- ✅ Sliders integration (Option C dual-access)
- ✅ Bottom navigation (5 tabs: Home, For You, Browse, Watchlist, Profile)
- ✅ Home & For You surface layouts
- ✅ Mood Rooms visual treatment (distinct room cards with preview thumbnails)

**Build-first items (no design prerequisite):**
- Card impression tracking and batching (Phase 0)
- Content metadata enrichment migration (Phase 0.5)
- Content embedding pipeline (Phase 1)
- Service fingerprint computation (Phase 2)
- User taste vector re-expression (Phase 3)
- Ranking weight tuning (Phase 4)
- Offline evaluation harness (Phase 4)
- Mood room clustering pipeline (Phase 4.5)

### 7.2 Phasing

**Phase 0 — Instrumentation and Phase 0 housekeeping.** Ship:

- Card impression tracking: dedicated `card_impressions` table with `pg_partman` partitioning (migration 014), partition-level RLS hardening at apply time (migration 015) and on all future partitions via a `ddl_command_end` event trigger (migration 016), lifecycle manager (`src/lib/lifecycle/appState.ts`), client-side batching with the flush trigger set from Section 6.4
- Session identifier generation (on app foreground after >5min background)
- Dwell timer with pause/resume on background/foreground, exit outcome capture, and deep-link click confidence tagging (high-confidence if `AppLauncher.openUrl()` succeeds, low-confidence if fallback to browser)
- `dismiss` → `not_interested` rename (migration 013 + code rename across `interactions.ts`)
- `getDismissedIds()` rewrite: change source from localStorage to `user_interactions` query (`WHERE user_id = $1 AND event_type = 'not_interested'`), cache result in memory for session, invalidate on new not_interested event. Function signature stays identical (`Promise<Set<string>>`). Delete localStorage dismissal writer path (`dismissRecommendation`, `isDismissed`, `cleanExpiredDismissals`, `getDismissedRecommendations`).
- localStorage v1 clear on first v2 launch via `@videx_version` flag check
- "Not Interested" detail page button (new v2 UI element)
- `age_range` and `viewing_context` columns added to `profiles` (migration 012) for v2 onboarding Step 1

**Phase 0 prerequisites (run before Phase 0 starts):** migration 011 (profiles baseline) must be applied, Supabase Pro upgrade complete, CI workflows in place, mirror remote set up, v1-archive tag created. See Project Orchestration v0.3 Section 12.

**Phase 0 duration:** ~1.5-2 weeks (revised up from the earlier 1-week estimate to account for the dwell timer lifecycle and deep-link correlation complexity).

**Phase 0.5 — First-party content enrichment.** Schema migration (migration 017) adds persistent first-party metadata to the `titles` table:

- `keywords` — array of keyword strings from TMDb
- `cast_top_5` — array of top-billed cast
- `director` — string or array
- `content_rating` — certification (PG/12/15/18 in UK context)
- `runtime` — integer (minutes)

**Two-part execution:**

1. **One-time backfill** runs as a script on Joe's laptop against the ~20K existing titles. No Edge Function timeout pressure. Uses TMDb's `append_to_response=credits,keywords,release_dates` pattern for efficient per-title enrichment. Expected runtime: several hours given TMDb's 260ms rate limit × 20K titles × multiple calls per title. Script location: `scripts/enrichment/backfill_metadata.ts`.

2. **Ongoing enrichment** via a new Edge Function (`enrich-new-titles`) that runs after the main daily sync. The function queries `SELECT tmdb_id FROM titles WHERE keywords IS NULL LIMIT 100`, fetches enrichment data for each, writes back. No job marker or queue table needed — `WHERE keywords IS NULL` is the work queue.

**Critical acceptance criteria — row-count validation:** the migration is not complete until row counts are validated. After the backfill runs, `SELECT COUNT(*) FROM titles WHERE keywords IS NOT NULL` must return at least 80% of total titles. Same check applies to `cast_top_5`, `director`, `content_rating`, and `runtime` columns. **Cautionary tale:** the v1 `title_credits` table exists with the correct schema but is completely empty in production because sync scripts were never run or were silently disabled. The same failure mode exists for `title_genres`. Schema existence ≠ data existence. Phase 0.5 must verify both.

**Do not begin Phase 1 until Phase 0.5 acceptance criteria are met** — otherwise embeddings will need to be rebuilt once enrichment lands. ~1–2 weeks.

**Phase 1 — Content embeddings.** Embed the full content cache using Layer 1 enriched data.

**Embedding model (locked):** OpenAI `text-embedding-3-small`, 1536-dim, template from Section 4.1.

**Migration 018** enables the pgvector extension, adds `embedding vector(1536)` column to `titles`, creates HNSW index. The new column uses a different name from the legacy `content_vector` to avoid constraint conflicts.

**Migration 019** (end of Phase 1) drops the legacy 24D `content_vector` column and its `chk_content_vector_dim` constraint. Sync scripts (`sync-content.ts`, `sync-incremental/index.ts`) are updated in Phase 1 to stop computing 24D vectors and start computing/storing 1536D embeddings instead.

**pgvector wire format spike (required before Phase 3):** insert test embeddings, query via Supabase JS client, verify return format. If the default behaviour requires a workaround, the spike produces a locked pattern (RPC, view, or client-side parser) that Phase 3 uses. This is the last thing Phase 1 does before closing out.

**Index build coordination:** run the HNSW index build after the bulk embedding insert, not concurrently. Run from a migration script or Joe's laptop, not an Edge Function. Expected runtime: minutes, not hours, on Supabase Pro dedicated compute.

**Validate cluster coherence empirically** (e.g., Nolan films cluster together, BBC period dramas cluster together). ~1–2 weeks.

**Phase 1.5 — Videx tags (optional, can defer).** LLM-generated semantic tags on top of Layer 1 metadata. Improves embedding quality and unlocks richer row generation. Can ship after Phase 1 without rebuilding embeddings if tags are added as an additional input layer in a future re-embedding pass. ~1–2 weeks when prioritised.

**Phase 2 — Service fingerprints.** ✅ Complete. Compute centroids per service (migration 020), validate discrimination, ship service-fingerprint table. ~1 week. 10 services fingerprinted; discrimination eval conditional pass (catalogue overlap is structural). See Phase 2 summary.

**Phase 2.5 — TMDb watch/providers backfill.** Fill streaming_availability gaps for BBC iPlayer, NOW TV, Sky Go using TMDb discover data. No migration needed. Prerequisite for Phase 3 cold-start to cover all 10 UK services. ~0.5 week.

**Phase 3 — User taste vector v2.** ✅ Complete. Re-expressed user taste in embedding space (migrations 023–025, 028). Ten files rewritten (9 from plan + useTasteProfile). Auth sign-up integrated into onboarding Step 1. v1 quiz subsystem deleted. Bootstrap uses dynamic 4-band weights by watched-grid selection count (0 selections → 0.55/0.00/0.45; 1-4 → 0.40/0.40/0.20; 5-12 → 0.30/0.55/0.15; 13+ → 0.20/0.70/0.10). Files rewritten:

- **`useHomeContent.ts`** — currently loads a 24D TasteProfile and passes it to every section for scoring. Rewritten to call the new recommendation hooks (which internally use the v2 ranking pipeline).
- **`useContentDetail.ts`** — currently computes 24D content vectors inline for "More Like This." Rewritten to use the batch Supabase query approach (fetch candidate embeddings, client-side cosine similarity). Depends on Phase 1 wire format spike outcome.
- **`useSectionData.ts`** — currently uses `reorderWithinWindows` and `hybridScore` from `genreBlending.ts`. Rewritten to use v2 equivalents or to delegate scoring to a central ranking function.
- **`useRecommendations.ts`** — thin wrapper around v1 recommendation engine. Pointed at v2 engine instead. Trivial rewrite.
- **`useHiddenGems.ts`** — thin wrapper, same treatment.
- **`useUserPreferences.ts`** — taste vector lifecycle through onboarding and cluster changes. Rewritten for v2 taste vector shape and bootstrapping.
- **`OnboardingFlow.tsx`** — replaces the v1 quiz subsystem with the 5-step v2 onboarding. The design is done; Phase 3 wires it to the new taste vector and service fingerprint logic.
- **`ProfilePage.tsx`** — taste profile display and "retake quiz" removed; replaced by "Refine preferences" and "Retake taste summary" actions per the Profile restructure designs.
- **`LazyGenreSection.tsx`** — currently passes `GenreAffinities` and `TasteVector` through to `useSectionData`. Updates to match the new `useSectionData` interface. Smaller change than the hooks but in the same file set because it consumes types from the v1 taste system.

**Migration 022** (end of Phase 3) drops the 24D taste vector columns and the `interaction_log` JSONB column from the taste profiles table. The quiz subsystem (`quizConfig.ts`, `quizScoring.ts`, `TasteQuiz.tsx`, `QuizQuestion.tsx`), `scoreCandidate()`, `recomputeVector()`, `genreBlending.ts`, and other v1 taste system files are deleted in this phase.

The two prototype users will lose their existing taste profiles at this point. They re-onboard on v2 on next app launch. Acceptable.

~2–3 weeks (revised up from ~2 weeks due to hook rewrite scope).

**Phase 4 — Ranking pipeline & row composition.** ✅ Complete. Full multi-stage pipeline replacing Phase 3 cosine-only ranker. Single source of truth for weights in `weights.ts` (taste 62.5% + recency 25% + contextual 12.5% placeholder). Pluggable diversity (genre-spread with taste cluster secondary signal; MMR deferred to Phase 5). Home surface: 7 rows (Hero Carousel, Recently Added, Trending, Coming Soon, Per-Service Charts, Critically Acclaimed [gated], Genre Spotlight). For You surface: up to 7 rows (Recommended For You, Hidden Gems, Because You Watched, More From [Director/Actor], Outside Your Usual, From Your Watchlist). All 4 delivery sliders wired to pipeline parameters with bottom-sheet tray + haptic feedback. Shared 500-candidate pool for taste-vector rows; in-memory re-ranking on slider change. Zero migrations. See Phase 4 summary.

**Phase 4.5 — Mood Rooms.** Create `mood_rooms` and `mood_room_titles` tables (migration 023). Create Python clustering script at `scripts/mood_rooms/recluster.py`, dependencies at `scripts/mood_rooms/requirements.txt`. Create GitHub Actions workflow at `.github/workflows/mood-rooms-recluster.yml`. Configure GitHub Actions Secrets (`SUPABASE_CONNECTION_STRING`, `OPENAI_API_KEY`). Run the script once manually via `workflow_dispatch` to generate the initial mood rooms. Integrate "Mood Rooms for Tonight" row on the For You surface. Dedicated mood rooms browse surface is **deferred to v2.5**. ~2–3 weeks.

**Phase 5 — Contextual signals.** Replace the `contextual.ts` placeholder (returns neutral 0.5 in Phase 4) with real scoring: device detection, viewing-context handling, time-of-day mood adaptation. When this ships, the 62.5/25/12.5 scoring weight split should be re-evaluated since the contextual component will have real ranking influence. ~2 weeks.

**Phase 6 — Launch.** v2 is complete. Build Android APK, install on test device, verify end-to-end. No cutover ceremony — v2 is just the next build of the app. Two prototype users re-onboard on their next app launch.

**Phase 7 (post-v2) — Conversational discovery.** Built on top of v2 infrastructure, using mood rooms as the primary mapping surface for natural-language queries.

**Realistic timeline for Phases 0–6:** approximately **14–18 weeks of focused effort**, not counting Phase 7. Phase 1.5 (Videx tags) adds 1-2 weeks if prioritised.

**Note on the absence of Phase 6.5:** the original v1.5 strategy included a dedicated "Legacy Cleanup" phase after Phase 6. With the v1-archival reframe, cleanup happens in-phase: Phase 1 drops the 24D vector column, Phase 3 drops the interaction_log JSONB and the quiz subsystem, etc. By the time Phase 6 ships, there is no v1 legacy left to clean up.

---

## 8. Risks and Open Questions

### 8.1 Risks

| Risk | Mitigation |
|---|---|
| **LLM embeddings don't discriminate well for our content type.** | ✅ MITIGATED. Head-to-head validation completed. OpenAI selected. |
| **Service fingerprints are too coarse or too similar.** | Validate cluster discrimination empirically in Phase 2. |
| **Contextual signals feel invasive or slow onboarding.** | Optional fields, late-bound. Device detection is passive. |
| **Offline evaluation doesn't predict online performance.** | Standard limitation; mitigate with post-launch Tier 1 metric monitoring. |
| **We over-invest in architecture before validating demand.** | Ship Phases 0–3 before committing to Phases 4–6. |
| **Phase 0.5 backfill silently fails (`title_credits` cautionary tale).** | Row-count validation as hard acceptance criteria for every enrichment column. |
| **Negative dwell signals collapse a user's taste vector during exploratory browsing.** | Negative session cap of −1.0. |
| **pgvector wire format breaks client-side retrieval.** | Phase 1 spike produces a locked pattern before Phase 3 depends on it. |
| ~~**HDBSCAN produces bad clusters at 20K scale.**~~ | ✅ Resolved in Phase 4.5: pure HDBSCAN failed (2 clusters, 10% coverage); UMAP preprocessing + HDBSCAN ships 68 clusters at 53.5% coverage. Hybrid fallback rejected (would degrade quality). Re-evaluate coverage after 3 monthly runs per IN-459. |
| **GitHub Actions cron fails silently for mood room reclustering.** | Monitor workflow history monthly. Add a Supabase write timestamp that alerts if reclustering is >35 days old. |
| **Hook-level rewrites in Phase 3 drag in more scope than expected.** | CC reviewed the coupling in round 2 and identified the specific files. Phase 3 spec enumerates them explicitly. |
| **Phase 0.5 backfill takes longer than laptop uptime.** | Script supports resume-from-last-completed. Run overnight or in batches. |
| **Conversational discovery gets deprioritised and Reelgood ships a better cross-platform version.** | Accept as competitive risk. |

### 8.2 Open questions to validate during v2 build

**Resolved as of v1.6:**
1. ~~Which embedding model wins head-to-head?~~ ✅ OpenAI text-embedding-3-small
2. ~~Which embedding template performs best?~~ ✅ Locked in Section 4.1
3. ~~How is HDBSCAN executed given no TypeScript library exists?~~ ✅ Python via GitHub Actions monthly cron
4. ~~How is the v1/v2 transition managed?~~ ✅ v1 archived as Git tag, v2 builds forward on main
5. ~~How is detail page "More Like This" scored with 1536D embeddings?~~ ✅ Batch Supabase query + client-side cosine
6. ~~How is `dismiss` → `not_interested` transitioned without breaking the v1 engine mid-build?~~ ✅ `getDismissedIds()` rewritten in Phase 0

**Still open (validate during v2 build):**
1. **Do service fingerprints meaningfully improve cold-start?** Measure in Phase 2.
2. **What's the right exploration ratio default?** Start at 20–25%, measure in Phase 4.
3. **Slider → pipeline mapping specifics.** Confirm exact weight ranges empirically.
4. **Watched-grid title selection algorithm** — how to select the 6 titles per round such that rounds produce differentiated, informative slices. Implementation details in parking lot IN-OB-002.
5. ~~**Does HDBSCAN produce 30-60 usable clusters at 20K scale?**~~ ✅ Resolved in Phase 4.5 (see Section 5.2 + Parking Lot IN-457): pure HDBSCAN failed with 2 clusters / 10% coverage; UMAP+HDBSCAN ships 68 coherent clusters at 53.5% coverage. Cluster-count gate met (slight overshoot, 68 vs 30-60 target; monitor stability across runs 2-3). Coverage plateau is structural — hybrid fallback rejected per Section 5.2.
6. **Auto-generated taste summary quality.** Qualitative review of LLM-generated summaries before launch.
7. **Genre taxonomy validation.** Final taxonomy reviewed during implementation.
8. **Negative dwell signal calibration.** Are the proposed weights the right starting points?
9. **Is pg_partman automatically creating monthly partitions as expected?** Verify in Phase 0 after the first month ticks over.

### 8.3 Deferred strategic questions

- **When does collaborative filtering become viable?** Probably at ~10K MAU with regular activity.
- **Do we eventually train our own item tower?** Maybe at ~50K MAU with 6+ months of interaction data.
- **Is arthouse coverage (MUBI, BFI, Curzon) worth adding?** Later strategic question.
- **Do Mood Rooms evolve into user-shareable "list-rooms"?** Deferred until mood rooms are proven.

---

## 9. Summary: What v2 Commits Us To

### 9.1 Architecture and infrastructure

1. **A multi-stage recommendation pipeline** replacing the current monolithic scoring function.
2. **Three-layer content metadata model** — raw first-party, LLM-enriched tags, vector embeddings.
3. **First-party metadata as a hard prerequisite** — Phase 0.5 with row-count validation.
4. **OpenAI text-embedding-3-small** for content embeddings.
5. **pgvector with HNSW indexing** on Supabase Pro tier.
6. **User taste vector in embedding space** with service-fingerprint cold-start.
7. **Detail page "More Like This" via batch Supabase query + client-side cosine similarity**, with Phase 1 wire format spike as prerequisite.
8. **Static TMDb genre mapping** via existing `GENRE_NAMES`, not the empty `title_genres` table.

### 9.2 Two-surface architecture

9. **Two distinct primary surfaces** — Home (discovery) and For You (personalised).
10. **Home is service-filtered, recency-dominant, lightly taste-influenced.**
11. **For You is heavily personalised, mood-room-led, slider-tunable.**
12. **Home rows** per Home & For You Composition Hypothesis v0.3, maximum 7-9 rows.
13. **For You rows** per Home & For You Composition Hypothesis v0.3, maximum 7-8 rows.
14. **"Critically Acclaimed New Releases" row gated on OMDB backfill completion.**
15. **No continue-watching tracking.**

### 9.3 Mood Rooms

16. **Mood Rooms as Pillar 1 USP** — HDBSCAN clustering via Python + GitHub Actions monthly cron, two-pass LLM labelling, monthly re-clustering with stability constraints.
17. **Mood Rooms appear only on For You in v2 MVP** as a "Mood Rooms for Tonight" row with weekly refresh. Dedicated browse surface deferred to v2.5.
18. **`psycopg2` direct PostgreSQL connection** for bulk vector pulls, not Supabase REST client.
19. **Sliders Option C dual-access** — canonical state in Profile, contextual access from For You modal/tray.
20. **4 delivery sliders** that tune pipeline parameters, not taste vector. **"Depth vs breadth" renamed to "Focused ↔ Varied"** to reflect what the mechanism actually does.

### 9.4 Onboarding and signal capture

21. **5-step onboarding flow**, designed and approved.
22. **Step 5 is the emotional payoff** — taste summary card + sliders.
23. **No A/B quiz pairs** — watched-grid multi-select replaces them.
24. **Designed-in exploration** from day one, user-adjustable via Comfort Zone slider.
25. **Privacy-forward stance** — age range and viewing context optional, no gender, no demographic profiling.
26. **Detail page signal model corrected** — detail views are NOT positive signals. See Detail Page Signal Capture Spec v0.3.
27. **"Not Interested" affordance** — new v2 detail page button, replaces the unused v1 `dismiss` event type.
28. **`getDismissedIds()` rewritten in Phase 0** to query `user_interactions` instead of localStorage, keeping the v1 recommendation engine working through Phases 1-3 without transitional dual-write.

### 9.5 Process and infrastructure

29. **Evaluation infrastructure** as a hard Phase 0 prerequisite — dedicated `card_impressions` table with `pg_partman` partitioning, client-side batching with specified flush triggers, session IDs, dwell-time-with-exit-outcome plumbing, lifecycle manager.
30. **Three committed North Star metrics** that v2 must improve.
31. **v1 archived as Git tag**, v2 builds forward on `main`. No parallel run, no feature flags, no Phase 6.5.
32. **Cleanup happens in-phase**, not deferred to a separate cleanup phase.
33. **Supabase Pro tier** locked for v2 development and first months post-launch.
34. **Numbered migrations 011 onward**, starting with profiles baseline migration.
35. **Phase 0.5 sync split** — one-time backfill from Joe's laptop, ongoing enrichment via separate `enrich-new-titles` Edge Function.
36. **Phase 3 hook-level rewrites explicitly scoped** to 9 files (useHomeContent, useContentDetail, useSectionData, useRecommendations, useHiddenGems, useUserPreferences, OnboardingFlow, ProfilePage, LazyGenreSection).
37. **Conversational discovery (Phase 7, post-v2)** designed on top of v2 infrastructure.

---

*End of strategy document v1.6.1. All architectural decisions from CC review rounds 1-3 locked. Ready for Phase 0 preparation after the Project Orchestration v0.3 action items are complete.*
