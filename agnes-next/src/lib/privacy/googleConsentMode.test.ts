import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GOOGLE_CONSENT_MODE_PARAMS,
  buildGoogleConsentDefaultScript,
  googleConsentModeState,
  scriptContainsGoogleNetworkRequest,
} from './googleConsentMode.ts';
import { applyGoogleConsentDefault, applyGoogleConsentUpdate } from './googleConsentModeClient.ts';
import { decideAdvertisingMeasurement } from './advertisingConsent.ts';

function installWindow() {
  const dataLayer: unknown[] = [];
  const win = {
    dataLayer,
    gtag: undefined as undefined | ((...args: unknown[]) => void),
  };
  (globalThis as { window?: typeof win }).window = win;
  return win;
}

describe('Google Consent Mode v2 state', () => {
  it('maps allowed advertising to granted for all four parameters', () => {
    const usDefault = decideAdvertisingMeasurement({
      region: 'US',
      choice: 'unset',
      gpc: false,
    });
    assert.equal(usDefault.allowed, true);
    assert.deepEqual(googleConsentModeState(usDefault.allowed), {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted',
    });
  });

  it('maps opt-out, GPC, and EU unset to denied for all four parameters', () => {
    const deniedCases = [
      decideAdvertisingMeasurement({ region: 'US', choice: 'deny', gpc: false }),
      decideAdvertisingMeasurement({ region: 'US', choice: 'allow', gpc: true }),
      decideAdvertisingMeasurement({ region: 'EU', choice: 'unset', gpc: false }),
      decideAdvertisingMeasurement({ region: 'EU', choice: 'deny', gpc: false }),
    ];
    for (const decision of deniedCases) {
      assert.equal(decision.allowed, false);
      const state = googleConsentModeState(decision.allowed);
      for (const param of GOOGLE_CONSENT_MODE_PARAMS) {
        assert.equal(state[param], 'denied', param);
      }
    }
  });

  it('maps EU allow to granted without changing the decision engine', () => {
    const euAllow = decideAdvertisingMeasurement({
      region: 'EU',
      choice: 'allow',
      gpc: false,
    });
    assert.equal(euAllow.allowed, true);
    assert.equal(googleConsentModeState(true).ad_user_data, 'granted');
  });
});

describe('Google Consent Mode bootstrap script', () => {
  it('sets consent default before any Google network URL', () => {
    const script = buildGoogleConsentDefaultScript(true);
    assert.match(script, /gtag\('consent','default'/);
    assert.match(script, /"ad_storage":"granted"/);
    assert.match(script, /"ad_user_data":"granted"/);
    assert.match(script, /"ad_personalization":"granted"/);
    assert.match(script, /"analytics_storage":"granted"/);
    assert.equal(scriptContainsGoogleNetworkRequest(script), false);
    assert.doesNotMatch(script, /gtag\('config'/);
    assert.doesNotMatch(script, /gtm\.js/);
  });

  it('emits denied defaults without loading GTM or gtag.js', () => {
    const script = buildGoogleConsentDefaultScript(false);
    assert.match(script, /"ad_storage":"denied"/);
    assert.match(script, /"ad_user_data":"denied"/);
    assert.match(script, /"ad_personalization":"denied"/);
    assert.match(script, /"analytics_storage":"denied"/);
    assert.equal(scriptContainsGoogleNetworkRequest(script), false);
  });
});

describe('Google Consent Mode client queue', () => {
  it('records default then update on the local dataLayer without network helpers', () => {
    const win = installWindow();
    applyGoogleConsentDefault(false);
    applyGoogleConsentUpdate(true);
    applyGoogleConsentUpdate(false);
    const commands = win.dataLayer.map((entry) => Array.from(entry as unknown[]));
    assert.deepEqual(commands[0][0], 'consent');
    assert.deepEqual(commands[0][1], 'default');
    assert.deepEqual(commands[0][2], googleConsentModeState(false));
    assert.deepEqual(commands[1][1], 'update');
    assert.deepEqual(commands[1][2], googleConsentModeState(true));
    assert.deepEqual(commands[2][2], googleConsentModeState(false));
  });
});
