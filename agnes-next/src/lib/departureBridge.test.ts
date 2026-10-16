import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasMeaningfulEngagement,
  isDeparturePage,
  isProtectedDeparturePath,
  isTopEdgeExit,
  readDepartureMemory,
  shouldOfferDeparture,
} from './departureBridge.ts';

const ready = {
  pathname: '/sample-chapters',
  desktop: true,
  elapsedMs: 20_000,
  scrolled: true,
  interacted: false,
  exitIntent: true,
  memory: null as const,
  decided: false,
  jodyActive: false,
};

describe('departure bridge', () => {
  it('offers after engagement and a top-edge exit on the sample hub', () => {
    assert.deepEqual(shouldOfferDeparture(ready), { offer: true, reason: 'exit_intent' });
  });

  it('does not offer immediately or without engagement', () => {
    assert.equal(shouldOfferDeparture({ ...ready, elapsedMs: 1000, exitIntent: true }).reason, 'not_engaged');
    assert.equal(hasMeaningfulEngagement({ elapsedMs: 20_000, scrolled: false, interacted: false }), false);
    assert.equal(shouldOfferDeparture({ ...ready, exitIntent: false }).reason, 'not_exit');
  });

  it('treats only a top-edge leave as exit intent', () => {
    assert.equal(isTopEdgeExit({ clientY: 2, relatedTarget: null }), true);
    assert.equal(isTopEdgeExit({ clientY: 40, relatedTarget: null }), false);
    assert.equal(isTopEdgeExit({ clientY: 0, relatedTarget: {} }), false);
  });

  it('uses the footer on mobile and stays off checkout, chapter reading, and retailer links', () => {
    assert.equal(shouldOfferDeparture({ ...ready, desktop: false }).reason, 'mobile_footer_fallback');
    assert.equal(isProtectedDeparturePath('/checkout'), true);
    assert.equal(isProtectedDeparturePath('/sample-chapters/read/1'), true);
    assert.equal(isProtectedDeparturePath('/readers-agree/go'), true);
    assert.equal(shouldOfferDeparture({ ...ready, pathname: '/checkout' }).reason, 'excluded_path');
    assert.equal(shouldOfferDeparture({ ...ready, pathname: '/sample-chapters/read/2' }).reason, 'excluded_path');
    assert.equal(isDeparturePage('/contest'), true);
    assert.equal(shouldOfferDeparture({ ...ready, pathname: '/contest' }).offer, true);
  });

  it('stays quiet for Jody, a prior decision, and a stored dismissal', () => {
    assert.equal(shouldOfferDeparture({ ...ready, jodyActive: true }).reason, 'jody_active');
    assert.equal(shouldOfferDeparture({ ...ready, decided: true }).reason, 'already_decided');
    assert.equal(shouldOfferDeparture({ ...ready, memory: 'dismissed' }).reason, 'already_seen');
    assert.equal(readDepartureMemory('accepted'), 'accepted');
    assert.equal(readDepartureMemory('nope'), null);
  });
});
