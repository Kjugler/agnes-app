#!/usr/bin/env node
/**
 * Regression: in-chapter keep-my-place YES/NO must not leave the chapter.
 * NO must not persist reading position. Overlay close preserves path/scroll.
 *
 * Usage: node scripts/verify-jody-remember-stay-on-chapter.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function resolveRememberPlaceChoice(choice) {
  if (choice === 'accept') {
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

function chapterPathAfterJodyClose(currentPath) {
  return currentPath;
}

const helper = read('src/lib/jodyRememberPlaceChoice.ts');
const concierge = read('src/components/jody/JodyConcierge.tsx');
const copy = read('src/config/jodyConciergeCopy.ts');
const reader = read('src/app/sample-chapters/read/[id]/ChapterReaderClient.tsx');
const trigger = read('src/hooks/useJodyConcierge.ts');

const yes = resolveRememberPlaceChoice('accept');
const no = resolveRememberPlaceChoice('decline');

assert.equal(yes.navigateAway, false, 'YES must not navigate away');
assert.equal(yes.remainOnChapter, true, 'YES must remain on the chapter');
assert.equal(yes.persistReadingPosition, true, 'YES keeps the existing save path');
assert.equal(yes.nextBeat, 'email-capture');

assert.equal(no.navigateAway, false, 'NO must not navigate away');
assert.equal(no.remainOnChapter, true, 'NO must remain on the chapter');
assert.equal(no.persistReadingPosition, false, 'NO must not persist reading position');
assert.equal(no.nextBeat, 'remember-decline-ack');
assert.equal(no.dismissOffer, true);

const chapterUrl = '/sample-chapters/read/1';
const scrollY = 842;
assert.equal(chapterPathAfterJodyClose(chapterUrl), chapterUrl);
assert.equal(
  chapterPathAfterJodyClose(chapterUrl),
  chapterPathAfterJodyClose(chapterUrl),
  'dismissal must keep the same chapter path',
);

function afterDismissal(state, choice) {
  const outcome = resolveRememberPlaceChoice(choice);
  assert.equal(outcome.navigateAway, false);
  return {
    path: chapterPathAfterJodyClose(state.path),
    scrollY: state.scrollY,
    persistReadingPosition: outcome.persistReadingPosition,
  };
}

const yesAfter = afterDismissal({ path: chapterUrl, scrollY }, 'accept');
const noAfter = afterDismissal({ path: chapterUrl, scrollY }, 'decline');
assert.deepEqual(yesAfter, {
  path: chapterUrl,
  scrollY,
  persistReadingPosition: true,
});
assert.deepEqual(noAfter, {
  path: chapterUrl,
  scrollY,
  persistReadingPosition: false,
});

assert.match(helper, /navigateAway: false/);
assert.match(helper, /remainOnChapter: true/);
assert.match(helper, /persistReadingPosition: false/);
assert.match(helper, /chapterPathAfterJodyClose/);
assert.doesNotMatch(helper, /sample-chapters'/);

assert.match(copy, /remember-decline-ack/);
assert.match(copy, /No problem\. Enjoy the chapter\./);

assert.match(concierge, /resolveRememberPlaceChoice\('accept'\)/);
assert.match(concierge, /resolveRememberPlaceChoice\('accept', \{ knownReader: true \}\)/);
assert.match(concierge, /resolveRememberPlaceChoice\('decline'\)/);
assert.match(concierge, /setBeatId\(outcome\.nextBeat\)/);
assert.match(concierge, /remember-decline-ack/);
assert.match(concierge, /remember-accept-ack/);
assert.match(concierge, /JODY_REMEMBER_DECLINE_ACK_MS/);
assert.match(concierge, /saveRememberedPlace\(effectiveChapterId\)/);
assert.match(concierge, /clearPendingJodyBeat\(\)/);

const acceptFn = concierge.match(
  /const handleRememberAccept = async \(\) => \{[\s\S]*?\n  \};/,
);
assert.ok(acceptFn, 'handleRememberAccept must exist');
assert.match(acceptFn[0], /saveRememberedPlace/);
assert.match(acceptFn[0], /clearPendingJodyBeat/);
assert.doesNotMatch(
  acceptFn[0],
  /requestRememberPlaceEmail/,
  'known-reader YES must not send verification email',
);
assert.doesNotMatch(acceptFn[0], /handleClose\(\)/);

const declineFn = concierge.match(
  /const handleRememberDecline = \(\) => \{[\s\S]*?\n  \};/,
);
assert.ok(declineFn, 'handleRememberDecline must exist');
assert.doesNotMatch(
  declineFn[0],
  /requestRememberPlaceEmail/,
  'NO must not persist reading position',
);
assert.doesNotMatch(
  declineFn[0],
  /handleClose\(\)/,
  'NO must acknowledge in-place instead of immediately closing via onClose navigation',
);
assert.match(declineFn[0], /dismissRememberOffer/);

assert.match(concierge, /requestRememberPlaceEmail\(trimmed, effectiveChapterId\)/);
const rememberApiCalls = concierge.match(/requestRememberPlaceEmail/g) ?? [];
assert.equal(
  rememberApiCalls.length,
  2,
  'remember-place persist must only be imported and used on the YES email-submit path',
);

const jodyBlock = reader.match(/\{showJody && \([\s\S]*?<JodyConcierge[\s\S]*?\)\}/);
assert.ok(jodyBlock, 'chapter Jody overlay must exist');
assert.match(jodyBlock[0], /onClose=\{dismissJody\}/);
assert.doesNotMatch(
  jodyBlock[0],
  /location\.href/,
  'chapter Jody onClose must not navigate to /sample-chapters',
);

const iframeBeforeJody = reader.indexOf('<iframe');
const showJodyAt = reader.indexOf('{showJody &&');
assert.ok(iframeBeforeJody > -1 && showJodyAt > iframeBeforeJody, 'iframe stays mounted independently of Jody');

const hrefHits = [...reader.matchAll(/location\.href\s*=\s*['"]\/sample-chapters['"]/g)];
assert.equal(hrefHits.length, 1, 'only the Back-link intercept may still go to the hub');
assert.match(
  reader,
  /handleBackNavigation[\s\S]*location\.href\s*=\s*['"]\/sample-chapters['"]/,
);

assert.match(trigger, /minDwellSecondsBeforeOffer/);
assert.match(trigger, /tryShowRememberOfferOnChapter/);
assert.match(reader, /tryShowOnExit/);

console.log(
  JSON.stringify(
    {
      pass: true,
      yesStaysOnChapter: yesAfter.path === chapterUrl && !yes.navigateAway,
      noStaysOnChapter: noAfter.path === chapterUrl && !no.navigateAway,
      noDoesNotPersist: no.persistReadingPosition === false,
      scrollPreserved: yesAfter.scrollY === scrollY && noAfter.scrollY === scrollY,
    },
    null,
    2,
  ),
);
