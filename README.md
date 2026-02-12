# Videx - Streaming Aggregator

A mobile-first streaming aggregator that combines content from multiple UK platforms into a single browsing interface. Built as a web app wrapped with Capacitor for native Android deployment.

## Supported Platforms

Netflix, Amazon Prime Video, Apple TV+, Disney+, NOW, Sky Go, Paramount+, BBC iPlayer, ITVX, Channel 4

## Tech Stack

- **React 18** with TypeScript
- **Vite 6** for build tooling
- **Tailwind CSS v4** for styling
- **Capacitor 8** for native Android deployment
- **Framer Motion** (`motion/react`) for animations
- **Sonner** for toast notifications
- **Lucide React** for icons

### APIs

- **TMDb** - Content metadata, streaming availability, discover/search
- **OMDB** - Rotten Tomatoes and IMDb ratings
- **WatchMode** - Rent/buy pricing information

## Getting Started

### Prerequisites

- Node.js 18+
- API keys from [TMDb](https://www.themoviedb.org/settings/api), [OMDB](http://www.omdbapi.com/apikey.aspx), and [WatchMode](https://api.watchmode.com/)

### Setup

1. Install dependencies:
```bash
npm install
```

2. Create your `.env` file from the template:
```bash
cp .env.example .env
```

3. Add your API keys to `.env`

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
      OnboardingFlow.tsx     3-step onboarding (profile, services, genres)
      BrowsePage.tsx         Search + filter + grid browse
      DetailPage.tsx         Content detail with ratings, cast, availability
      WatchlistPage.tsx      Want to Watch / Watched tabs with rating system
      ProfilePage.tsx        User settings, service management, theme toggle
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
      useRecommendations.ts  Personalized recommendations
      useSearch.ts           Search with debounce
      useUpcoming.ts         Coming Soon / Calendar data
      useUserPreferences.ts  User preferences management
      useWatchlist.ts        Watchlist CRUD with memoized derived state
    lib/                     Business logic
      storage.ts             localStorage adapter (AsyncStorage-compatible)
      adapters/              TMDb data model -> UI interface bridges
        contentAdapter.ts    ContentItem ↔ WatchlistItem conversion
        detailAdapter.ts     TMDb detail → DetailData conversion
        platformAdapter.ts   TMDb provider IDs ↔ ServiceId strings
      api/                   API clients (TMDb, OMDB, WatchMode) + caching
      constants/             Config, genres, platform definitions
      data/
        platformPricing.ts   UK subscription pricing data (10 services)
      storage/               Persistence (watchlist, preferences, recommendations)
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
- **Onboarding**: Name, streaming service selection, genre preferences
- **Home**: Featured hero, trending, popular, top rated, genre-based rows, and personalised "For You" recommendations
- **Browse**: Search with auto-suggestions, category filters, service/genre/rating filter sheet
- **Detail View**: Hero image, IMDb/RT ratings, genre tags, streaming availability, rent/buy prices, cast, similar content
- **Watchlist**: Want to Watch / Watched tabs, category filters, sort options, grid layout
- **Profile**: Edit details, manage services, genre preferences, dark/light/system theme

### Sprint 1 Features
- **Rating System**: Thumbs up/down on watched content (Detail Page + Watchlist cards). Ratings feed into the recommendation engine via genre affinity scoring.
- **Hidden Gems**: Curated row of lesser-known, highly-rated content matching user genre preferences. Uses TMDb discover with popularity ≤15 and vote count ≤500.
- **Coming Soon / Calendar**: Upcoming releases for connected services with date pills, service filter, and bookmark buttons. Calendar view groups releases by date.
- **Spend Dashboard**: Monthly subscription cost tracker on the Profile page. Shows per-service breakdown with tier selection, annual projection, and daily rate.
- **Recommendation Auto-Invalidation**: Watchlist changes (add, remove, rate, move status) automatically invalidate the recommendation and hidden gems caches, so the next home page load reflects updated preferences.

### Recommendation Engine

The recommendation engine uses a two-signal approach:

- **70% Genre Affinity**: Scores genres based on watchlist activity — thumbs up (+3), watched (+1), thumbs down (-1), want-to-watch (+1). Top 3 genres drive TMDb discover queries.
- **30% Similar Content**: Fetches TMDb "Similar" titles for the user's top-rated items.

Results are cached for 6 hours but auto-invalidated on any watchlist change. Items already on the watchlist or previously dismissed are filtered out.

## Design System

- **Theme**: Dark (#0a0a0f) / Light (#f5f4f1) with system preference detection
- **Accent**: Warm coral (var(--primary))
- **Font**: DM Sans (via Google Fonts CDN)
- **Animations**: Framer Motion spring physics, parallax scrolling, expandable sections

## License

Private project - All rights reserved
