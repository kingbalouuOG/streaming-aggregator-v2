/**
 * Environment indirection (NATIVE-1 W1, D-N5).
 *
 * The single place in the shared lib tree that touches `import.meta.env`.
 * Every other module reads through these getters, so the tree stays
 * importable by all three consumers:
 *  - Vite (web): `import.meta.env.VITE_*` populated at build.
 *  - videx-api Worker: `import.meta.env` is undefined at runtime — the
 *    optional chain returns undefined instead of throwing at module init
 *    (server code injects its own config and never reads these).
 *  - React Native (Metro): Metro cannot parse `import.meta` at all, so
 *    the native tree shadows this file with `env.native.ts`
 *    (`process.env.EXPO_PUBLIC_*`) via platform extension resolution.
 *    Do NOT add `import.meta` references anywhere else in src/lib.
 *
 * Getters, not consts: reads stay lazy (same discipline as the supabase
 * singleton) so importing this module is side-effect-free everywhere.
 */

export const env = {
  get DEV(): boolean {
    return Boolean(import.meta.env?.DEV);
  },
  get SUPABASE_URL(): string | undefined {
    return import.meta.env?.VITE_SUPABASE_URL as string | undefined;
  },
  get SUPABASE_ANON_KEY(): string | undefined {
    return import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;
  },
  get API_PROXY_URL(): string | undefined {
    return import.meta.env?.VITE_API_PROXY_URL as string | undefined;
  },
};
