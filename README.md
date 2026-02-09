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

3. Run on device/emulator:
```bash
npx cap run android
```

Or open in Android Studio:
```bash
npx cap open android
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
      WatchlistPage.tsx      Want to Watch / Watched tabs
      ProfilePage.tsx        User settings, service management, theme toggle
      FeaturedHero.tsx       Parallax hero banner
      FilterSheet.tsx        Bottom sheet with service/genre/rating filters
      BottomNav.tsx          Tab navigation bar
      ContentCard.tsx        Poster card component
      BrowseCard.tsx         Grid browse card variant
      ContentRow.tsx         Horizontal scrollable content row
      CategoryFilter.tsx     Category pill bar
      ImageSkeleton.tsx      Image loading placeholder
      ServiceBadge.tsx       Platform logo badge
      ThemeContext.tsx        Dark/light theme provider
      platformLogos.ts       Platform metadata and logo mapping
    hooks/                   React hooks (service layer)
      useBrowse.ts           Browse/discover logic
      useContentDetail.ts    Detail page data fetching
      useContentService.ts   Core content service (trending, popular, etc.)
      useRecommendations.ts  Personalized recommendations
      useSearch.ts           Search with debounce
      useUserPreferences.ts  User preferences management
      useWatchlist.ts        Watchlist CRUD operations
    lib/                     Business logic
      storage.ts             localStorage adapter (AsyncStorage-compatible)
      adapters/              TMDb data model -> UI interface bridges
      api/                   API clients (TMDb, OMDB, WatchMode) + caching
      constants/             Config, genres, platform definitions
      storage/               Persistence (watchlist, preferences, recommendations)
      utils/                 Error handling, recommendation engine, service cache
    styles/
      globals.css            Tailwind source styles
  android/                   Capacitor native Android project
  docs/                      Design references and historical notes
```

## Features

- **Onboarding**: Name, streaming service selection, genre preferences
- **Home**: Featured hero, trending, popular, top rated, and personalised rows
- **Browse**: Search with auto-suggestions, category filters, service/genre/rating filter sheet
- **Detail View**: Hero image, IMDb/RT ratings, genre tags, streaming availability, rent/buy prices, cast, recommendations
- **Watchlist**: Want to Watch / Watched tabs, grid/list toggle, swipe gestures
- **Profile**: Edit details, manage services, genre preferences, dark/light/system theme
- **Recommendations**: Personalised "For You" based on genre affinity and watch history

## Design System

- **Theme**: Dark (#000000 OLED) / Light (#FFFFFF) with system preference detection
- **Accent**: Warm coral (#FF6B35)
- **Font**: DM Sans (via Google Fonts CDN)
- **Animations**: Framer Motion spring physics, parallax scrolling, rubber-band swipe gestures

## License

Private project - All rights reserved
