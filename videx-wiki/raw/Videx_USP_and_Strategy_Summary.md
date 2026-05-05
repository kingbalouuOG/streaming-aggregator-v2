# Videx — USP & Strategy Summary

**Purpose:** Context brief for design review. Summarises what Videx is, who it's for, how it differentiates, and where it's going.

---

## 1. What Videx Is

Videx is a **UK-native, recommendation-first streaming discovery app**. One interface, multiple services, personalised help finding something to watch.

**Target user:** UK households already paying for 2+ streaming services who want more value from those subscriptions rather than adding another one.

**Market backdrop:** UK SVOD penetration has plateaued at ~two-thirds of households since 2021. Users aren't buying more services; they're squeezing more out of what they have. Ad-tier adoption is rising and broadcaster streaming (iPlayer, ITVX, Channel 4, My5) now accounts for ~25% of broadcaster viewing. Videx is built for this "more from less" moment.

---

## 2. The Four-Pillar USP

Our competitors (JustWatch, Reelgood, Plex) have closed the architecture gap on recommendation engines. Differentiation cannot come from "we have a modern recommender" — that's table stakes. It comes from four pillars:

### Pillar 1 — Two-Surface Architecture
**Discovery and personalisation as separate primary surfaces, each with catalogue depth.**

Most aggregators collapse "what's on" and "what's for me" into a muddled home feed. Videx splits them:

- **Home** answers *"what's available right now across my services?"* Recency-led (Recently Added → Trending → Coming Soon), per-service rows (Popular on Netflix, etc.), critically acclaimed new releases via RT + IMDb, only 15–20% taste weight on rows (30–40% on Featured Hero). Zeitgeist language, never mentions personalisation.
- **For You** answers *"what would I love that I might not find on my own?"* Fully personalised, taste-dominant, slider-tunable. **Mood Rooms** are the primary USP expression here — organically clustered, LLM-labelled taste neighbourhoods like "Slow-burn character dramas", "Surreal dark comedies", "Thoughtful post-9/11 political thrillers". Not genre filters, not standard recs. Curated-feeling discovery by aesthetic and emotional register.

Both surfaces are service-filtered (non-negotiable). Max 7–9 rows per surface. Users land on For You post-onboarding, then last-viewed tab thereafter.

### Pillar 2 — Contextual Ranking
**Context shapes ranking; it never filters content out.**

We capture signals competitors ignore: device type, viewing context (solo / with partner / with kids), time availability. These act as soft nudges, not hard filters. A 2-hour film on mobile isn't wrong, just slightly less likely than a 90-minute one. Recommendations feel sensitive to *when* and *how* someone's watching without ever saying "you can't see this because you're on your phone".

### Pillar 3 — Subscription Portfolio as Prior
**Your services reveal your taste before you've rated anything.**

A user with Netflix + MUBI + BFI has a different taste prior from one with Disney+ + Now TV. Each service's content personality is encoded as a "service taste fingerprint" and the user's portfolio bootstraps their taste vector from day zero. This is **aggregator-exclusive** — individual platforms can't use it, and generic CF-based aggregators don't.

### Pillar 4 — Conversational Discovery (Post-v2)
**"Describe what you're in the mood for" and have a real exploratory conversation.**

Reelgood's Cue is verdictive ("should you watch this?") and iOS-only. Videx will ship the *generative* version ("describe what you want, let's explore"), cross-platform, built on our embedding store and taste vectors. Mood rooms are the natural mapping surface — a query like "something slow and atmospheric like *Drive My Car*" maps onto a mood room rather than a from-scratch LLM generation. Not shipped in v2, but the v2 surface is designed to sit underneath it from day one.

---

## 3. Core Commitments

Three non-negotiables that should be legible through the UI:

1. **Privacy-forward.** Age ranges not DOBs. Viewing context stored as a setting, not tracked behaviour. No gender capture. No location beyond region. No third-party sharing. Both ethical choice and competitive positioning against the big platforms.
2. **Designed-in exploration.** 20–25% of every recommendation surface is reserved for content outside the predicted comfort zone. With a small user base, feedback loops amplify dangerously fast; exploration is architected in, not bolted on.
3. **Recommendation-first, not search-first UX.** Discovery is the primary act. Clean, mobile-native, uncluttered. Search exists but is never the front door.

---

## 4. Supporting Features (Retained from v1, Enhanced in v2)

- **Watchlist** — intent-to-watch list. Feeds the "From Your Watchlist" row on For You (replaces need for continue-watching tracking).
- **Spend Dashboard** — strategically aligned with the "more value from what you pay for" thesis. Users see cost-per-hour-watched across services.
- **Detail Page** — deep-links into each service via Streaming Availability API. Only one new affordance in v2: a "Not Interested" button for hard-filter dismissals.
- **Browse, Calendar** — retained. Not the primary discovery path.

---

## 5. What v2 Is Building (Active)

v2 is a ground-up rebuild of the taste model, recommendation engine, onboarding, and signal capture. Frontend shell, design system, and non-recommendation features are retained.

**Key technical commitments:**
- 24D hand-crafted taste vector replaced with OpenAI `text-embedding-3-small` (1536d) content embeddings + learned user taste vectors in the same space
- Supabase pgvector + HNSW index for retrieval
- HDBSCAN clustering on content embeddings for mood rooms (Python + GitHub Actions monthly cron)
- Dedicated `card_impressions` table with pg_partman partitioning (instrumentation ships before any v2 ranking changes)
- 5-step onboarding, sliders (catalogue age, comfort zone, content mix, focused ↔ varied) dual-accessible in Profile and For You

**Sequencing:** Phase 0 (instrumentation + housekeeping) → Phase 1 (embeddings + vector store) → Phase 3 (hook rewrites) → Phase 4 (mood rooms) → Phase 5 (contextual signals) → Phase 6 (launch).

---

## 6. Where It's Going (Post-v2)

- **v2.5:** dedicated Mood Rooms browse surface, potential Watchlist/Save-for-Later split, iOS build.
- **v3:** conversational discovery (Pillar 4 shipped) built on Graphiti + Kuzu for temporal knowledge graph memory. Semantic search via embeddings. Zero infrastructure cost at early scale, clear migration thresholds to FalkorDB (~20K users) and Neo4j (~100K users). Purely additive to v2 infrastructure.
- **Collaborative filtering** re-evaluated when we hit ~10K MAU.

---

## 7. Design Implications (for the design review)

Things the UI has to make legible:

- **Home vs For You feel genuinely different.** Home = zeitgeist, recency, service-forward. For You = personal, mood-led, taste-led. Not two tabs with slightly reshuffled rows.
- **Mood Rooms are the emotional centre of the app.** They should feel curated and atmospheric, not like genre filters or algorithmic rows.
- **Recommendation-first is a visual stance**, not just an IA decision. Search shouldn't dominate; the primary gesture should be browsing what we've chosen for you.
- **Privacy-forward is a design tone**, not just a settings page. The app shouldn't feel like it's surveilling the user.
- **Deep-linking out is a celebrated action**, not a failure. Users going into Netflix/Prime/iPlayer via Videx is the success state. The hand-off should feel elegant.
- **The Spend Dashboard is a value statement**, not a utility screen. It reinforces the "more from what you pay for" thesis.

---

**Primary references:** Strategy v1.6.3, Home & For You Hypothesis v0.3, Detail Page Spec v0.3.2, Orchestration v0.3.3, Parking Lot v0.3.4.
