import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appleAppSiteAssociation,
  assetLinks,
  LINK_PATH_PREFIXES,
  parseFingerprints,
  WELL_KNOWN_HEADERS,
} from '../wellKnown';

const UPLOAD = '99:CE:FF:7E:70:01:19:F5:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:18:41:4C:57';
const SIGNING = 'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89';

describe('apple-app-site-association', () => {
  it('is exactly the modern and legacy applinks forms', () => {
    expect(JSON.stringify(appleAppSiteAssociation())).toBe(
      JSON.stringify({
        applinks: {
          apps: [],
          details: [
            {
              appIDs: ['CT8F3578W8.app.videx.streaming'],
              components: [{ '/': '/t/*' }, { '/': '/room/*' }, { '/': '/list/*' }],
              appID: 'CT8F3578W8.app.videx.streaming',
              paths: ['/t/*', '/room/*', '/list/*'],
            },
          ],
        },
      }),
    );
  });
});

describe('assetlinks.json', () => {
  it('is exactly the handle_all_urls statement with both fingerprints', () => {
    expect(JSON.stringify(assetLinks([UPLOAD, SIGNING]))).toBe(
      JSON.stringify([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: 'app.videx.streaming',
            sha256_cert_fingerprints: [UPLOAD, SIGNING],
          },
        },
      ]),
    );
  });
});

describe('parseFingerprints', () => {
  it('reads a comma-separated [vars] value, trimming and uppercasing', () => {
    expect(parseFingerprints(` ${UPLOAD.toLowerCase()} ,${SIGNING}`)).toEqual([UPLOAD, SIGNING]);
  });
  it('drops malformed and duplicate entries', () => {
    expect(parseFingerprints(`${UPLOAD},99:CE:FF:7E,${UPLOAD},,nonsense`)).toEqual([UPLOAD]);
  });
  it('is empty when unset', () => {
    expect(parseFingerprints(undefined)).toEqual([]);
    expect(parseFingerprints('')).toEqual([]);
  });
});

describe('headers', () => {
  it('serves JSON with a content type Apple and Google accept, never a redirect', () => {
    expect(WELL_KNOWN_HEADERS['Content-Type']).toBe('application/json');
    expect(WELL_KNOWN_HEADERS).not.toHaveProperty('Location');
    expect(WELL_KNOWN_HEADERS['Cache-Control']).toBe('public, max-age=3600');
  });
});

describe('native/app.json claims the same paths', () => {
  const appJson = JSON.parse(readFileSync(path.resolve(process.cwd(), 'native/app.json'), 'utf8'));

  it('iOS associated domain', () => {
    expect(appJson.expo.ios.associatedDomains).toEqual(['applinks:videxstreaming.com']);
  });

  it('Android intent filter prefixes match the association files', () => {
    const filters = appJson.expo.android.intentFilters;
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({ action: 'VIEW', autoVerify: true, category: ['BROWSABLE', 'DEFAULT'] });
    expect(filters[0].data).toEqual(
      LINK_PATH_PREFIXES.map((pathPrefix) => ({ scheme: 'https', host: 'videxstreaming.com', pathPrefix })),
    );
  });
});
