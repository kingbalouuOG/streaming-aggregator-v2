# StreamHub Frontend Integration & Capacitor Deployment

## Prompt for Claude Code

Copy everything below this line and paste it into Claude Code in your existing repo.

---

## Context

I have a **fully built React + Tailwind CSS v4 frontend** for a streaming aggregator app called StreamHub. It was prototyped in Figma Make and is ready to be integrated into my existing codebase, which has the backend structure (APIs, vector database, recommendation logic, etc.) already in place.

I need your help to:
1. Integrate the new frontend into my existing repo (phased migration)
2. Bridge the frontend to my existing backend/API layer (replace mock data)
3. Set up Capacitor to wrap the app as a native Android & iOS app

---

## What the new frontend contains (from Figma Make)

### Design System & Foundation
- **`/styles/globals.css`** — Full light/dark/system theme with 15+ semantic CSS variables, DM Sans font, Capacitor-ready CSS (no tap delay, no overscroll bounce, no text selection, safe-area padding, backdrop-filter fallbacks for older Android WebViews)
- **`/components/ThemeContext.tsx`** — React context for dark/light/system theme management with `data-theme` attribute on `<html>`, system preference listener, `useTheme()` hook
- **`/components/platformLogos.ts`** — Central platform config: imports 10 logo PNGs, exports typed `ServiceId` union, `PLATFORMS` array with metadata (name, description, logo, colors), lookup helpers (`getPlatform`, `getPlatformName`, `getPlatformLogo`, `serviceLabels`)

### Platform Logos (10 PNG assets)
These are the streaming service logos imported via `figma:asset/...` scheme. In the real repo, these need to be placed in your `public/` or `assets/` folder and the import paths updated:
- Netflix, Prime Video, Apple TV+, Disney+, NOW, Sky Go, Paramount+, BBC iPlayer, ITVX, Channel 4

### Leaf Components (no internal dependencies beyond platformLogos)
- **`/components/ServiceBadge.tsx`** — Renders platform logo as a rounded image badge (sm/md/lg sizes), falls back to colored letter. Used everywhere services appear.
- **`/components/ImageSkeleton.tsx`** — `<img>` wrapper with shimmer loading state
- **`/components/BottomNav.tsx`** — Fixed bottom tab bar (Home/Browse/Watchlist/Profile) with Motion animations, safe-area padding, watchlist badge count

### Card Components (depend on ServiceBadge, ImageSkeleton)
- **`/components/ContentCard.tsx`** — Exports the `ContentItem` interface (the core data type used everywhere). Renders a poster card with service badges, rating, bookmark button with haptic-feel animation
- **`/components/BrowseCard.tsx`** — 2-column grid variant of ContentCard for Browse page

### Row & Filter Components
- **`/components/ContentRow.tsx`** — Horizontal scrollable row of ContentCards with title header
- **`/components/CategoryFilter.tsx`** — Horizontal pill filter bar (All/Movies/TV Shows/Docs/Anime) with filter button
- **`/components/FilterSheet.tsx`** — Bottom sheet with streaming service filters (logo circles), content type, cost, genre pills, rating slider. Exports `FilterState` interface and `defaultFilters`. Uses PLATFORMS from platformLogos.ts.

### Page Components
- **`/components/FeaturedHero.tsx`** — Parallax hero banner with gradient overlays, service badges, bookmark CTA, scroll-linked opacity/scale
- **`/components/BrowsePage.tsx`** — Search with auto-suggestions (recent + trending), category pills, filter integration, 2-column poster grid. Contains mock browse data.
- **`/components/WatchlistPage.tsx`** — Want to Watch / Watched tabs, grid/list toggle, swipe gestures with rubber-band physics, long-press overlay actions
- **`/components/DetailPage.tsx`** — Full detail view with hero image, IMDb/RT ratings, genre tags, "Available on" with service badges, rent/buy options, cast carousel, "More Like This" recommendations powered by a multi-factor scoring engine. Contains mock detail data map.
- **`/components/ProfilePage.tsx`** — Editable name/email, streaming services manager (logo grid with connect/disconnect), genre picker, dark/light/system theme toggle, stats display
- **`/components/OnboardingFlow.tsx`** — 3-step onboarding: profile details → service selection (logo cards) → genre picker. Slide animations with directional transitions. Exports `OnboardingData` and `allServices`.

### Root
- **`/App.tsx`** — Main app shell. All global state is lifted here: watchlist/watched arrays, bookmark logic, filter state, onboarding state, scroll tracking for parallax. Wraps everything in `ThemeProvider`. Contains mock content data for Home page rows.

### Dependencies
- `react`, `tailwindcss` v4, `motion` (imported as `motion/react`), `sonner@2.0.3`, `lucide-react`
- No router — navigation is tab-based with state in App.tsx
- No external API calls — all data is currently mock/hardcoded

---

## What my existing repo has (keep all of this)

> **IMPORTANT: Before you start, explore my existing repo structure and list out:**
> 1. The backend/API layer — endpoints, services, controllers
> 2. The vector database setup — schema, embeddings, similarity search
> 3. The recommendation engine — algorithm, scoring, data pipeline
> 4. Authentication/user management
> 5. Any existing frontend code and how it's structured
> 6. Package manager, build tool, existing dependencies
> 7. Environment variables and config files

---

## Migration Plan (5 Phases)

### Phase 1: Foundation Layer
**Goal:** Get the design system and shared infrastructure in place without breaking anything.

1. Copy `globals.css` content and merge with existing styles (preserve any existing CSS, add the new tokens and Capacitor utilities)
2. Add DM Sans font import if not already present
3. Install/verify dependencies: `motion`, `sonner@2.0.3`, `lucide-react`, `tailwindcss` v4
4. Copy `ThemeContext.tsx` → wrap existing app root with `<ThemeProvider>`
5. Copy platform logo PNGs to `public/assets/logos/` (or similar)
6. Copy `platformLogos.ts` → update import paths from `figma:asset/...` to actual file paths (e.g., `/assets/logos/netflix.png`)
7. Verify the theme toggle works end-to-end

### Phase 2: Leaf Components
**Goal:** Add the smallest building blocks that have no page-level dependencies.

1. Copy `ServiceBadge.tsx` (depends only on `platformLogos.ts`)
2. Copy `ImageSkeleton.tsx` (standalone)
3. Copy `BottomNav.tsx` (standalone)
4. Unit test each component renders correctly in isolation

### Phase 3: Cards, Rows & Shared UI
**Goal:** Build up the mid-level components.

1. Copy `ContentCard.tsx` — this exports the `ContentItem` interface. **KEY DECISION:** This interface currently uses mock fields. You need to map it to your real data model. Create an adapter/mapper if your API returns a different shape.
2. Copy `BrowseCard.tsx`
3. Copy `ContentRow.tsx`
4. Copy `CategoryFilter.tsx`
5. Copy `FilterSheet.tsx`

### Phase 4: Pages (with backend bridging)
**Goal:** Integrate each page, replacing mock data with real API calls.

For each page, follow this pattern:
1. Copy the component file
2. Identify all mock/hardcoded data in that file
3. Replace with calls to your existing API layer
4. Keep the UI rendering logic identical

**Page-by-page:**

- **`FeaturedHero.tsx`** — No mock data inside, just props. Copy as-is.
- **`BrowsePage.tsx`** — Replace `browseItems` array with API call to your search/browse endpoint. Replace `trendingSearches` with API data. Wire the `FilterState` to your API query params.
- **`DetailPage.tsx`** — Replace `detailDataMap` with API call to your detail endpoint. Replace the `getRecommendations()` function with a call to your vector DB / recommendation engine. Keep the UI rendering.
- **`WatchlistPage.tsx`** — No mock data inside (receives watchlist via props). Copy as-is. Consider persisting watchlist to your backend instead of just React state.
- **`ProfilePage.tsx`** — Replace hardcoded defaults with user data from your auth/user API. Wire service connect/disconnect to your backend.
- **`OnboardingFlow.tsx`** — Wire completion to your user creation/update API. Consider storing onboarding state in your backend.

### Phase 5: Root App & Routing
**Goal:** Wire everything together.

1. If your app uses React Router, convert the tab-based navigation to routes:
   - `/` → Home (FeaturedHero + ContentRows)
   - `/browse` → BrowsePage
   - `/watchlist` → WatchlistPage  
   - `/profile` → ProfilePage
   - `/detail/:id` → DetailPage
   - Keep BottomNav as a persistent layout element
2. Move global state from App.tsx to your state management solution (React Context, Zustand, Redux, etc.)
3. Replace the mock data arrays in App.tsx (`popularItems`, `highestRated`, `recentlyAdded`) with API calls to your backend
4. Wire the `featuredItem` to your "featured/hero" API endpoint
5. Handle the onboarding flow (show on first visit, skip if user already completed)

---

## Backend Bridging Checklist

Create an API service layer (e.g., `src/services/api.ts`) that the frontend calls instead of using mock data. Map these:

| Frontend Mock Data | Replace With |
|---|---|
| `popularItems` array in App.tsx | `GET /api/content/popular` or similar |
| `highestRated` array in App.tsx | `GET /api/content/top-rated` |
| `recentlyAdded` array in App.tsx | `GET /api/content/recent` |
| `browseItems` in BrowsePage.tsx | `GET /api/content/search?q=...&filters=...` |
| `detailDataMap` in DetailPage.tsx | `GET /api/content/:id` |
| `getRecommendations()` in DetailPage.tsx | `GET /api/recommendations/:id` (your vector DB) |
| `trendingSearches` in BrowsePage.tsx | `GET /api/search/trending` |
| Watchlist state in App.tsx | `POST/GET/DELETE /api/watchlist` |
| User profile in ProfilePage.tsx | `GET/PUT /api/user/profile` |
| Onboarding in OnboardingFlow.tsx | `POST /api/user/onboarding` |

### ContentItem Interface Mapping

The frontend uses this interface everywhere:
```typescript
interface ContentItem {
  id: string;
  title: string;
  image: string;
  services: ServiceId[]; // "netflix" | "prime" | "apple" | "disney" | "now" | "skygo" | "paramount" | "bbc" | "itvx" | "channel4"
  rating?: number;
  year?: number;
  type?: "movie" | "tv" | "doc";
}
```

Create a mapper function that converts your API response shape to this interface. Example:
```typescript
function mapApiToContentItem(apiItem: YourApiType): ContentItem {
  return {
    id: apiItem.id,
    title: apiItem.title,
    image: apiItem.poster_url || apiItem.thumbnail,
    services: apiItem.available_on.map(mapServiceId),
    rating: apiItem.imdb_rating,
    year: apiItem.release_year,
    type: mapContentType(apiItem.media_type),
  };
}
```

---

## Capacitor Setup (Phase 6)

After the frontend is integrated and working in the browser:

### 1. Install Capacitor
```bash
npm install @capacitor/core @capacitor/cli
npx cap init "StreamHub" "com.streamhub.app" --web-dir dist
```
(Adjust `--web-dir` to match your build output folder: `dist`, `build`, `out`, etc.)

### 2. Add Platforms
```bash
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
```

### 3. Configure `capacitor.config.ts`
```typescript
import type { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.streamhub.app',
  appName: 'StreamHub',
  webDir: 'dist',
  server: {
    // For development, enable live reload:
    // url: 'http://YOUR_LOCAL_IP:5173',
    // cleartext: true,
  },
  ios: {
    contentInset: 'automatic',
    // This enables the CSS env(safe-area-inset-*) values
    allowsLinkPreview: false,
  },
  android: {
    // Enable WebView debugging in dev
    // webContentsDebuggingEnabled: true,
  },
  plugins: {
    StatusBar: {
      style: 'Dark', // or 'Light' based on theme
      backgroundColor: '#0a0a0f',
    },
    SplashScreen: {
      launchAutoHide: true,
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
```

### 4. Essential Capacitor Plugins
```bash
npm install @capacitor/status-bar @capacitor/splash-screen @capacitor/haptics @capacitor/keyboard
```

### 5. StatusBar Theme Sync
Add to your ThemeContext or App component:
```typescript
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

// Inside useEffect that watches resolvedTheme:
if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({
    style: resolvedTheme === 'dark' ? Style.Dark : Style.Light,
  });
  StatusBar.setBackgroundColor({
    color: resolvedTheme === 'dark' ? '#0a0a0f' : '#f5f4f1',
  });
}
```

### 6. Haptic Feedback (Optional Enhancement)
Replace the Motion whileTap animations on bookmark buttons with real haptics:
```typescript
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

const triggerHaptic = () => {
  if (Capacitor.isNativePlatform()) {
    Haptics.impact({ style: ImpactStyle.Light });
  }
};
```

### 7. Build & Deploy Flow
```bash
# Build the web app
npm run build

# Sync web assets to native projects
npx cap sync

# Open in Android Studio / Xcode
npx cap open android
npx cap open ios

# Or run directly
npx cap run android
npx cap run ios
```

### 8. CSS Already Capacitor-Ready
The globals.css already includes these native-feel optimizations:
- `env(safe-area-inset-*)` padding on headers, nav, bottom sheets
- `-webkit-user-select: none` (with exception for inputs)
- `overscroll-behavior: none` (prevents pull-to-refresh, rubber-banding)
- `touch-action: manipulation` (eliminates 300ms tap delay)
- `-webkit-overflow-scrolling: touch` (smooth momentum scrolling)
- `backdrop-filter` fallback for older Android WebViews
- `-webkit-tap-highlight-color: transparent`

---

## File Dependency Graph (Migration Order)

```
globals.css                          ← Phase 1 (no deps)
ThemeContext.tsx                      ← Phase 1 (no deps)
platformLogos.ts                     ← Phase 1 (logo PNGs)
  ├── ServiceBadge.tsx               ← Phase 2
  ├── FilterSheet.tsx                ← Phase 3
  ├── OnboardingFlow.tsx             ← Phase 4
  └── ProfilePage.tsx                ← Phase 4
ImageSkeleton.tsx                    ← Phase 2 (no deps)
BottomNav.tsx                        ← Phase 2 (no deps)
ContentCard.tsx                      ← Phase 3 (ServiceBadge, ImageSkeleton)
  ├── BrowseCard.tsx                 ← Phase 3
  ├── ContentRow.tsx                 ← Phase 3
  ├── BrowsePage.tsx                 ← Phase 4 (BrowseCard, FilterSheet)
  ├── WatchlistPage.tsx              ← Phase 4 (ContentItem, ServiceBadge)
  └── DetailPage.tsx                 ← Phase 4 (ServiceBadge, ContentItem, ImageSkeleton)
CategoryFilter.tsx                   ← Phase 3 (no deps)
FeaturedHero.tsx                     ← Phase 4 (ServiceBadge, ImageSkeleton)
App.tsx                              ← Phase 5 (everything)
```

---

## Important Notes

1. **Don't delete any backend code.** The frontend is purely additive.
2. **The `ServiceId` type** is the contract between frontend and backend. Your API should return service identifiers that map to these 10 IDs: `netflix`, `prime`, `apple`, `disney`, `now`, `skygo`, `paramount`, `bbc`, `itvx`, `channel4`.
3. **The `figma:asset/...` imports** are virtual and only work in Figma Make. Replace them with real file paths in your repo.
4. **Tailwind v4** uses `@theme inline` and CSS-native features. Make sure your Tailwind config is v4-compatible.
5. **Motion** (formerly Framer Motion) is imported as `motion/react`. Install the `motion` package, not `framer-motion`.
6. **Sonner** toasts must be imported as `sonner@2.0.3` in the Figma Make environment but just `sonner` in a real repo.
7. All font sizes, weights, and line-heights are set via inline `style={{ fontWeight: ... }}` and `text-[Xpx]` classes, not via Tailwind presets, for precise control.

---

## Start Command

Please begin by exploring my existing repo structure. List out:
1. The project structure (folders, key files)
2. The package.json dependencies
3. The backend/API architecture
4. The database/vector DB setup
5. Any existing frontend components

Then propose a concrete, file-by-file plan for Phase 1 before writing any code.
