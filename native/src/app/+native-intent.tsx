import { stripMalformedQuery } from '@/lib/deepLinkQueryGuard';

// Runs on every incoming system link, cold (`initial: true`) and warm,
// before Expo Router parses it. Drops queries whose malformed
// percent-encoding would stall the JS thread in decode-uri-component
// (IN-DEP-001; see src/lib/deepLinkQueryGuard.ts). Notification taps
// route through router.push with our own server-authored paths, so they
// do not pass through here.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return stripMalformedQuery(path);
}
