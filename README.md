# Videx - Streaming Aggregator

A mobile-first streaming aggregator that combines content from multiple UK platforms into a single browsing interface. Built as a web app wrapped with Capacitor for native Android deployment.

## Supported Platforms

Netflix, Amazon Prime Video, Apple TV+, Disney+, NOW, Sky Go, Paramount+, BBC iPlayer, ITVX, Channel 4

## Tech Stack

- **React 18** with TypeScript
- **Vite 6** for build tooling
- **Tailwind CSS v4** for styling
- **Supabase** for authentication and database
- **Capacitor 8** for native Android deployment
- **Framer Motion** (`motion/react`) for animations
- **Sonner** for toast notifications
- **Lucide React** for icons

### APIs

- **TMDb** - Content metadata, streaming availability, discover/search
- **OMDB** - Rotten Tomatoes and IMDb ratings
- **WatchMode** - Rent/buy pricing information
- **Supabase Auth** - Email/password authentication, session management

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
    App.tsx                  Main app shell (routing, global state)
    main.tsx                 Entry point
    index.css                Tailwind + custom styles
    assets/                  Platform logo PNGs (11 services)
    components/              Feature components
      auth/                  Authentication screens
        AuthScreen.tsx       Auth view router with slide transitions
        SignInScreen.tsx      Email/password sign-in
        SignUpScreen.tsx      Registration with username validation
        ForgotPasswordScreen.tsx  Password reset request (send email)
        ResetPasswordScreen.tsx  Set new password (from recovery link)
        SignUpSuccess.tsx     Auto-advancing success interstitial
        NoConnectionScreen.tsx  Offline state for authenticated users
      quiz/
        TasteQuiz.tsx        10-question taste quiz orchestrator
        QuizQuestion.tsx     Pair-choice UI (A/B/Both/Neither)
      AuthContext.tsx         Supabase auth provider + useAuth hook
      OnboardingFlow.tsx     3-step onboarding (services, clusters, quiz)
      BrowsePage.tsx         Search + filter + grid browse
      DetailPage.tsx         Content detail with ratings, cast, availability
      WatchlistPage.tsx      Want to Watch / Watched tabs with rating system
      ProfilePage.tsx        User settings, service management, account deletion
      CalendarPage.tsx       Coming Soon calendar with date/service filters
      SpendDashboard.tsx     Monthly spend tracker with tier selection
      FeaturedHero.tsx       Parallax hero banner
      FilterSheet.tsx        Bottom sheet with service/genre/rating filters
      LazyGenreSection.tsx   Lazy-loaded genre-based content rows
      ComingSoonCard.tsx     Upcoming release card with date badge
      GridCard.tsx           Grid layout card variant
      BottomNav.tsx          Tab navigation bar
      ContentCard.tsx        Poster card component
      BrowseCard.tsx         Grid browse card variant
      ContentRow.tsx         Horizontal scrollable content row
      CategoryFilter.tsx     Category pill bar
      ImageSkeleton.tsx      Image loading placeholder
      ServiceBadge.tsx       Platform logo badge
      ThemeContext.tsx        Dark/light theme provider
      platformLogos.ts       Platform metadata and logo mapping
      icons.tsx              Custom SVG icons (TickIcon, EyeIcon)
    hooks/                   React hooks (service layer)
      useBrowse.ts           Browse/discover logic
      useContentDetail.ts    Detail page data fetching
      useContentService.ts   Core content service (trending, popular, etc.)
      useNetworkStatus.ts    Online/offline detection (Capacitor Network)
      useRecommendations.ts  Personalized recommendations
      useSearch.ts           Search with debounce
      useUpcoming.ts         Coming Soon / Calendar data
      useUserPreferences.ts  User preferences management
      useWatchlist.ts        Watchlist CRUD with memoized derived state
    lib/                     Business logic
      supabase.ts            Supabase client singleton
      storage.ts             localStorage adapter (AsyncStorage-compatible)
      adapters/              TMDb data model -> UI interface bridges
        contentAdapter.ts    ContentItem ↔ WatchlistItem conversion
        detailAdapter.ts     TMDb detail → DetailData conversion
        platformAdapter.ts   TMDb provider IDs ↔ ServiceId strings
      api/                   API clients (TMDb, OMDB, WatchMode) + caching
      constants/             Config, genres, platform definitions
      data/
        platformPricing.ts   UK subscription pricing data (10 services)
      taste/                 Taste vector system
        tasteVector.ts       25D vector model, cosine similarity, dimension weights
        quizConfig.ts        Quiz pair pools (41 pairs) and selection algorithms
        quizScoring.ts       Quiz answer → vector delta computation
        contentVectorMapping.ts  Content metadata → taste vector mapping
        genreBlending.ts     Genre combination logic for diverse discovery
      storage/               Persistence (watchlist, preferences, recommendations)
        tasteProfile.ts      Taste profile CRUD, quiz results, interaction logging
        watchlist.ts         Watchlist CRUD with recommendation auto-invalidation
        preferences.ts       User preferences persistence
        recommendations.ts   Recommendation cache management
      utils/                 Error handling, recommendation engine, service cache
        recommendationEngine.ts  Genre affinity + similar content algorithm
        serviceCache.ts      Streaming provider lazy-loading cache
        errorUtils.ts        Error handling utilities
    styles/
      globals.css            Tailwind source styles + dark/light themes
  android/                   Capacitor native Android project
  docs/                      Design references and historical notes
```

## Features

### Core
- **Authentication**: Email/password sign-up/sign-in via Supabase, password reset (email link → set new password screen), account deletion, session persistence with localStorage-preserved preferences across sign-out/sign-in
- **Onboarding**: Streaming service selection, taste cluster preferences, 10-question taste quiz (3 steps)
- **Home**: Featured hero, trending, popular, top rated, genre-based rows, taste-vector-driven "For You" and "Hidden Gems" sections
- **Browse**: Search with auto-suggestions, category filters, service/genre/rating filter sheet
- **Detail View**: Hero image, IMDb/RT ratings, genre tags, streaming availability, rent/buy prices, cast, similar content
- **Watchlist**: Want to Watch / Watched tabs, category filters, sort options, grid layout
- **Profile**: Username/email display, manage services, genre preferences, dark/light/system theme, account deletion

### Sprint 1 Features
- **Rating System**: Thumbs up/down on watched content (Detail Page + Watchlist cards). Ratings feed into the recommendation engine via genre affinity scoring.
- **Hidden Gems**: Curated row of lesser-known, highly-rated content matching user genre preferences. Uses TMDb discover with popularity ≤15 and vote count ≤500.
- **Coming Soon / Calendar**: Upcoming releases for connected services with date pills, service filter, and bookmark buttons. Calendar view groups releases by date.
- **Spend Dashboard**: Monthly subscription cost tracker on the Profile page. Shows per-service breakdown with tier selection, annual projection, and daily rate.
- **Recommendation Auto-Invalidation**: Watchlist changes (add, remove, rate, move status) automatically invalidate the recommendation and hidden gems caches, so the next home page load reflects updated preferences.

### Taste Quiz & Vector System

A 10-question onboarding quiz builds a 25-dimensional taste vector (20 genre dimensions + 5 meta dimensions: tone, pacing, era, popularity, intensity). Three phases:

1. **Fixed pairs (3)** — identical for all users, cover broad dimensions
2. **Genre-responsive (2)** — selected based on user's genre picks
3. **Adaptive (5)** — chosen to resolve the most ambiguous dimensions from the interim vector

Each pair offers four choices: **A**, **B**, **Both** (two independent positive signals), or **Neither** (reduces affinity for both options' genres). The resulting vector drives personalised For You and Hidden Gems sections.

### Recommendation Engine

When a taste vector exists (post-quiz), the engine uses a three-signal approach:

- **60% Taste Vector**: Cosine similarity between the user's 25D vector and content vectors, with genre-combination blending for diverse discovery.
- **25% Similar Content**: TMDb "Similar" titles for the user's top-rated items.
- **15% Trending/Recency**: Boost for popular and recently released content.

Fallback (no taste vector): 70% genre affinity from watchlist ratings + 30% similar content.

User filters (content type, genre, service) thread through all discovery queries. Results are cached for 6 hours but auto-invalidated on any watchlist change. Items already on the watchlist or previously dismissed are filtered out.

## Design System

- **Theme**: Dark (#0a0a0f) / Light (#f5f4f1) with system preference detection
- **Accent**: Warm coral (var(--primary))
- **Font**: DM Sans (via Google Fonts CDN)
- **Animations**: Framer Motion spring physics, parallax scrolling, expandable sections

## License

Private project - All rights reserved
