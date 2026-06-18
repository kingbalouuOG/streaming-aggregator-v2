# Videx - Streaming Aggregator

A mobile-first streaming aggregator that combines content from multiple UK platforms into a single browsing interface. The **live mobile app** is a React Native / Expo build under [`native/`](native/) (`app.videx.streaming`); the original React + Vite web app (`src/`) and a Cloudflare Worker (`workers/api/`) share the same `src/lib` engine. See **[Platform architecture](videx-wiki/wiki/concepts/architecture/platform-architecture.md)** for the one-repo / three-surface picture.

**Conventions:** [docs/CONVENTIONS.md](docs/CONVENTIONS.md) — where things live, tests vs evals, lint rules, doc lifecycle, migration process, the single-engine-tree rule (ADR-014). Read it before contributing.

## Knowledge Base / Project Wiki

An **LLM-maintained knowledge base** lives at `videx-wiki/` in this repo (tracked by Git, committed alongside phase work). It is the **authoritative cross-phase context store** for Videx — architecture, decisions (ADRs), phase histories, migrations, RPCs, evaluations, runbooks, glossary, and registers (parking lot, pre-launch blockers, deferred items). Follows the [Karpathy LLM wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

**Critical for context.** Any agent working on Videx — human or LLM — should consult the wiki first when picking up a thread. `docs/v2/` is the source of truth for active strategy / orchestration / parking-lot / phase-summary documents; the wiki synthesises those into a queryable knowledge graph. Read `videx-wiki/AGENTS.md` before operating in the vault. Obsidian-compatible.

## Supported Platforms

Netflix, Amazon Prime Video, Apple TV+, Disney+, NOW, Sky Go, Paramount+, BBC iPlayer, ITVX, Channel 4

## Tech Stack

- **Web** — React 18 + TypeScript · **Vite 6** · **Tailwind CSS v4**
- **Native (the live app)** — React Native 0.85 / **Expo SDK 56** + NativeWind 4 · Android/Hermes (`native/`)
- **Edge** — Cloudflare Worker (`workers/api/`): TMDb/OMDB proxy + server-rendered `/v1/foryou`
- *Legacy:* the original Capacitor 8 Android wrapper of the web app remains in `android/`, superseded by the Expo build at the NATIVE-4 cutover
- **Supabase** — authentication, database (pgvector), Edge Functions, cloud sync
- **Motion** (`motion/react`), **Sonner**, **Lucide React**, **react-markdown** (in-app legal docs)
- **Vitest + jsdom** — `npm test` is the single test entry (suites in `__tests__/` beside source in `src/` and `scripts/`). CI: `tsc --noEmit` + lint + `npm test` on phase branches; build verification on main. (The `shared-tree-drift` + `foryou-parity` probes were retired at PLAT-3 with the `_shared/` mirror — ADR-014.)

### APIs

- **TMDb** — content metadata, discover/search, streaming service detection (all 10 UK services)
- **OMDB** — Rotten Tomatoes and IMDb ratings
- **Streaming Availability API** (Movie of the Night) — deep link URLs, rent/buy pricing (9 of 10 UK services; server-side only)
- **OpenAI** `text-embedding-3-small` — 1536D content + taste embeddings (server-side / scripts only)

### Content Cache (Supabase)

Streaming availability, deep links, and metadata live in a Supabase content cache (~22K UK-available titles, embedded):
- **Bulk sync**: `npx tsx scripts/sync-content.ts` (stages: `tmdb`, `imdb`, `sa`, `omdb`)
- **Daily incremental sync**: `supabase/functions/sync-incremental/` Edge Function (06:00 UTC) via the SA API `/changes` endpoint; daily embedding + enrichment crons follow at 06:30/06:45
- **Catalogue-gap backfill**: `scripts/enrichment/backfill_missing_titles.ts` (recurring fix — the daily sync writes availability only; see Phase 5.5 C17)
- The app reads from Supabase (fast, no per-user API quota); TMDb remains primary for service detection

## Getting Started

### Prerequisites

- Node.js 18+
- API keys from [TMDb](https://www.themoviedb.org/settings/api), [OMDB](http://www.omdbapi.com/apikey.aspx), and [Streaming Availability API](https://rapidapi.com/movie-of-the-night-movie-of-the-night-default/api/streaming-availability) (via RapidAPI)
- [Supabase](https://supabase.com/) project with email auth enabled

### Setup

```bash
npm install
cp .env.example .env   # then add your API keys + Supabase credentials
npm run dev
```

### Mobile build (the live app)

The live Android app is the **Expo** project under [`native/`](native/) — see [`native/README.md`](native/README.md) for the full dev + release flow. In brief:

```bash
cd native
npm install                              # installs deps + creates the src/lib junction
npx expo prebuild --platform android --clean
cd android && ./gradlew bundleRelease    # signed AAB; release signing auto-applies via a config plugin
```

> The original Capacitor wrapper of the web app (`npm run build && npx cap sync android`) is **legacy** — superseded by the Expo build at the NATIVE-4 cutover.

## Project Structure

Top-level map — the full module inventory is wiki-owned (`videx-wiki/wiki/entities/codebase/`), and [docs/CONVENTIONS.md](docs/CONVENTIONS.md) defines what belongs where:

```
src/
  App.tsx                  App shell (tab routing, global state)
  components/              ~55 components + auth/ screens; ContentCard owns the ContentItem interface
  hooks/                   React service layer (useForYouContent, useHomeContent, useTasteProfile, …)
  lib/
    api/                   TMDb / OMDB / SA clients + Supabase content queries + cache layer
    adapters/              External shapes → UI interfaces (content, detail, platform)
    recommendations-v2/    Ranking pipeline — imported directly by web, the Worker, and native (ADR-014, single tree)
    taste-v2/              Taste system: interest centroids, bootstrap, EMA + k-means updates
    storage/               Persistence (watchlist, preferences, interactions event log)
    instrumentation/       card_impressions batcher, session ids, click context
native/                    LIVE Android app — React Native / Expo (app.videx.streaming). Holds
                           src/{app,components,hooks,providers}; src/lib + src/assets are junctions
                           to ../src/lib + ../src/assets. See native/README.md.
scripts/                   Node tooling in named subfolders (evaluation/, enrichment/, embeddings/,
                           fingerprints/, mood_rooms/, test/); root holds only sync-content.ts,
                           debug-server.js, gen-android-icons.py
workers/api/               videx-api Cloudflare Worker — TMDb/OMDB proxy + /v1/foryou (live)
supabase/
  migrations/              Numbered schema migrations (apply process: see CONVENTIONS.md)
  functions/               Edge Functions (the _shared/ engine mirror was removed at PLAT-3)
  queries/                 Operational SQL (dashboard, funnel, reports)
android/                   Legacy Capacitor wrapper of the web app (superseded by native/)
docs/                      CONVENTIONS, design/ (design system + search briefs), legal/, plans/,
                           solutions/ (post-mortems), v2/ (strategy, orchestration, phase-summaries/)
videx-wiki/                The knowledge base (see above)
```

## Features

### Authentication
Email/password via Supabase, password reset, account deletion, session persistence. Preferences and watchlist survive sign-out/sign-in; authenticated users sync to Supabase under RLS.

### Onboarding
Five steps: account, streaming services, watched-title grid, taste clusters (16 archetypes), recommendation sliders. Resumable; instrumented end-to-end.

### Home
Hero carousel, Recently Added, Trending, Coming Soon, per-service charts, weekly Genre Spotlight; Critically Acclaimed gated on OMDB coverage.

### Browse & Search
Debounced search with suggestions and recents, category pills, filter sheet (services, genres, cost, language) with URL-synced filter state; semantic search (Mode C) behind a per-user flag. Results filtered to UK availability with on/off-service treatment.

### Detail View
Ratings, genre tags, availability with tappable deep links (Android App Links where reliable, search fallback elsewhere), rent/buy pricing, cast, "More Like This", availability reporting.

### Watchlist
Want to Watch / Watched with thumbs ratings feeding the engine; changes invalidate recommendation caches.

### For You
Personalised surface: Recommended For You (with two daily-rotating exploration slots), Hidden Gems, Outside Your Usual, Because You Watched, More From [Person], From Your Watchlist, plus title-anchored mood rooms. First paint is served by the `videx-api` Worker's `/v1/foryou` route (imports `src/lib` directly — ADR-014, superseding the old `render-foryou-rows` Edge fn). The taste-fingerprint card re-ranks instantly on slider drags from the cached candidate pool.

### Profile
Service management, cluster retake, slider tuning, theme, spend dashboard, and **Privacy & Data**: in-app Privacy Policy + ToS, GDPR data export (`export_user_data` RPC → JSON download), and type-to-confirm account deletion (`delete_own_account` RPC).

## Taste & Recommendation System

Short version — the wiki's `recommendation-pipeline` and `taste-vector` concept pages are the deep references:

- **Multi-interest retrieval (ENG-1):** up to 3 interest centroids per user (`user_interest_centroids`) drive per-centroid pgvector retrieval, deduped and weight-interleaved; the single `taste_vector_v2` remains as summary + fallback. Users without centroids get the legacy single-vector path.
- **Scoring:** taste (cosine to source centroid) 62.5% + recency 25% + contextual 12.5% (time-of-day, viewing context, device), then an avoid-set penalty (recent thumbs-downs suppress their lookalikes at score time — negatives never touch the vectors), MMR diversity, and service de-clustering.
- **Learning:** EMA toward the nearest interest centroid on each positive interaction; deterministic weighted k-means refreshes centroids in the 24h batch recompute. First 20 interactions carry a 1.5× confidence boost.
- **Sliders:** Catalogue Age, Comfort Zone, Content Mix, Focused↔Varied — all re-rank client-side instantly from the cached pool.
- **Training groundwork (→ ENG-2):** `card_impressions` + position-at-click metadata + the `v_training_examples` view accumulate the learned-re-ranker dataset; exploration slots are tagged for CTR measurement.

## Design System

Source of truth: [docs/design/design-system.md](docs/design/design-system.md) (editorial redesign) with tokens in `docs/design/tokens.css`. Dark/light themes with system detection, mobile-first with safe-area insets.

## License

Private project - All rights reserved
