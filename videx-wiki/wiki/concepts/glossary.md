---
title: Glossary
type: concept
tags: [glossary, terminology, conventions]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/reference/glossary.md
related:
  - wiki/concepts/architecture/two-surface-architecture.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/entities/codebase/database-schema.md
  - wiki/entities/codebase/event-taxonomy.md
---

# Glossary

Single-page reference for acronyms, internal naming, and recurring terms. Mirrors `raw/reference/glossary.md`. Update when canonical names change.

## Project terms

| Term | Meaning |
|---|---|
| Videx | The product. Mobile-first UK streaming aggregator. |
| Surface | A top-level UI screen tied to user intent (Home, For You, Browse, Watchlist, Profile, Calendar, Mood Room). |
| Home | Discovery surface. Recency-led, lightly personalised. |
| For You | Personalised surface. Heavy ranking, sliders, mood rooms. |
| Mood Room | Topical cluster of titles produced by HDBSCAN over title embeddings. |
| Service / Platform | Streaming provider. Internal slugs: `netflix`, `prime`, `disney`, `apple`, `now`, `bbc`, `itvx`, `channel4`, `paramount`, `skygo`. |
| Variant | TMDb provider that should be canonicalised (e.g. "Netflix Standard with Ads" → Netflix). |
| Deep link | Exact URL into a streaming app for a specific title. May be HTTPS that resolves to a native intent on Android. |
| Search-URL fallback | Search query URL on a service's website used when an exact deep link is unavailable (BBC iPlayer, Sky Go). |
| Confidence (deep link) | `high` if `AppLauncher.openUrl()` succeeded and reached the app; `low` if it fell back to a browser. |

## Recommendation terms

| Term | Meaning |
|---|---|
| Taste vector / `taste_vector_v2` | The user's 1536D representation in embedding space. Updated incrementally from interactions. |
| Title embedding | A title's 1536D `text-embedding-3-small` vector, computed from the locked template. |
| Archetype | One of 16 hand-curated taste clusters used to bootstrap a new user's vector during onboarding. |
| Service fingerprint | Per-service centroid in embedding space. Biases cold-start recommendations toward subscribed services. |
| Cold start | New user with no interaction history. Resolved by onboarding signals + archetypes + service fingerprints. |
| Warm | User vector dominated by behavioural signals rather than bootstrap. ~50 interactions in. |
| Hard filter | Pre-scoring filter that removes a candidate (not_interested, thumbs_down, unavailable, watched). |
| Soft filter / scoring | Numeric score combining taste, recency, contextual components. |
| Diversity post-processing | Genre spread and service de-clustering after scoring, before rendering. |
| Slider | User-tunable parameter that modulates pipeline weights (Catalogue Age, Comfort Zone, Content Mix, Focused ↔ Varied). |
| Centrality | A title's distance to its mood room's centroid. Used to pick thumbnails. |
| Recency anchor | Date used in recency scoring: `release_date` for For You; `MAX(release_date, available_since)` for Home. |

## Signal terms

| Term | Meaning |
|---|---|
| Explicit signal | User-initiated action with intentional meaning (thumbs, watchlist, not_interested). |
| Silent signal | Behaviour-derived (detail view, dwell, scroll, deep-link click). |
| Dwell | Time on the detail page, accounting for backgrounding. |
| Session ID | UUID generated per app session. Resets after 5 minutes of background. |
| Source surface | The surface a card was tapped from. Stored on every interaction event. |
| Impression | A card shown to the user. Stored in the partitioned `card_impressions` table, batched client-side. |
| Interaction | A signal-bearing event written to `user_interactions`. |

## Ops terms

| Term | Meaning |
|---|---|
| CC | Claude Code, primary implementation partner. |
| Phase | Discrete chunk of v2 work (Phase 0, 0.5, 1, 2, 2.5, 2.6, 3, 4, 4.5, ...). Each has a phase branch and end-of-phase summary doc. |
| IN-XXX | Implementation notes in the parking lot. Subdivided by phase: `IN-001`-`IN-013` (Phase 0), `IN-101`-`IN-107` (Phase 0.5), `IN-PX-XX` (Phase 0.5 deviations), `IN-XPS-XXX` (cross-phase). |
| Parking lot | `docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_*.md`. Implementation-level notes filed during strategy/design that need to land in CC briefs at the right phase. |
| Migration NNN | A SQL file under `supabase/migrations/`. Numbering monotonic, gap at 021 intentional. |

## Stack acronyms

| Term | Meaning |
|---|---|
| TMDb | The Movie Database. Primary metadata + provider source. |
| OMDB | Open Movie Database. Source of IMDb + Rotten Tomatoes ratings. |
| SA API | Streaming Availability API by Movie of the Night. UK deep links + pricing. |
| JustWatch | Upstream availability data aggregator. SA API and TMDb's `watch/providers` are both downstream. |
| RT | Rotten Tomatoes. |
| HDBSCAN | Hierarchical Density-Based Spatial Clustering of Applications with Noise. |
| HNSW | Hierarchical Navigable Small World. The pgvector index type Videx uses. |
| RLS | Row-Level Security (Postgres). |
| RPC | Remote Procedure Call. Used for any callable function on Supabase. |
| PITR | Point-in-Time Recovery. |
| PWA | Progressive Web App. Not Videx's deployment model; Capacitor wraps the web bundle as a native APK. |
| JWT | JSON Web Token. Supabase auth uses JWTs. |
| FAST | Free Ad-Supported Streaming TV. Includes Pluto, Samsung TV Plus, ITVX free, Channel 4. |
| AppLauncher | Capacitor plugin (`@capacitor/app-launcher`) that opens external URLs as native intents. |

## File / path conventions

| Path | Meaning |
|---|---|
| `src/lib/recommendations-v2/` | Phase 4+ ranking pipeline. The `-v2` suffix is permanent. |
| `src/lib/taste-v2/` | 1536D embedding-space taste system. The `-v2` suffix is permanent. |
| `supabase/cron/` | Operational scheduled jobs. Distinct from numbered migrations. |
| `_archive/` | v1 code retained at the `v1-archive` Git tag. Not actively maintained. |
| `videx-wiki/raw/` | Source documents for the LLM wiki. Read-only to the LLM. |
| `videx-wiki/wiki/` | LLM-maintained markdown pages. |
