import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  advertisingChoiceNeedsEuPrompt,
  decideAdvertisingMeasurement,
  isAdConsentCountry,
  isResolvedGeoCountry,
  parseAdChoice,
  parsePrivacyRegion,
  requestHasGpc,
  resolvePrivacyRegion,
  computeAdvertisingPrivacyStateFromParts,
} from './advertisingConsent.ts';

describe('advertising consent decision', () => {
  it('allows ordinary U.S. visitors with no stored choice', () => {
    assert.deepEqual(decideAdvertisingMeasurement({ region: 'US', choice: 'unset', gpc: false }), {
      allowed: true,
      reason: 'us-default',
    });
  });

  it('suppresses U.S. advertising after opt-out', () => {
    assert.deepEqual(decideAdvertisingMeasurement({ region: 'US', choice: 'deny', gpc: false }), {
      allowed: false,
      reason: 'deny',
    });
  });

  it('treats GPC as opt-out even if a prior allow exists', () => {
    assert.deepEqual(decideAdvertisingMeasurement({ region: 'US', choice: 'allow', gpc: true }), {
      allowed: false,
      reason: 'gpc',
    });
  });

  it('does not treat U.S. unset as EU consent', () => {
    const us = decideAdvertisingMeasurement({ region: 'US', choice: 'unset', gpc: false });
    const eu = decideAdvertisingMeasurement({ region: 'EU', choice: 'unset', gpc: false });
    assert.equal(us.allowed, true);
    assert.equal(eu.allowed, false);
    assert.equal(eu.reason, 'eu-unset');
  });

  it('keeps EU advertising off until explicit allow', () => {
    assert.equal(
      decideAdvertisingMeasurement({ region: 'EU', choice: 'unset', gpc: false }).allowed,
      false,
    );
    assert.equal(
      decideAdvertisingMeasurement({ region: 'EU', choice: 'deny', gpc: false }).allowed,
      false,
    );
    assert.deepEqual(decideAdvertisingMeasurement({ region: 'EU', choice: 'allow', gpc: false }), {
      allowed: true,
      reason: 'allow',
    });
  });

  it('shows an EU prompt only before an explicit choice and without GPC', () => {
    assert.equal(
      advertisingChoiceNeedsEuPrompt({
        region: 'EU',
        choice: 'unset',
        gpc: false,
        allowed: false,
        reason: 'eu-unset',
      }),
      true,
    );
    assert.equal(
      advertisingChoiceNeedsEuPrompt({
        region: 'EU',
        choice: 'allow',
        gpc: false,
        allowed: true,
        reason: 'allow',
      }),
      false,
    );
    assert.equal(
      advertisingChoiceNeedsEuPrompt({
        region: 'US',
        choice: 'unset',
        gpc: false,
        allowed: true,
        reason: 'us-default',
      }),
      false,
    );
  });
});

describe('privacy region fail-safe', () => {
  it('requires consent for EU, UK, and Switzerland', () => {
    assert.equal(isAdConsentCountry('DE'), true);
    assert.equal(isAdConsentCountry('GB'), true);
    assert.equal(isAdConsentCountry('CH'), true);
    assert.equal(isAdConsentCountry('DK'), true);
    assert.equal(isAdConsentCountry('US'), false);
    assert.equal(isAdConsentCountry('CA'), false);
    assert.equal(isAdConsentCountry(null), false);
  });

  it('uses missing geo as US so U.S. visitors do not get the EU prompt', () => {
    assert.equal(resolvePrivacyRegion({ geoCountry: null, existingRegion: null }), 'US');
    assert.equal(resolvePrivacyRegion({ geoCountry: '', existingRegion: 'US' }), 'US');
  });

  it('keeps an identified EU visitor as EU if later geo is missing', () => {
    assert.equal(resolvePrivacyRegion({ geoCountry: null, existingRegion: 'EU' }), 'EU');
  });

  it('updates to US when geo positively identifies a non-consent country', () => {
    assert.equal(resolvePrivacyRegion({ geoCountry: 'US', existingRegion: 'EU' }), 'US');
    assert.equal(resolvePrivacyRegion({ geoCountry: 'CA', existingRegion: null }), 'US');
  });

  it('updates to EU when geo positively identifies a consent country', () => {
    assert.equal(resolvePrivacyRegion({ geoCountry: 'FR', existingRegion: 'US' }), 'EU');
  });
});

describe('server-side GPC header', () => {
  it('treats Sec-GPC value 1 as enabled and ignores other values', () => {
    assert.equal(requestHasGpc('1'), true);
    assert.equal(requestHasGpc(' 1 '), true);
    assert.equal(requestHasGpc(null), false);
    assert.equal(requestHasGpc(''), false);
    assert.equal(requestHasGpc('0'), false);
    assert.equal(requestHasGpc('true'), false);
  });

  it('suppresses advertising for a U.S. request that arrives with Sec-GPC', () => {
    const state = computeAdvertisingPrivacyStateFromParts({
      geoCountry: 'US',
      secGpc: '1',
    });
    assert.equal(state.gpc, true);
    assert.equal(state.allowed, false);
    assert.equal(state.reason, 'gpc');
    assert.equal(state.choice, 'deny');
  });
});

describe('unresolved geography', () => {
  it('does not treat missing or placeholder codes as a known country', () => {
    assert.equal(isResolvedGeoCountry(null), false);
    assert.equal(isResolvedGeoCountry(''), false);
    assert.equal(isResolvedGeoCountry('XX'), false);
    assert.equal(isResolvedGeoCountry('ZZ'), false);
    assert.equal(isResolvedGeoCountry('USA'), false);
    assert.equal(isResolvedGeoCountry('US'), true);
    assert.equal(isResolvedGeoCountry('DE'), true);
  });

  it('does not let placeholder geo override a remembered EU visitor', () => {
    assert.equal(resolvePrivacyRegion({ geoCountry: 'XX', existingRegion: 'EU' }), 'EU');
    assert.equal(resolvePrivacyRegion({ geoCountry: 'ZZ', existingRegion: 'EU' }), 'EU');
    assert.equal(resolvePrivacyRegion({ geoCountry: '', existingRegion: 'EU' }), 'EU');
  });

  it('still uses U.S. default for unresolved geo with no EU memory', () => {
    assert.equal(resolvePrivacyRegion({ geoCountry: 'XX', existingRegion: null }), 'US');
    assert.equal(resolvePrivacyRegion({ geoCountry: null, existingRegion: null }), 'US');
  });
});

describe('cookie value parsing', () => {
  it('parses region and choice without treating absence as EU allow', () => {
    assert.equal(parsePrivacyRegion('eu'), 'EU');
    assert.equal(parsePrivacyRegion('nope'), null);
    assert.equal(parseAdChoice(undefined), 'unset');
    assert.equal(parseAdChoice('deny'), 'deny');
    assert.equal(parseAdChoice('allow'), 'allow');
  });
});
