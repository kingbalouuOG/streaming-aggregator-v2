/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TMDB_API_KEY: string;
  readonly VITE_OMDB_API_KEY: string;

  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Injected by Vite's `define` config (see vite.config.ts).
declare const __DEV__: boolean;
