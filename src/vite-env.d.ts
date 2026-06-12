/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PLAT-2: videx-api Worker base URL — the TMDb/OMDB keys live
   *  server-side as Worker secrets and no longer exist in client code. */
  readonly VITE_API_PROXY_URL?: string;

  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Injected by Vite's `define` config (see vite.config.ts).
declare const __DEV__: boolean;
