/**
 * Crawler vs human classification for preview_fetched / preview_opened
 * (Growth S2). Fixture UAs are the strings these fetchers send.
 */

import { describe, expect, it } from 'vitest';

import { classifyUserAgent } from '../uaClass';

describe('classifyUserAgent — link-preview crawlers', () => {
  it.each([
    ['WhatsApp', 'WhatsApp/2.23.20.0 A', 'whatsapp'],
    ['facebookexternalhit', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'facebook'],
    ['Slackbot', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)', 'slack'],
    ['Twitterbot', 'Twitterbot/1.0', 'twitter'],
    [
      'Applebot',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
      'applebot',
    ],
    [
      'Googlebot',
      'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'google',
    ],
    ['Discordbot', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', 'discord'],
    ['TelegramBot', 'TelegramBot (like TwitterBot)', 'telegram'],
    ['LinkedInBot', 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)', 'linkedin'],
    [
      'iMessage',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
      'imessage',
    ],
    [
      'headless Chrome',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36',
      'headless',
    ],
    ['curl', 'curl/8.7.1', 'other'],
    ['a generic crawler', 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)', 'other'],
  ])('%s', (_name, ua, agent) => {
    expect(classifyUserAgent(ua)).toEqual({ uaClass: 'crawler', agent });
  });

  it.each([[''], ['   '], [null], [undefined]])('an empty UA (%j) is a crawler', (ua) => {
    expect(classifyUserAgent(ua)).toEqual({ uaClass: 'crawler', agent: 'empty' });
  });
});

describe('classifyUserAgent — people', () => {
  it.each([
    [
      'iPhone Safari',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    ],
    [
      'Android Chrome',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    ],
    [
      'desktop Chrome',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ],
    [
      'the Facebook in-app browser',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F79 [FBAN/FBIOS;FBAV/470.0.0.38.109;FBBV/620000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_GB;FBOP/5]',
    ],
    [
      'the Instagram in-app browser',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 336.0.0.19.97 (iPhone15,2; iOS 17_5; en_GB; en; scale=3.00; 1179x2556; 610473400)',
    ],
    [
      'a phone model containing "bot"',
      'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    ],
  ])('%s', (_name, ua) => {
    expect(classifyUserAgent(ua)).toEqual({ uaClass: 'human', agent: null });
  });
});
