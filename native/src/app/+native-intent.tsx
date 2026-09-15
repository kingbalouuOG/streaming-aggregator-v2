import { recordInboundLink } from '@/attribution';
import { stripMalformedQuery } from '@/lib/deepLinkQueryGuard';
import { parseInboundLink } from '@/lib/growth/inboundLink';
import { writePendingLink } from '@/pendingLink';

// Runs on every incoming system link, cold (`initial: true`) and warm,
// before Expo Router parses it. Notification taps route through
// router.push with our own server-authored paths, so they do not pass
// through here.
//
// 1. Drops queries whose malformed percent-encoding would stall the JS
//    thread in decode-uri-component (IN-DEP-001; see
//    src/lib/deepLinkQueryGuard.ts). Must stay first.
// 2. Maps the public URL grammar (universal links, app links, videx://)
//    to an app route and captures ?via= / ?src= (ADR-015,
//    src/lib/growth/inboundLink.ts).
// 3. Records object links as the pending link so a signed-out recipient
//    lands on the object after sign-in or onboarding (native/src/pendingLink.ts).
// 4. Records the first touch and posts link_opened with via / src / object
//    (Growth S2, native/src/attribution.ts). Fire-and-forget.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const safe = stripMalformedQuery(path);
    // Dev-client launcher URLs belong to Expo, not to the app grammar.
    if (__DEV__ && /^exp(\+[a-z0-9.-]+)?:\/\//i.test(safe)) return safe;
    const link = parseInboundLink(safe);
    writePendingLink(link);
    recordInboundLink(link);
    return link.route;
  } catch {
    // Never throw here: a crash in the interceptor kills the cold start.
    return '/';
  }
}
