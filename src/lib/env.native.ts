/**
 * Native shadow of env.ts (NATIVE-1, D-N5). Metro resolves this file
 * instead of env.ts via platform extensions (and tsc does the same via
 * `moduleSuffixes` in native/tsconfig.json) — env.ts contains
 * `import.meta`, which Metro cannot parse.
 *
 * `process.env.EXPO_PUBLIC_*` member expressions are inlined by Expo
 * at bundle time; they must stay written out literally (no dynamic
 * key access).
 */

declare const process: { env: Record<string, string | undefined> };

export const env = {
  get DEV(): boolean {
    return __DEV__;
  },
  get SUPABASE_URL(): string | undefined {
    return process.env.EXPO_PUBLIC_SUPABASE_URL;
  },
  get SUPABASE_ANON_KEY(): string | undefined {
    return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  },
  get API_PROXY_URL(): string | undefined {
    return process.env.EXPO_PUBLIC_API_PROXY_URL;
  },
};
