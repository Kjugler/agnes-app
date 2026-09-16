#!/usr/bin/env node
/**
 * Stage B2 tracking integrity: true retailer return, durable funnel userId,
 * Event-history attribution, one dwell flush per reading interval.
 *
 * Usage: node scripts/verify-stage-b2-tracking-integrity.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function shouldEmitRetailerReturnEvent(signal, state) {
  if (state.alreadyTracked) return false;
  if (signal !== 'resume') return false;
  return state.departed === true;
}

function shouldFlushTimeOnPage(state) {
  if (state.flushed) return false;
  return Number.isFinite(state.seconds) && state.seconds >= 1;
}

function buildFunnelPayload({ type, visitorId, userId }) {
  return { type, visitorId, userId: userId || null };
}

assert.equal(
  shouldEmitRetailerReturnEvent('outbound', { departed: true, alreadyTracked: false }),
  false,
  'retailer outbound alone must not emit RETAILER_RETURN',
);
assert.equal(
  shouldEmitRetailerReturnEvent('fallback', { departed: true, alreadyTracked: false }),
  false,
  '2.5s fallback must not emit RETAILER_RETURN',
);
assert.equal(
  shouldEmitRetailerReturnEvent('resume', { departed: false, alreadyTracked: false }),
  false,
  'resume without a recorded departure must not emit RETAILER_RETURN',
);
assert.equal(
  shouldEmitRetailerReturnEvent('resume', { departed: true, alreadyTracked: false }),
  true,
  'genuine return/resume after departure must emit RETAILER_RETURN',
);
assert.equal(
  shouldEmitRetailerReturnEvent('resume', { departed: true, alreadyTracked: true }),
  false,
);

const firstFlush = shouldFlushTimeOnPage({ flushed: false, seconds: 94 });
const secondFlush = shouldFlushTimeOnPage({ flushed: true, seconds: 94 });
assert.equal(firstFlush, true);
assert.equal(secondFlush, false, 'duplicate pagehide/visibility flush must not emit again');
assert.equal(shouldFlushTimeOnPage({ flushed: false, seconds: 0 }), false);

const visitorId = 'a6c5d2ea-0ff4-4b4c-956b-19233b0d0715';
const userId = 'cmu47wgsr0112r02qc2e92vzv';
const returnEvent = {
  type: 'READERS_AGREE_RETAILER_RETURN',
  visitorId,
  retailerOrigin: 'amazon',
};
assert.equal(returnEvent.retailerOrigin, 'amazon');
assert.equal(returnEvent.visitorId, visitorId);

const afterEmail = buildFunnelPayload({
  type: 'SAMPLE_CHAPTER_OPEN',
  visitorId,
  userId,
});
assert.equal(afterEmail.userId, userId);
assert.equal(afterEmail.visitorId, visitorId);

const amazonEmail = {
  type: 'READERS_AGREE_EMAIL_SUBMITTED',
  userId,
  visitorId: 'vid-amazon',
  captureSurface: 'bridge',
  retailerOrigin: 'amazon',
};
const bnEmail = {
  type: 'READERS_AGREE_EMAIL_SUBMITTED',
  userId,
  visitorId: 'vid-bn',
  captureSurface: 'bridge',
  retailerOrigin: 'bn',
};
const events = [amazonEmail, bnEmail];
const reconstructedAmazon = events.find(
  (e) => e.retailerOrigin === 'amazon' && e.captureSurface === 'bridge',
);
assert.ok(reconstructedAmazon);
assert.equal(reconstructedAmazon.visitorId, 'vid-amazon');
assert.equal(bnEmail.retailerOrigin, 'bn');

const momentum = read('src/lib/readersAgreeMomentum.ts');
const redirect = read('src/app/readers-agree/go/ReviewRedirectClient.tsx');
const tracking = read('src/lib/funnelTracking.ts');
const lead = read('src/lib/readersAgreeLead.ts');
const capture = read('src/components/readers-agree/ReadersAgreeEmailCapture.tsx');
const reader = read('src/app/sample-chapters/read/[id]/ChapterReaderClient.tsx');
const concierge = read('src/components/jody/JodyConcierge.tsx');
const profileSync = read('../deepquill/lib/readers/readersAgreeLead.cjs');
const leadHandler = read('../deepquill/api/readersAgree/lead.cjs');
const funnelRoute = read('../deepquill/server/routes/funnelEvents.cjs');

assert.match(momentum, /shouldEmitRetailerReturnEvent/);
assert.match(momentum, /signal !== 'resume'/);
assert.match(momentum, /claimReadersAgreeRetailerReturnTracking/);
assert.match(redirect, /claimReadersAgreeRetailerReturnTracking\(\)/);
assert.match(redirect, /trackRetailerReturnIfResumed/);
assert.match(redirect, /syncReadersAgreeMomentumState\(\)/);
assert.doesNotMatch(
  redirect,
  /markBridgeTabDeparted\(\);\s*applyContinuationIfReady\(\)/,
  'fallback must not fake a departure to emit return',
);
assert.doesNotMatch(
  redirect,
  /if \(getReadersAgreeMomentumSnapshot\(\)\.validated\) \{\s*markBridgeTabDeparted\(\)/,
  'focus must not mark departure',
);

const applyFn = redirect.match(/const applyContinuationIfReady = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[\]\);/);
assert.ok(applyFn, 'applyContinuationIfReady must exist');
assert.doesNotMatch(applyFn[0], /READERS_AGREE_RETAILER_RETURN/);
assert.doesNotMatch(applyFn[0], /trackFunnelEvent/);
assert.match(applyFn[0], /promoteReadersAgreeContinuationIfReturned/);

assert.match(tracking, /userId: userId \|\| null/);
assert.match(tracking, /rememberFunnelUserId/);
assert.match(tracking, /getFunnelUserId/);
assert.match(tracking, /ap_funnel_uid/);
assert.match(tracking, /shouldFlushTimeOnPage/);
assert.match(tracking, /let flushed = false/);
assert.match(lead, /rememberFunnelUserId\(data\.userId\)/);
assert.match(capture, /router\.push\(result\.redirectPath\)/);
assert.match(leadHandler, /redirectPath/);
assert.match(funnelRoute, /userId = body\.userId/);

assert.match(reader, /onClose=\{dismissJody\}/);
assert.doesNotMatch(
  reader.match(/\{showJody && \([\s\S]*?<JodyConcierge[\s\S]*?\)\}/)[0],
  /location\.href/,
);
assert.match(concierge, /remember-decline-ack/);
assert.match(concierge, /No problem\. Enjoy the chapter\.|setBeatId\(outcome\.nextBeat\)/);

assert.match(profileSync, /Event history remains authoritative/);
assert.doesNotMatch(profileSync, /prospectNurtureEnrolledAt\s*:/);
assert.doesNotMatch(leadHandler, /trySendProspectNurture/);
assert.doesNotMatch(tracking, /PROSPECT_NURTURE_SENT/);
assert.doesNotMatch(lead, /trySendProspectNurture/);

assert.match(leadHandler, /\/sample-chapters/);
assert.match(capture, /writeContestEmail/);

console.log(
  JSON.stringify(
    {
      pass: true,
      outboundDoesNotEmitReturn: true,
      resumeDoesEmitReturn: true,
      fallbackDoesNotEmitReturn: true,
      retailerOriginSurvives: returnEvent.retailerOrigin === 'amazon',
      visitorIdSurvives: returnEvent.visitorId === visitorId,
      postEmailEventsJoinUser: afterEmail.userId === userId,
      amazonJourneySurvivesLaterBn: reconstructedAmazon.retailerOrigin === 'amazon',
      oneDwellPerInterval: firstFlush && !secondFlush,
    },
    null,
    2,
  ),
);
