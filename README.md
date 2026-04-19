# Videx - Streaming Aggregator

A mobile-first streaming aggregator that combines content from multiple UK platforms into a single browsing interface. Built as a web app wrapped with Capacitor for native Android deployment.

## Supported Platforms

Netflix, Amazon Prime Video, Apple TV+, Disney+, NOW, Sky Go, Paramount+, BBC iPlayer, ITVX, Channel 4

## Tech Stack

- **React 18** with TypeScript
- **Vite 6** for build tooling
- **Tailwind CSS v4** for styling
- **Supabase** for authentication, database, and cloud sync
- **Capacitor 8** for native Android deployment
- **Motion** (`motion/react`) for animations
- **Sonner** for toast notifications
- **Lucide React** for icons

### APIs

- **TMDb** - Content metadata, discover/search, streaming service detection (all 10 UK services)
- **OMDB** - Rotten Tomatoes and IMDb ratings
- **Streaming Availability API** (Movie of the Night) - Deep link URLs, rent/buy pricing (9 of 10 UK services; server-side only)
- **Supabase** - Authentication, user data sync, content cache, analytics, availability reports

### Content Cache (Supabase)

Streaming availability and deep link URLs are cached in Supabase, populated by a sync pipeline:
- **Initial population**: `npx tsx scripts/sync-content.ts` (TMDb → SA API → OMDB, 3-stage pipeline)
  - `--stage tmdb` — fetch titles and metadata from TMDb discover (also computes and stores `content_vector`)
  - `--stage sa` — fetch streaming availability and deep links from SA API
  - `--stage omdb` — fetch IMDb/RT ratings from OMDB
  - `--stage vectors` — backfill `content_vector` for any existing titles where it is NULL
- **Daily incremental sync**: Supabase Edge Function at `supabase/functions/sync-incremental/` using SA API `/changes` endpoint; writes availability changes to `streaming_history` (append-only log) for historical tracking
- Shared logic used across Edge Functions lives in `supabase/functions/_shared/` as self-contained modules (required for remote CLI deployment without Docker, which cannot resolve paths outside the `supabase/functions/` tree)
- The app reads from Supabase (fast, no API quota per user) — TMDb remains the primary source for service detection

## Getting Started

### Prerequisites

- Node.js 18+
- API keys from [TMDb](https://www.themoviedb.org/settings/api), [OMDB](http://www.omdbapi.com/apikey.aspx), and [Streaming Availability API](https://rapidapi.com/movie-of-the-night-movie-of-the-night-default/api/streaming-availability) (via RapidAPI)
- [Supabase](https://supabase.com/) project with email auth enabled

### Setup

1. Install dependencies:
```bash
npm install
```

2. Create your `.env` file from the template:
```bash
cp .env.example .env
```

3. Add your API keys and Supabase credentials to `.env`

4. Start the dev server:
```bash
npm run dev
```

### Android Deployment

1. Build the web app:
```bash
npm run build
```

2. Sync with Capacitor:
```bash
npx cap sync android
```

3. Build the APK:
```bash
cd android && ./gradlew assembleDebug
```

4. Install on device:
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Live Reload (Development)

For hot-reloading on a physical device over WiFi:

```bash
npm run dev
LIVE_RELOAD=<your-lan-ip> npx cap sync android
cd android && ./gradlew assembleDebug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Project Structure

```
videx/
  src/
    App.tsx                    Main app shell (routing, global state)
    main.tsx                   Entry point
    index.css                  Tailwind + custom styles
    assets/                    Platform logo PNGs (10 services)
    components/
      auth/                    Authentication screens
        AuthScreen.tsx           Auth view router with slide transitions
        SignInScreen.tsx          Email/password sign-in
        SignUpScreen.tsx          Registration with username validation
        ForgotPasswordScreen.tsx  Password reset request (send email)
        ResetPasswordScreen.tsx   Set new password (from recovery link)
        SignUpSuccess.tsx         Auto-advancing success interstitial
        NoConnectionScreen.tsx    Offline state for authenticated users
      AuthContext.tsx           Supabase auth provider + useAuth hook
      OnboardingFlow.tsx       5-step onboarding (account, services, watched grid, clusters, sliders)
      ForYouPage.tsx           For You surface (7 personalised rows + slider tray)
      BrowsePage.tsx           Search + filter + grid browse
      DetailPage.tsx           Content detail with ratings, cast, availability
      WatchlistPage.tsx        Want to Watch / Watched tabs with rating system
      ProfilePage.tsx          User settings, service management, account deletion
      CalendarPage.tsx         Coming Soon calendar with date/service filters
      SpendDashboard.tsx       Monthly spend tracker with tier selection
      FeaturedHero.tsx         Hero carousel (3-5 cards, auto-rotate, scroll-snap)
      SliderTray.tsx           Bottom sheet slider tray for recommendation tuning
      FilterSheet.tsx          Bottom sheet with service/genre/rating filters
      ReportSheet.tsx          Report incorrect availability bottom sheet
      LazyGenreSection.tsx     Lazy-loaded genre-based content rows
      ComingSoonCard.tsx       Upcoming release card with date badge
      BottomNav.tsx            Tab navigation bar
      ContentCard.tsx          Poster card component + ContentItem interface
      BrowseCard.tsx           Grid browse card variant
      ContentRow.tsx           Horizontal scrollable content row
      CategoryFilter.tsx       Category pill bar
      ImageSkeleton.tsx        Image loading placeholder
      ServiceBadge.tsx         Platform logo badge
      ThemeContext.tsx          Dark/light theme provider
      platformLogos.ts         Platform metadata and logo mapping
      icons.tsx                Custom SVG icons (TickIcon, EyeIcon)
    hooks/                     React hooks (service layer)
      useHomeContent.ts        Home surface data orchestration
      useForYouContent.ts      For You surface data orchestration (pipeline + conditional rows)
      useBrowse.ts             Browse/discover logic
      useContentDetail.ts      Detail page data fetching
      useContentService.ts     Core content service (trending, popular, etc.)
      useTasteProfile.ts       Taste profile state + continuous learning
      useSectionData.ts        TMDb discover section data with pagination
      useSearch.ts             Search with debounce
      useUpcoming.ts           Coming Soon / Calendar data
      useWatchlist.ts          Watchlist CRUD with memoized derived state
      useUserPreferences.ts    User preferences management
      useNetworkStatus.ts      Online/offline detection (Capacitor Network)
      useIntersectionObserver.ts  Viewport intersection for lazy loading
    lib/                       Business logic
      supabase.ts              Supabase client singleton
      supabaseStorage.ts       Supabase CRUD operations (cloud sync layer)
      storage.ts               localStorage adapter with auth-aware routing
      debugLogger.ts           Debug logging (Supabase POST in dev)
      sectionSessionCache.ts   In-memory session cache for home sections
      adapters/                Data model bridges (TMDb + SA API → UI interfaces)
        contentAdapter.ts        ContentItem <-> WatchlistItem conversion
        detailAdapter.ts         TMDb detail + streaming links -> DetailData
        platformAdapter.ts       TMDb provider IDs <-> ServiceId strings + SA API slug mapping
      deepLinks.ts             Deep link URL resolution (exact SA API link or search fallback)
      openDeepLink.ts          Platform-aware link opener (AppLauncher on native / window.open on web)
      api/                     API clients + caching
        tmdb.ts                  TMDb API client (discover, search, details, providers)
        omdb.ts                  OMDB API client (IMDb/RT ratings)
        streamingAvailability.ts  SA API types + client (server-side only)
        supabaseContent.ts       Supabase content cache queries (streaming links, deep links)
        cache.ts                 HTTP response cache layer (TMDb, OMDB, SA prefixes)
      analytics/               Onboarding funnel instrumentation
        events.ts                Event type definitions and metadata
        logger.ts                Supabase event logging
      constants/               Configuration
        config.ts                App-wide constants
        genres.ts                Genre ID mappings (TMDb, taste vector keys)
        platforms.ts             UK provider definitions, variant ID maps
      data/
        platformPricing.ts       UK subscription pricing data (10 services)
      recommendations-v2/      Ranking pipeline (Phase 4)
        types.ts                 Pipeline types (CandidatePool, ScoredCandidate, etc.)
        weights.ts               Scoring weights, slider mappings, feature flags
        ranker.ts                Pipeline orchestrator (retrieval, scoring, row building)
        recency.ts               Recency scoring (piecewise linear + exponential decay)
        contextual.ts            Contextual scoring (Phase 4 placeholder)
        diversity.ts             Genre-spread, service de-clustering, content-mix ratio
        hardFilters.ts           Hard filter construction (dismissed, thumbs-down, availability)
        titleAdapter.ts          Database row -> ContentItem mapper
        rows/home/               Home surface row builders
          perServiceChart.ts       Per-service popularity rows
          criticallyAcclaimed.ts   RT/IMDb filtered row (gated)
          genreSpotlight.ts        Weekly rotating genre cluster row
      reports/                 User feedback
        reportService.ts         Availability report submission (Supabase)
      taste-v2/                Taste vector v2 system (1536D embedding-space)
        types.ts                 Vector types, slider state, interaction weights
        tasteClusters.ts         16 taste archetype definitions
        tasteProfileV2.ts        Profile CRUD, slider state, cache management
        bootstrap.ts             Taste vector bootstrap from onboarding signals
        interactionUpdate.ts     Incremental + full recompute from interactions
        vectorOps.ts             Vector math (cosine similarity, weighted average)
      storage/                 Persistence (localStorage + Supabase routing)
        interactions.ts          User interactions event log (fire-and-forget Supabase emitter)
        watchlist.ts             Watchlist CRUD with recommendation auto-invalidation
        userPreferences.ts       User preferences and onboarding state
        recommendations.ts       Recommendation cache management
      utils/                   Shared utilities
        serviceCache.ts          Streaming provider lazy-loading cache
        searchUtils.ts           Search query normalisation
        providerClassifier.ts    TMDb provider monetisation classification
        errorHandler.ts          Error handling utilities
  scripts/                     Development and sync scripts
    sync-content.ts              Bulk content sync (TMDb → SA API → OMDB)
    evaluation/
      rank-eval.ts               Offline pipeline evaluation harness
  android/                     Capacitor native Android project
  supabase/                    Supabase infrastructure
    migrations/                  SQL schema migrations (content cache tables)
    functions/
      sync-incremental/          Edge Function for daily incremental sync
  docs/                        Design references, plans, and solutions
```

## Features

### Authentication
Email/password sign-up/sign-in via Supabase, password reset (email link to set new password screen), account deletion, session persistence. User preferences and watchlist data are preserved in localStorage across sign-out/sign-in and synced to Supabase for authenticated users.

### Onboarding
Five-step flow: account creation, streaming service selection, watched title grid (3 rounds of 6 titles), taste cluster selection (16 archetypes), and recommendation slider tuning. Progress is tracked and can be resumed if interrupted.

### Home
Hero carousel (3-5 cards, auto-rotating, swipeable) at the top, followed by Recently Added, Trending Across Your Services, Coming Soon, per-service popularity charts (up to 3 services), and a weekly Genre Spotlight row. Critically Acclaimed row is gated behind OMDB data coverage.

### Browse & Search
Full-text search with debounced auto-suggestions (recent + trending), category pills (All/Movies/TV Shows), and a filter sheet with streaming service, genre, and rating filters. Results display in a 2-column poster grid filtered to UK availability.

### Detail View
Hero image, IMDb/Rotten Tomatoes ratings, genre tags, streaming availability with tappable service pills (deep links open the streaming app directly via Android App Links, or fall back to the service's search/browse page). Rent/buy pricing with exact £ amounts where available, or "check price" labels when pricing data is unavailable. Cast carousel and "More Like This" recommendations. Includes report button for incorrect availability data.

### Watchlist
Want to Watch / Watched tabs with category filters, sort options, and grid layout. Thumbs up/down rating on watched content feeds into the recommendation engine. Watchlist changes auto-invalidate recommendation and hidden gems caches.

### Coming Soon / Calendar
Upcoming releases for connected services with date pills, service filter, and bookmark buttons. Calendar view groups releases by date.

### For You
Personalised surface with up to 7 rows: Recommended For You, Hidden Gems, Because You Watched [Title], More From [Director/Actor], Outside Your Usual, and From Your Watchlist. All rows are driven by a multi-stage ranking pipeline with slider-tunable parameters. A "Tune" button opens a bottom-sheet slider tray for real-time recommendation adjustment.

### Profile
Username/email display, manage streaming services, taste cluster preferences, tune recommendation sliders, dark/light/system theme toggle, spend dashboard, and account deletion.

### Spend Dashboard
Monthly subscription cost tracker on the Profile page. Shows per-service breakdown with tier selection, annual projection, and daily rate.

### Report Incorrect Availability
Users can flag content that isn't actually available on a listed service. Reports are submitted to Supabase with rate limiting (one report per title per 24 hours).

### Cloud Sync
Authenticated users get automatic cloud sync via Supabase. Watchlist, preferences, taste profile, and quiz results are persisted server-side with Row Level Security. The storage layer routes reads/writes to either localStorage (anonymous) or Supabase (authenticated) transparently.

### Onboarding Analytics
Funnel instrumentation tracks progression through each onboarding step (services, clusters, quiz start/complete/skip, first home view) via Supabase event logging.

## Taste & Recommendation System

### 1536D Embedding-Space Taste Vector

User preferences are modelled as a 1536-dimensional vector in the same embedding space as content (OpenAI text-embedding-3-small). The vector is bootstrapped from onboarding signals (selected clusters, watched titles, service fingerprints) and refined incrementally with every user interaction (thumbs up/down, watchlist changes, deep link clicks).

### Taste Clusters

During onboarding, users select from 16 taste archetypes (e.g. "Feel-Good & Funny", "Dark Thrillers", "Mind-Bending"). Each cluster maps to TMDb genre IDs and representative titles whose embeddings seed the taste vector.

### Ranking Pipeline

Multi-stage pipeline producing scored, diversified, service-spread results:

1. **Stage 1 — Retrieval**: pgvector cosine similarity via `match_titles_by_vector` RPC (500 candidates)
2. **Stage 2 — Scoring**: Weighted sum of taste similarity (62.5%), recency (25%), and contextual fit (12.5% placeholder). Catalogue-age slider modulates recency weight (10-30%).
3. **Stage 2b — Diversity**: Genre-spread with taste-cluster secondary signal. Focused-Varied slider modulates genre repeat window.
4. **Stage 2c — De-clustering**: Positional constraint ensuring no more than 2 consecutive titles from the same streaming service.

### Delivery Sliders

Four sliders allow real-time recommendation tuning:
- **Catalogue Age**: New releases vs best match regardless of age
- **Comfort Zone**: Stick with what I like vs surprise me (modulates Outside Your Usual row size)
- **Content Mix**: Focus on films vs focus on TV series (modulates media type ratio)
- **Focused-Varied**: Go deeper vs see more variety (modulates genre diversity)

### Continuous Learning

Post-onboarding interactions update the taste vector incrementally via exponential moving average. Explicit signals (thumbs up/down) carry more weight than behavioural signals (deep link clicks). A confidence floor gives the first 20 interactions 1.5x weight for faster convergence.

## Design System

- **Theme**: Dark (#0a0a0f) / Light (#f5f4f1) with system preference detection
- **Accent**: Warm coral (var(--primary))
- **Font**: DM Sans (via Google Fonts CDN)
- **Animations**: Motion spring physics, parallax scrolling, expandable sections
- **Mobile-first**: Capacitor-ready CSS with safe area insets, touch optimisations, no tap delay

## License

Private project - All rights reserved

