#!/usr/bin/env node
/**
 * Known-reader remember-place: skip email when a server-validated session exists.
 * Anonymous YES still uses verification email. NO stays on chapter.
 * Hub does not re-show the same unresolved remember offer after YES/NO.
 *
 * Usage: node scripts/verify-jody-known-reader-remember.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function normalizeIdentityUserId(raw) {
  const id = String(raw || '').trim().slice(0, 64);
  return id || null;
}

function resolveJodyRememberUserId(input) {
  void input.funnelUserId;
  return (
    normalizeIdentityUserId(input.contestUserId) ||
    normalizeIdentityUserId(input.readersAgreeLeadUserId) ||
    null
  );
}

function resolveRememberPlaceChoice(choice, opts) {
  if (choice === 'accept') {
    if (opts?.knownReader) {
      return {
        persistReadingPosition: true,
        navigateAway: false,
        remainOnChapter: true,
        nextBeat: 'remember-accept-ack',
        dismissOffer: true,
      };
    }
    return {
      persistReadingPosition: true,
      navigateAway: false,
      remainOnChapter: true,
      nextBeat: 'email-capture',
      dismissOffer: false,
    };
  }
  return {
    persistReadingPosition: false,
    navigateAway: false,
    remainOnChapter: true,
    nextBeat: 'remember-decline-ack',
    dismissOffer: true,
  };
}

function shouldShowHubRememberOffer({ pendingBeat, rememberDismissed }) {
  return pendingBeat === 'remember-offer' && !rememberDismissed;
}

const knownYes = resolveRememberPlaceChoice('accept', { knownReader: true });
assert.equal(knownYes.nextBeat, 'remember-accept-ack');
assert.equal(knownYes.remainOnChapter, true);
assert.equal(knownYes.navigateAway, false);
assert.equal(knownYes.persistReadingPosition, true);
assert.equal(knownYes.dismissOffer, true);

const anonYes = resolveRememberPlaceChoice('accept');
assert.equal(anonYes.nextBeat, 'email-capture');
assert.equal(anonYes.remainOnChapter, true);
assert.equal(anonYes.navigateAway, false);

const no = resolveRememberPlaceChoice('decline');
assert.equal(no.nextBeat, 'remember-decline-ack');
assert.equal(no.remainOnChapter, true);
assert.equal(no.persistReadingPosition, false);

const leadId = 'cmu4bkey7001xp42q8ayprr6x';
assert.equal(
  resolveJodyRememberUserId({
    contestUserId: null,
    readersAgreeLeadUserId: leadId,
    funnelUserId: 'forged-funnel-uid',
  }),
  leadId,
);
assert.equal(
  resolveJodyRememberUserId({
    contestUserId: 'contest-user',
    readersAgreeLeadUserId: leadId,
    funnelUserId: 'forged-funnel-uid',
  }),
  'contest-user',
);
assert.equal(
  resolveJodyRememberUserId({
    contestUserId: null,
    readersAgreeLeadUserId: null,
    funnelUserId: 'forged-funnel-uid',
  }),
  null,
);

assert.equal(
  shouldShowHubRememberOffer({ pendingBeat: 'remember-offer', rememberDismissed: false }),
  true,
);
assert.equal(
  shouldShowHubRememberOffer({ pendingBeat: null, rememberDismissed: false }),
  false,
  'YES/NO must clear pending beat so the hub does not re-prompt',
);
assert.equal(
  shouldShowHubRememberOffer({ pendingBeat: 'remember-offer', rememberDismissed: true }),
  false,
);

const identity = read('src/lib/jodyRememberIdentity.ts');
const choice = read('src/lib/jodyRememberPlaceChoice.ts');
const copy = read('src/config/jodyConciergeCopy.ts');
const concierge = read('src/components/jody/JodyConcierge.tsx');
const api = read('src/lib/jodyConciergeApi.ts');
const saveRoute = read('src/app/api/jody/remember/save/route.ts');
const leadRoute = read('src/app/api/readers-agree/lead/route.ts');
const hubHook = read('src/hooks/useJodyConcierge.ts');
const reader = read('src/app/sample-chapters/read/[id]/ChapterReaderClient.tsx');
const saveHandler = read('../deepquill/api/jody/rememberSave.cjs');
const requestHandler = read('../deepquill/api/jody/rememberRequest.cjs');
const server = read('../deepquill/server/index.cjs');

assert.match(identity, /ap_ra_lead_uid/);
assert.match(identity, /funnelUserId/);
assert.match(identity, /void input\.funnelUserId/);
assert.match(leadRoute, /READERS_AGREE_LEAD_UID_COOKIE/);
assert.doesNotMatch(leadRoute, /contest_user_id/);

assert.match(saveRoute, /resolveJodyRememberUserId/);
assert.match(saveRoute, /ap_funnel_uid/);
assert.match(saveRoute, /funnelUserId: cookieStore\.get\('ap_funnel_uid'\)/);
assert.match(saveRoute, /JODY_IDENTITY_HEADER/);
assert.doesNotMatch(saveRoute, /body\.userId/);

assert.match(saveHandler, /x-jody-identity-user-id/);
assert.match(saveHandler, /user_id_not_accepted/);
assert.match(saveHandler, /saveJodyReadingProgress/);
assert.doesNotMatch(saveHandler, /sendEmail/);
assert.doesNotMatch(saveHandler, /buildRememberPlaceEmail/);
assert.doesNotMatch(saveHandler, /ap_funnel_uid/);
assert.match(server, /\/api\/jody\/remember\/save/);

assert.match(requestHandler, /buildRememberPlaceEmail/);
assert.match(choice, /remember-accept-ack/);
assert.match(copy, /Got it\. I'll remember your place\. Enjoy the chapter\./);
assert.match(copy, /No problem\. Enjoy the chapter\./);

assert.match(api, /saveRememberedPlace/);
assert.match(api, /\/api\/jody\/remember\/save/);
assert.match(concierge, /saveRememberedPlace\(effectiveChapterId\)/);
assert.match(concierge, /requestRememberPlaceEmail\(trimmed, effectiveChapterId\)/);
assert.match(concierge, /clearPendingJodyBeat\(\)/);
assert.match(concierge, /knownReader: true/);

const acceptFn = concierge.match(/const handleRememberAccept = async \(\) => \{[\s\S]*?\n  \};/);
assert.ok(acceptFn);
assert.doesNotMatch(acceptFn[0], /requestRememberPlaceEmail/);
assert.match(acceptFn[0], /clearPendingJodyBeat/);

const declineFn = concierge.match(/const handleRememberDecline = \(\) => \{[\s\S]*?\n  \};/);
assert.ok(declineFn);
assert.match(declineFn[0], /clearPendingJodyBeat/);
assert.doesNotMatch(declineFn[0], /saveRememberedPlace/);
assert.doesNotMatch(declineFn[0], /requestRememberPlaceEmail/);

assert.match(hubHook, /consumePendingJodyBeat/);
assert.match(hubHook, /pending === 'remember-offer'/);
assert.match(reader, /onClose=\{dismissJody\}/);

console.log(
  JSON.stringify(
    {
      pass: true,
      knownReaderYesSkipsEmail: knownYes.nextBeat === 'remember-accept-ack',
      anonymousYesKeepsEmail: anonYes.nextBeat === 'email-capture',
      noStaysOnChapter: no.remainOnChapter && !no.persistReadingPosition,
      funnelUidNeverAuthorizes: resolveJodyRememberUserId({
        contestUserId: null,
        readersAgreeLeadUserId: null,
        funnelUserId: 'forged',
      }) === null,
      hubSuppressedAfterChoice: !shouldShowHubRememberOffer({
        pendingBeat: null,
        rememberDismissed: false,
      }),
    },
    null,
    2,
  ),
);
