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

- **TMDb** - Content metadata, streaming availability, discover/search
- **OMDB** - Rotten Tomatoes and IMDb ratings
- **WatchMode** - Rent/buy pricing information
- **Supabase** - Authentication, user data sync, analytics, availability reports

## Getting Started

### Prerequisites

- Node.js 18+
- API keys from [TMDb](https://www.themoviedb.org/settings/api), [OMDB](http://www.omdbapi.com/apikey.aspx), and [WatchMode](https://api.watchmode.com/)
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
      quiz/                    Taste quiz components
        TasteQuiz.tsx            10-question taste quiz orchestrator
        QuizQuestion.tsx         Pair-choice UI (A/B/Both/Neither)
        QuizIntro.tsx            Quiz introduction screen
        QuizInterstitial.tsx     Phase transition interstitial
        QuizCompletion.tsx       Results summary screen
        QuizClusterSelect.tsx    Taste cluster picker (onboarding step 2)
      AuthContext.tsx           Supabase auth provider + useAuth hook
      OnboardingFlow.tsx       3-step onboarding (services, clusters, quiz)
      BrowsePage.tsx           Search + filter + grid browse
      DetailPage.tsx           Content detail with ratings, cast, availability
      WatchlistPage.tsx        Want to Watch / Watched tabs with rating system
      ProfilePage.tsx          User settings, service management, account deletion
      CalendarPage.tsx         Coming Soon calendar with date/service filters
      SpendDashboard.tsx       Monthly spend tracker with tier selection
      FeaturedHero.tsx         Parallax hero banner
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
      useHomeContent.ts        Home page data orchestration (sections, genres, taste)
      useBrowse.ts             Browse/discover logic
      useContentDetail.ts      Detail page data fetching
      useContentService.ts     Core content service (trending, popular, etc.)
      useHiddenGems.ts         Hidden gems discovery
      useRecommendations.ts    Personalised recommendations
      useTasteProfile.ts       Taste profile state + continuous learning
      useSectionData.ts        Lazy-loaded home section data
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
      adapters/                TMDb data model -> UI interface bridges
        contentAdapter.ts        ContentItem <-> WatchlistItem conversion
        detailAdapter.ts         TMDb detail -> DetailData conversion
        platformAdapter.ts       TMDb provider IDs <-> ServiceId strings
      api/                     API clients + caching
        tmdb.ts                  TMDb API client (discover, search, details, providers)
        omdb.ts                  OMDB API client (IMDb/RT ratings)
        watchmode.ts             WatchMode API client (rent/buy pricing)
        cache.ts                 HTTP response cache layer
      analytics/               Onboarding funnel instrumentation
        events.ts                Event type definitions and metadata
        logger.ts                Supabase event logging
      constants/               Configuration
        config.ts                App-wide constants
        genres.ts                Genre ID mappings (TMDb, taste vector keys)
        platforms.ts             UK provider definitions, variant ID maps
      data/
        platformPricing.ts       UK subscription pricing data (10 services)
      reports/                 User feedback
        reportService.ts         Availability report submission (Supabase)
      taste/                   Taste vector system
        tasteVector.ts           24D vector model, cosine similarity, confidence weights
        tasteClusters.ts         16 taste archetype definitions
        quizConfig.ts            Quiz pair pools (5 fixed + 39 adaptive + 4 legacy) and selection algorithms
        quizScoring.ts           Quiz answer -> vector + confidence computation
        contentVectorMapping.ts  Content metadata -> taste vector mapping
        genreBlending.ts         Genre combination logic for diverse discovery
        vectorSerialisation.ts   Vector <-> array serialisation for Supabase
      storage/                 Persistence (localStorage + Supabase routing)
        tasteProfile.ts          Taste profile CRUD, quiz results, interaction logging
        watchlist.ts             Watchlist CRUD with recommendation auto-invalidation
        userPreferences.ts       User preferences and onboarding state
        recommendations.ts       Recommendation cache management
      utils/                   Shared utilities
        recommendationEngine.ts  Multi-signal recommendation scoring
        serviceCache.ts          Streaming provider lazy-loading cache
        searchUtils.ts           Search query normalisation
        providerClassifier.ts    TMDb provider monetisation classification
        errorHandler.ts          Error handling utilities
    styles/
      globals.css              Tailwind source styles + dark/light themes
  android/                     Capacitor native Android project
  docs/                        Design references and historical notes
```

## Features

### Authentication
Email/password sign-up/sign-in via Supabase, password reset (email link to set new password screen), account deletion, session persistence. User preferences and watchlist data are preserved in localStorage across sign-out/sign-in and synced to Supabase for authenticated users.

### Onboarding
Three-step flow: streaming service selection, taste cluster selection (3-5 of 16 archetypes), and 10-question taste quiz. Progress is tracked and can be resumed if interrupted.

### Home
Featured hero banner with parallax scrolling, trending, popular, top rated, and genre-based content rows. When a taste vector exists, personalised "For You" and "Hidden Gems" sections appear. Genre rows are ordered by the user's taste vector affinities and lazy-loaded on scroll.

### Browse & Search
Full-text search with debounced auto-suggestions (recent + trending), category pills (All/Movies/TV Shows), and a filter sheet with streaming service, genre, and rating filters. Results display in a 2-column poster grid filtered to UK availability.

### Detail View
Hero image, IMDb/Rotten Tomatoes ratings, genre tags, streaming availability with service badges, rent/buy pricing, cast carousel, and "More Like This" recommendations. Includes report button for incorrect availability data.

### Watchlist
Want to Watch / Watched tabs with category filters, sort options, and grid layout. Thumbs up/down rating on watched content feeds into the recommendation engine. Watchlist changes auto-invalidate recommendation and hidden gems caches.

### Coming Soon / Calendar
Upcoming releases for connected services with date pills, service filter, and bookmark buttons. Calendar view groups releases by date.

### Profile
Username/email display, manage streaming services, taste cluster preferences, dark/light/system theme toggle, spend dashboard, and account deletion.

### Spend Dashboard
Monthly subscription cost tracker on the Profile page. Shows per-service breakdown with tier selection, annual projection, and daily rate.

### Report Incorrect Availability
Users can flag content that isn't actually available on a listed service. Reports are submitted to Supabase with rate limiting (one report per title per 24 hours).

### Cloud Sync
Authenticated users get automatic cloud sync via Supabase. Watchlist, preferences, taste profile, and quiz results are persisted server-side with Row Level Security. The storage layer routes reads/writes to either localStorage (anonymous) or Supabase (authenticated) transparently.

### Onboarding Analytics
Funnel instrumentation tracks progression through each onboarding step (services, clusters, quiz start/complete/skip, first home view) via Supabase event logging.

## Taste Quiz & Vector System

### 24-Dimensional Taste Vector

The taste system models user preferences as a 24-dimensional vector:
- **19 genre dimensions** (0-1 scale): action, adventure, animation, comedy, crime, documentary, drama, family, fantasy, history, horror, musical, mystery, reality, romance, scifi, thriller, war, western
- **5 meta dimensions** (-1 to +1 scale): tone, pacing, era, popularity, intensity

### Taste Clusters

Before the quiz, users select 3-5 of 16 taste archetypes (e.g. "Action Junkie", "Comfort Classics", "Mind Benders"). Each cluster maps to a partial 24D vector. The selected clusters are averaged to create a seed vector that primes the quiz and recommendation engine.

### Quiz Structure

A 10-question quiz with 48 total pairs across two phases:

1. **Fixed pairs (5)** — identical for all users, cover broad dimensions (tone, action, scifi, romance, horror, comedy, crime, animation, war, etc.)
2. **Adaptive pairs (5 of 39)** — chosen after Q5 to resolve the most uncertain dimensions from the interim vector

Each pair offers four choices: **A**, **B**, **Both** (two independent positive signals), or **Neither** (reduces affinity for both options' genres). An additional 4 legacy pairs are retained for backward compatibility with stored quiz data.

### Per-Dimension Confidence

Each quiz answer updates a confidence vector alongside the taste vector. Confidence values (0-1 per dimension) track how well each dimension has been probed by the quiz. Dimensions that were never touched by any quiz pair retain low confidence.

### Continuous Learning

Post-quiz interactions (thumbs up/down, watchlist add, watched, removed) update both the taste vector and confidence via exponential moving average. Each interaction includes a content vector derived from TMDb metadata, so the system learns from every rating.

## Recommendation Engine

### With Taste Vector (post-quiz)

Three-signal weighted scoring with confidence-aware similarity:

- **60% Taste Vector**: Cosine similarity between the user's 24D vector and content vectors. Similarity is weighted by per-dimension confidence — dimensions the system is less sure about contribute less to the score. Genre-combination blending ensures diverse discovery.
- **25% Similar Content**: TMDb "Similar" titles for the user's top-rated items.
- **15% Trending/Recency**: Boost for popular and recently released content.

### Without Taste Vector (fallback)

- **70% Genre Affinity**: Derived from watchlist thumbs-up/down ratings.
- **30% Similar Content**: TMDb "Similar" titles.

### Hidden Gems

A curated row of lesser-known, highly-rated content matching user preferences. Uses TMDb discover with popularity and vote count caps to surface quality content that isn't mainstream.

### Caching & Invalidation

Results are cached for 6 hours but auto-invalidated on any watchlist change (add, remove, rate, move status). Items already on the watchlist or previously dismissed are filtered out.

## Design System

- **Theme**: Dark (#0a0a0f) / Light (#f5f4f1) with system preference detection
- **Accent**: Warm coral (var(--primary))
- **Font**: DM Sans (via Google Fonts CDN)
- **Animations**: Motion spring physics, parallax scrolling, expandable sections
- **Mobile-first**: Capacitor-ready CSS with safe area insets, touch optimisations, no tap delay

## License

Private project - All rights reserved
