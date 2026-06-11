
  import { createRoot } from "react-dom/client";
  import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
  import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
  import App from "./App.tsx";
  import { queryClient, persistOptions } from "./lib/queryClient";
  import "./index.css";

  // ─── Phase 0 / IN-012: one-time v1 localStorage purge ─────────────
  //
  // Two prototype users' devices still have v1 localStorage entries
  // (taste profile, cached recommendations, API response caches) that
  // could be read by v2 code and cause stale-data issues during the
  // Phase 0 -> Phase 4 transition. On first launch of a v2 build, we
  // wipe a known set of v1 keys and set @videx_version='2' so the
  // purge runs exactly once per device.
  //
  // Keys purged:
  //   - @taste_profile                 (v2 onboarding rebuilds it)
  //   - @app_recommendations           (v1 rec engine cache — cheap to rebuild)
  //   - @app_dismissed_recommendations (replaced by the getDismissedIds
  //                                      Supabase query in migration 015)
  //   - @app_hidden_gems               (no-op: not actually written in
  //                                      v1 code, but listed in the brief
  //                                      as belt-and-braces)
  //   - tmdb_* / sa_* / omdb_*         (API response caches written by
  //                                      cachedRequest wrapper; re-fetched
  //                                      on demand)
  //
  // Keys PRESERVED:
  //   - @app_watchlist / @user_profile / @user_preferences /
  //     @auth_user_id / videx-theme / sa_cache_flushed_v1
  //   - All of these are either user data we don't want to lose or
  //     unrelated flags.
  //
  // This supersedes the previous one-shot 'sa_cache_flushed_v1' flag
  // used to clear stale SA API cache — the new purge is a strict
  // superset.
  const VIDEX_VERSION_KEY = '@videx_version';
  if (localStorage.getItem(VIDEX_VERSION_KEY) !== '2') {
    const exactKeys = new Set([
      '@taste_profile',
      '@app_recommendations',
      '@app_dismissed_recommendations',
      '@app_hidden_gems',
    ]);
    const prefixMatch = ['tmdb_', 'sa_', 'omdb_'];
    // Snapshot keys first because removeItem() mutates localStorage
    // during iteration on some implementations.
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null) allKeys.push(key);
    }
    for (const key of allKeys) {
      if (exactKeys.has(key) || prefixMatch.some((p) => key.startsWith(p))) {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem(VIDEX_VERSION_KEY, '2');
  }

  // PLAT-1: TanStack Query provider with localStorage persistence
  // (content namespaces only — see lib/queryClient.ts). Devtools render
  // nothing in production builds (library no-ops on import.meta.env.PROD).
  createRoot(document.getElementById("root")!).render(
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <App />
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </PersistQueryClientProvider>,
  );
