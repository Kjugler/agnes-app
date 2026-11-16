import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { hydrateAdvertisingConsent } from './privacy/advertisingConsentClient.ts';
import {
  normalizePurchasePhone,
  sha256Hex,
  trackVerifiedTikTokPurchase,
} from './tiktokPixel.ts';

const require = createRequire(import.meta.url);
const { phoneForAdvertisingMatch } = require('../../../deepquill/lib/ads/phoneForAdvertisingMatch.cjs');

type TrackCall = {
  event: string;
  props?: Record<string, unknown>;
  options?: { event_id?: string };
};

const store = new Map<string, string>();
const tracks: TrackCall[] = [];
const identifies: Record<string, string>[] = [];

function installBrowser() {
  const windowRef = {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
    ttq: {
      page: () => undefined,
      identify: (props: Record<string, string>) => {
        identifies.push({ ...props });
      },
      track: (event: string, props?: Record<string, unknown>, options?: { event_id?: string }) => {
        tracks.push({ event, props, options });
      },
      load: () => undefined,
    },
  };
  Object.assign(globalThis, { window: windowRef });
}

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function setNavigator(value: object) {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  });
}

function allowMeasurement() {
  hydrateAdvertisingConsent({
    region: 'US',
    choice: 'unset',
    gpc: false,
    allowed: true,
    reason: 'us-default',
  });
  setNavigator({});
}

process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = 'test-pixel';

beforeEach(() => {
  installBrowser();
  allowMeasurement();
});

afterEach(() => {
  store.clear();
  tracks.length = 0;
  identifies.length = 0;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  allowMeasurement();
});

describe('verified TikTok purchase matching', () => {
  it('hashes the Stripe email and omits a missing ebook phone', async () => {
    allowMeasurement();
    const emailHash = await sha256Hex('buyer@example.com');
    await trackVerifiedTikTokPurchase({
      paid: true,
      eventId: 'cs_test_ebook',
      contentId: 'ebook',
      value: 12,
      currency: 'USD',
      email: ' Buyer@Example.com ',
      phone: null,
      externalId: null,
    });

    assert.equal(identifies.length, 1);
    assert.equal(identifies[0].email, emailHash);
    assert.equal(identifies[0].phone_number, undefined);
    assert.equal(identifies[0].external_id, undefined);
    assert.equal(JSON.stringify(identifies[0]).includes('buyer@example.com'), false);
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].event, 'CompletePayment');
    assert.deepEqual(tracks[0].props, {
      content_id: 'ebook',
      content_type: 'product',
      quantity: 1,
      value: 12,
      currency: 'USD',
    });
    assert.deepEqual(tracks[0].options, { event_id: 'cs_test_ebook' });
  });

  it('includes a hashed phone and customer id for a paperback', async () => {
    allowMeasurement();
    const phoneHash = await sha256Hex('+15551234567');
    const idHash = await sha256Hex('user_123');
    await trackVerifiedTikTokPurchase({
      paid: true,
      eventId: 'cs_test_paper',
      contentId: 'paperback',
      value: 26.9,
      currency: 'USD',
      email: 'buyer@example.com',
      phone: '+1 (555) 123-4567',
      externalId: ' user_123 ',
    });

    assert.equal(identifies[0].phone_number, phoneHash);
    assert.equal(identifies[0].external_id, idHash);
    assert.equal(tracks[0].props?.content_id, 'paperback');
  });

  it('does not report a canceled checkout', async () => {
    allowMeasurement();
    await trackVerifiedTikTokPurchase({
      paid: false,
      eventId: 'cs_test_cancel',
      contentId: 'ebook',
      value: 12,
      currency: 'USD',
      email: 'buyer@example.com',
    });
    assert.equal(tracks.length, 0);
    assert.equal(identifies.length, 0);
  });

  it('reports a refreshed success page once', async () => {
    allowMeasurement();
    const purchase = {
      paid: true,
      eventId: 'cs_test_refresh',
      contentId: 'ebook',
      value: 12,
      currency: 'USD',
      email: 'buyer@example.com',
    };
    await trackVerifiedTikTokPurchase(purchase);
    await trackVerifiedTikTokPurchase(purchase);
    assert.equal(tracks.length, 1);
  });

  it('reports a later purchase from the same customer', async () => {
    allowMeasurement();
    await trackVerifiedTikTokPurchase({
      paid: true,
      eventId: 'cs_test_first',
      contentId: 'ebook',
      value: 12,
      currency: 'USD',
      email: 'buyer@example.com',
    });
    await trackVerifiedTikTokPurchase({
      paid: true,
      eventId: 'cs_test_second',
      contentId: 'ebook',
      value: 12,
      currency: 'USD',
      email: 'buyer@example.com',
    });
    assert.deepEqual(
      tracks.map((call) => call.options?.event_id),
      ['cs_test_first', 'cs_test_second'],
    );
  });

  it('sends nothing after an advertising opt-out', async () => {
    hydrateAdvertisingConsent({
      region: 'US',
      choice: 'deny',
      gpc: false,
      allowed: false,
      reason: 'deny',
    });
    await trackVerifiedTikTokPurchase({
      paid: true,
      eventId: 'cs_test_opt_out',
      contentId: 'ebook',
      value: 12,
      currency: 'USD',
      email: 'buyer@example.com',
      phone: '+15551234567',
      externalId: 'user_123',
    });
    assert.equal(tracks.length, 0);
    assert.equal(identifies.length, 0);
  });

  it('sends nothing when Global Privacy Control is on', async () => {
    hydrateAdvertisingConsent({
      region: 'US',
      choice: 'allow',
      gpc: false,
      allowed: true,
      reason: 'allow',
    });
    setNavigator({ globalPrivacyControl: true });
    await trackVerifiedTikTokPurchase({
      paid: true,
      eventId: 'cs_test_gpc',
      contentId: 'ebook',
      value: 12,
      currency: 'USD',
      email: 'buyer@example.com',
    });
    assert.equal(tracks.length, 0);
    assert.equal(identifies.length, 0);
  });

  it('drops a phone number that has no country code', () => {
    assert.equal(normalizePurchasePhone('5551234567'), null);
    assert.equal(phoneForAdvertisingMatch('5551234567'), null);
    assert.equal(phoneForAdvertisingMatch('+1 (555) 123-4567'), '+15551234567');
  });
});
