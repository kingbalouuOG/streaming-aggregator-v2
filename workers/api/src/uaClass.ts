/**
 * User-Agent classification for page telemetry (Growth G0-6, S2).
 *
 * A shared link is fetched twice over: once by the chat app's preview
 * crawler (WhatsApp, iMessage, Slack...) to unfurl it, and once by each
 * person who taps it. Both hit the same /t/ or /room/ route, so the page
 * handler records preview_fetched for a crawler and preview_opened for a
 * person, and the preview open rate is the ratio.
 *
 * Only the class and a short agent name are stored (growth_events.ua_class,
 * metadata.agent), never the User-Agent string.
 *
 * Pure module, tested from the root vitest rig.
 */

export type UaClass = 'crawler' | 'human';

export interface UaClassification {
  uaClass: UaClass;
  /** Short crawler name ('whatsapp', 'slack'...); null for people. */
  agent: string | null;
}

// Order matters: iMessage's fetcher sends a composite UA that also names
// facebookexternalhit and Twitterbot, and TelegramBot says "like TwitterBot".
const PREVIEW_AGENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/facebookexternalhit.*Twitterbot/i, 'imessage'],
  [/WhatsApp/i, 'whatsapp'],
  [/TelegramBot/i, 'telegram'],
  [/facebookexternalhit|facebookcatalog|Facebot|meta-externalagent/i, 'facebook'],
  [/Slackbot|Slack-ImgProxy/i, 'slack'],
  [/Twitterbot/i, 'twitter'],
  [/Discordbot/i, 'discord'],
  [/LinkedInBot/i, 'linkedin'],
  [/Applebot/i, 'applebot'],
  [/Googlebot|Google-InspectionTool|GoogleOther|AdsBot-Google|Mediapartners-Google|APIs-Google/i, 'google'],
  [/bingbot|BingPreview/i, 'bing'],
  [/Pinterestbot|redditbot|SkypeUriPreview|Embedly|Iframely|vkShare|Mastodon/i, 'other_preview'],
  [/HeadlessChrome|PhantomJS|Puppeteer|Playwright|Lighthouse/i, 'headless'],
  // Generic tooling and bots. "\bbot\b" and "[a-z]bot/" rather than a bare
  // "bot", which would catch phone models such as "CUBOT X30".
  [
    /\bbot\b|[a-z]bot\/|crawler|spider|curl\/|wget\/|python-requests|python-urllib|aiohttp|okhttp|Go-http-client|node-fetch|undici|axios\//i,
    'other',
  ],
];

export function classifyUserAgent(userAgent: string | null | undefined): UaClassification {
  const ua = (userAgent ?? '').trim();
  if (!ua) return { uaClass: 'crawler', agent: 'empty' };
  for (const [pattern, agent] of PREVIEW_AGENTS) {
    if (pattern.test(ua)) return { uaClass: 'crawler', agent };
  }
  return { uaClass: 'human', agent: null };
}
