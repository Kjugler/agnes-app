import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  VISIT_GAP_MS,
  copyNavParams,
  pathWithoutDisallowedClickIds,
  redactAdvertisingClickIdsFromFunnelPayload,
  resolveAdvertisingClickIdPermission,
  resolveVisitEntry,
  type StoredVisit,
} from './funnelVisit.ts';

const HOUR = 60 * 60 * 1000;

function visit(overrides: Partial<StoredVisit> = {}): StoredVisit {
  return {
    entryPage: '/readers-agree',
    seenAt: 1_000_000,
    source: 'meta',
    campaign: 'fall',
    clicks: { gclid: 'g-old' },
    ...overrides,
  };
}

describe('visit landing attribution', () => {
  it('keeps the visit entry during internal navigation', () => {
    const result = resolveVisitEntry({
      stored: visit(),
      now: visit().seenAt + 2 * HOUR,
      source: 'sample-chapters',
      explicit: '/sample-chapters',
      path: '/sample-chapters',
      utm: { utm_source: 'meta', utm_campaign: 'fall' },
    });
    assert.equal(result.entryPage, '/readers-agree');
    assert.equal(result.started, false);
    assert.equal(result.visit && result.visit.entryPage, '/readers-agree');
  });

  it('keeps the visit when a later landing URL drops its parameters', () => {
    const result = resolveVisitEntry({
      stored: visit(),
      now: visit().seenAt + 30 * 60 * 1000,
      source: 'readers-cheer',
      explicit: '/readers-cheer',
      utm: {},
    });
    assert.equal(result.entryPage, '/readers-agree');
    assert.equal(result.started, false);
  });

  it('starts a new visit after six hours on a landing page', () => {
    const result = resolveVisitEntry({
      stored: visit(),
      now: visit().seenAt + VISIT_GAP_MS,
      source: 'world-wondering',
      path: '/world-wondering',
      utm: { utm_source: 'meta', utm_campaign: 'fall' },
    });
    assert.equal(result.started, true);
    assert.equal(result.entryPage, '/world-wondering');
  });

  it('does not assign an expired visit to later catalog, checkout, or reading activity', () => {
    const catalog = resolveVisitEntry({
      stored: visit(),
      now: visit().seenAt + VISIT_GAP_MS + 1,
      source: 'catalog',
      path: '/catalog',
      utm: {},
    });
    assert.equal(catalog.entryPage, null);
    assert.equal(catalog.persist, false);
    assert.equal(catalog.visit && catalog.visit.seenAt, visit().seenAt);
  });

  it('starts a new visit when the advertising campaign changes', () => {
    const result = resolveVisitEntry({
      stored: visit(),
      now: visit().seenAt + 10 * 60 * 1000,
      source: 'readers-agree',
      utm: { utm_source: 'google', utm_campaign: 'spring', gclid: 'g-old' },
    });
    assert.equal(result.started, true);
    assert.equal(result.entryPage, '/readers-agree');
    assert.equal(result.visit && result.visit.campaign, 'spring');
  });

  it('starts a new visit when the click id changes', () => {
    const result = resolveVisitEntry({
      stored: visit(),
      now: visit().seenAt + 10 * 60 * 1000,
      source: 'world-wondering',
      utm: { utm_source: 'meta', utm_campaign: 'fall', gclid: 'g-new' },
    });
    assert.equal(result.started, true);
    assert.equal(result.entryPage, '/world-wondering');
    assert.equal(result.visit && result.visit.clicks.gclid, 'g-new');
  });

  it('starts a new visit when fbclid changes and measurement is allowed', () => {
    const result = resolveVisitEntry({
      stored: visit({ clicks: { fbclid: 'fb-old' } }),
      now: visit().seenAt + 10 * 60 * 1000,
      source: 'readers-agree',
      utm: { utm_source: 'meta', utm_campaign: 'fall', fbclid: 'fb-new' },
    });
    assert.equal(result.started, true);
    assert.equal(result.visit && result.visit.clicks.fbclid, 'fb-new');
  });

  it('does not treat a click id as a new visit when advertising measurement is off', () => {
    const result = resolveVisitEntry({
      stored: visit({ clicks: {} }),
      now: visit().seenAt + 10 * 60 * 1000,
      source: 'readers-agree',
      utm: { utm_source: 'meta', utm_campaign: 'fall', gclid: 'g-secret', fbclid: 'fb-secret' },
      includeAdvertisingClickIds: false,
    });
    assert.equal(result.started, false);
    assert.equal(result.entryPage, '/readers-agree');
    assert.equal(result.visit && result.visit.clicks.gclid, undefined);
    assert.equal(result.visit && result.visit.clicks.fbclid, undefined);
    assert.equal(result.visit && result.visit.campaign, 'fall');
  });

  it('removes a stored advertising click id when measurement is turned off', () => {
    const result = resolveVisitEntry({
      stored: visit({ clicks: { gclid: 'g-old', fbclid: 'fb-old' } }),
      now: visit().seenAt + 5 * 60 * 1000,
      source: 'catalog',
      path: '/catalog',
      includeAdvertisingClickIds: false,
    });
    assert.equal(result.redacted, true);
    assert.equal(result.persist, true);
    assert.equal(result.visit && result.visit.clicks.gclid, undefined);
    assert.equal(result.visit && result.visit.clicks.fbclid, undefined);
    assert.equal(result.entryPage, '/readers-agree');
  });
});

describe('advertising click id permission', () => {
  it('allows storage only when measurement is permitted', () => {
    assert.equal(resolveAdvertisingClickIdPermission({ hasDocument: true, readAllowed: () => true }), true);
  });

  it('refuses storage when measurement is denied', () => {
    assert.equal(resolveAdvertisingClickIdPermission({ hasDocument: true, readAllowed: () => false }), false);
  });

  it('refuses storage when consent is unavailable', () => {
    assert.equal(resolveAdvertisingClickIdPermission({ hasDocument: false, readAllowed: () => true }), false);
    assert.equal(
      resolveAdvertisingClickIdPermission({
        hasDocument: true,
        readAllowed: () => {
          throw new Error('consent unavailable');
        },
      }),
      false,
    );
  });

  it('keeps ordinary utm parameters when advertising click ids are removed', () => {
    const params = new URLSearchParams(
      'utm_source=google&utm_campaign=spring&ref=friend&fbclid=fb-1&gclid=g-secret&ttclid=tt-secret&msclkid=ms-secret',
    );
    const copied = copyNavParams(params, false);
    assert.equal(copied.get('utm_source'), 'google');
    assert.equal(copied.get('utm_campaign'), 'spring');
    assert.equal(copied.get('ref'), 'friend');
    assert.equal(copied.get('fbclid'), null);
    assert.equal(copied.get('gclid'), null);
    assert.equal(copied.get('ttclid'), null);
    assert.equal(copied.get('msclkid'), null);

    const allowed = copyNavParams(params, true);
    assert.equal(allowed.get('fbclid'), 'fb-1');
    assert.equal(allowed.get('gclid'), 'g-secret');
    assert.equal(allowed.get('ttclid'), 'tt-secret');
    assert.equal(allowed.get('msclkid'), 'ms-secret');
    assert.equal(allowed.get('utm_campaign'), 'spring');
  });

  it('does not persist prohibited click ids on the event when measurement is denied', () => {
    const payload = redactAdvertisingClickIdsFromFunnelPayload(
      {
        type: 'READERS_AGREE_PAGE_VIEW',
        path: '/readers-agree?utm_source=google&utm_campaign=spring&fbclid=fb-1&gclid=g-secret&ttclid=tt-secret&msclkid=ms-secret',
        meta: {
          utm_source: 'google',
          utm_campaign: 'spring',
          fbclid: 'fb-1',
          gclid: 'g-secret',
          ttclid: 'tt-secret',
          msclkid: 'ms-secret',
          entryPage: '/readers-agree',
        },
      },
      false,
    );
    const encoded = JSON.stringify(payload);
    assert.equal(encoded.includes('fb-1'), false);
    assert.equal(encoded.includes('g-secret'), false);
    assert.equal(encoded.includes('tt-secret'), false);
    assert.equal(encoded.includes('ms-secret'), false);
    assert.equal(encoded.includes('fbclid'), false);
    assert.equal(encoded.includes('gclid'), false);
    assert.equal(payload.meta.utm_source, 'google');
    assert.equal(payload.meta.utm_campaign, 'spring');
    assert.equal(payload.meta.entryPage, '/readers-agree');
    assert.equal(payload.path.includes('utm_source=google'), true);
    assert.equal(payload.path.includes('utm_campaign=spring'), true);
    assert.equal(payload.path.includes('fbclid'), false);
  });

  it('keeps registration fields when a disallowed fbclid is removed from a lead submission', () => {
    const payload = redactAdvertisingClickIdsFromFunnelPayload(
      {
        email: 'reader@example.com',
        visitorId: 'visitor-1',
        ref: 'friend',
        code: 'friend',
        promotionalOptIn: false,
        captureSurface: 'landing',
        utm: {
          utm_source: 'meta',
          utm_campaign: 'fall',
          fbclid: 'fb-secret',
          gclid: 'g-secret',
        },
      },
      false,
    );
    assert.equal(payload.email, 'reader@example.com');
    assert.equal(payload.ref, 'friend');
    assert.equal(payload.code, 'friend');
    assert.equal(payload.promotionalOptIn, false);
    assert.equal(payload.captureSurface, 'landing');
    assert.equal(payload.utm.utm_source, 'meta');
    assert.equal(payload.utm.utm_campaign, 'fall');
    assert.equal(payload.utm.fbclid, undefined);
    assert.equal(JSON.stringify(payload).includes('fb-secret'), false);
  });
});
