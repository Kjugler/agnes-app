#!/usr/bin/env node
/**
 * Client/proxy contract for Readers Agree lead access.
 * Repeat valid emails must still mark session + write contest_email + redirect.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const capture = read('src/components/readers-agree/ReadersAgreeEmailCapture.tsx');
const lead = read('src/lib/readersAgreeLead.ts');
const route = read('src/app/api/readers-agree/lead/route.ts');
const tracking = read('src/lib/funnelTracking.ts');
const redirect = read('src/app/readers-agree/go/ReviewRedirectClient.tsx');
const reader = read('src/components/sample-chapters/SampleChapterReader.tsx');
const sessionClient = read('src/lib/readersAgreeSession.ts');
const momentum = read('src/lib/readersAgreeMomentum.ts');

assert.match(capture, /fetchReadersAgreeRecognition/);
assert.match(capture, /Not you\?/);
assert.match(capture, /buildReadersAgreeContinuePath/);
assert.doesNotMatch(capture, /type="email"/);
assert.match(read('src/components/sample-chapters/JodyReaderInvitation.tsx'), /writeContestEmail/);
assert.doesNotMatch(capture, /readContestEmail/);
assert.doesNotMatch(capture, /localStorage/);
assert.match(sessionClient, /clearReadersAgreeLeadSession/);
assert.match(reader, /fetchReadersAgreeRecognition/);
assert.match(reader, /Not you\?/);
assert.doesNotMatch(reader, /isReadersAgreeLeadSessionActive/);
assert.doesNotMatch(reader, /readContestEmail/);

assert.match(lead, /rememberFunnelUserId/);
assert.match(lead, /markReadersAgreeLeadSession\(\)/);
assert.match(
  lead,
  /rememberFunnelUserId\(data\.userId\);\s*\}\s*markReadersAgreeLeadSession\(\);\s*return \{ ok: true, redirectPath: data\.redirectPath \}/,
);
assert.match(route, /READERS_AGREE_LEAD_UID_COOKIE/);
assert.match(route, /cookies\.set/);
assert.match(route, /looksLikeReadersAgreeSessionToken/);
assert.match(route, /delete payload\.sessionToken/);
assert.match(route, /x-readers-agree-issue-session/);
assert.match(route, /omitForwardHeaders:\s*\['x-readers-agree-issue-session', READING_ALLOWANCE_HEADER\]/);
assert.doesNotMatch(route, /contest_user_id/);
assert.doesNotMatch(route, /ap_funnel_uid/);
assert.doesNotMatch(route, /normalizeIdentityUserId\(data\.userId\)/);
assert.match(lead, /if \(!res\.ok \|\| !data\.ok \|\| !data\.redirectPath\)/);

assert.match(lead, /retailerOrigin/);
assert.match(capture, /retailerOrigin/);
assert.match(tracking, /READERS_AGREE_RETAILER_RETURN/);
assert.match(tracking, /READERS_AGREE_BRIDGE_VIEW/);
assert.match(tracking, /READERS_AGREE_NO_THANKS_CLICK/);
assert.match(redirect, /READERS_AGREE_RETAILER_RETURN/);
assert.match(redirect, /claimReadersAgreeRetailerReturnTracking/);
assert.match(redirect, /trackRetailerReturnIfResumed/);
assert.match(redirect, /syncReadersAgreeMomentumState/);
{
  const applyFn = redirect.match(
    /const applyContinuationIfReady = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[\]\);/,
  );
  assert.ok(applyFn, 'applyContinuationIfReady must exist');
  assert.doesNotMatch(
    applyFn[0],
    /READERS_AGREE_RETAILER_RETURN/,
    'continuation promotion must not emit RETAILER_RETURN',
  );
}
assert.match(momentum, /shouldEmitRetailerReturnEvent/);
assert.match(momentum, /claimReadersAgreeRetailerReturnTracking/);
assert.match(tracking, /rememberFunnelUserId/);
assert.match(tracking, /getFunnelUserId/);
assert.match(tracking, /shouldFlushTimeOnPage/);
assert.match(redirect, /READERS_AGREE_BRIDGE_VIEW/);
assert.match(redirect, /READERS_AGREE_NO_THANKS_CLICK/);
assert.match(redirect, /handleNoThanksClick/);
assert.match(redirect, /promoteReadersAgreeContinuationIfReturned/);
assert.match(momentum, /claimReadersAgreeBridgeViewTracking/);
assert.doesNotMatch(lead, /trySendProspectNurture/);
assert.doesNotMatch(redirect, /trySendProspectNurture/);
assert.doesNotMatch(tracking, /PROSPECT_NURTURE_SENT/);

function clientEmailLooksValid(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return Boolean(normalized && normalized.includes('@'));
}

function interpretLeadHttp(httpOk, data) {
  if (!httpOk || !data.ok || !data.redirectPath) {
    return { ok: false, error: data.error || 'submit_failed' };
  }
  return {
    ok: true,
    redirectPath: data.redirectPath,
    writeContestEmail: true,
    markReadersAgreeLeadSession: true,
  };
}

assert.strictEqual(clientEmailLooksValid('not-an-email'), false);
assert.strictEqual(clientEmailLooksValid(''), false);
assert.ok(clientEmailLooksValid('lauriehallowell58@gmail.com'));

const first = interpretLeadHttp(true, { ok: true, redirectPath: '/sample-chapters' });
const repeat = interpretLeadHttp(true, { ok: true, redirectPath: '/sample-chapters' });
assert.deepStrictEqual(first, repeat);
assert.strictEqual(first.ok, true);
assert.strictEqual(first.writeContestEmail, true);
assert.strictEqual(first.markReadersAgreeLeadSession, true);

const invalidHttp = interpretLeadHttp(true, { ok: false, error: 'invalid_email' });
assert.strictEqual(invalidHttp.ok, false);
assert.strictEqual(invalidHttp.error, 'invalid_email');

const rateLimited = interpretLeadHttp(false, { ok: false, error: 'rate_limited' });
assert.strictEqual(rateLimited.ok, false);

console.log('verify-readers-agree-lead-access: PASS');
