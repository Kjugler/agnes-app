#!/usr/bin/env node
/**
 * Stage 2 — Jody's 90-second reader invitation.
 * Active time, page lock, and who may fetch the Chapter 1 file.
 *
 * Usage: node --experimental-strip-types scripts/verify-jody-reader-gate.mjs
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  JODY_READER_GATE_MS,
  activeReadingElapsedMs,
  hasReachedReaderGate,
  isActivelyReading,
  resolveReaderGateThresholdMs,
  syncActiveReadingClock,
} from '../src/lib/activeReadingClock.ts';
import {
  canAdvanceToPage,
  chapterOneDocumentAccess,
} from '../src/lib/chapterOneGate.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const visible = { visibilityState: 'visible', hasFocus: true, viewerVisible: true };
const hiddenTab = { visibilityState: 'hidden', hasFocus: false, viewerVisible: true };
const blurred = { visibilityState: 'visible', hasFocus: false, viewerVisible: true };
const offscreen = { visibilityState: 'visible', hasFocus: true, viewerVisible: false };

let clock = { accumulatedMs: 0, runningSinceMs: null };
clock = syncActiveReadingClock(clock, 0, isActivelyReading(visible));
clock = syncActiveReadingClock(clock, JODY_READER_GATE_MS, isActivelyReading(visible));
assert.equal(activeReadingElapsedMs(clock, JODY_READER_GATE_MS), JODY_READER_GATE_MS);
assert.equal(hasReachedReaderGate(activeReadingElapsedMs(clock, JODY_READER_GATE_MS), JODY_READER_GATE_MS), true);

clock = { accumulatedMs: 0, runningSinceMs: null };
clock = syncActiveReadingClock(clock, 0, isActivelyReading(visible));
clock = syncActiveReadingClock(clock, 89_000, isActivelyReading(visible));
assert.equal(hasReachedReaderGate(activeReadingElapsedMs(clock, 89_000), JODY_READER_GATE_MS), false);

clock = { accumulatedMs: 0, runningSinceMs: null };
clock = syncActiveReadingClock(clock, 0, isActivelyReading(visible));
clock = syncActiveReadingClock(clock, 60_000, isActivelyReading(hiddenTab));
clock = syncActiveReadingClock(clock, 180_000, isActivelyReading(hiddenTab));
clock = syncActiveReadingClock(clock, 180_000, isActivelyReading(visible));
clock = syncActiveReadingClock(clock, 209_000, isActivelyReading(visible));
assert.equal(activeReadingElapsedMs(clock, 209_000), 89_000);
assert.equal(hasReachedReaderGate(activeReadingElapsedMs(clock, 209_000), JODY_READER_GATE_MS), false);
clock = syncActiveReadingClock(clock, 210_000, isActivelyReading(visible));
assert.equal(hasReachedReaderGate(activeReadingElapsedMs(clock, 210_000), JODY_READER_GATE_MS), true);

clock = { accumulatedMs: 0, runningSinceMs: null };
clock = syncActiveReadingClock(clock, 0, isActivelyReading(blurred));
clock = syncActiveReadingClock(clock, 120_000, isActivelyReading(blurred));
assert.equal(activeReadingElapsedMs(clock, 120_000), 0);

clock = { accumulatedMs: 0, runningSinceMs: null };
clock = syncActiveReadingClock(clock, 0, isActivelyReading(offscreen));
clock = syncActiveReadingClock(clock, 120_000, isActivelyReading(offscreen));
assert.equal(activeReadingElapsedMs(clock, 120_000), 0);

assert.equal(resolveReaderGateThresholdMs('production', '3000'), 90_000);
assert.equal(resolveReaderGateThresholdMs('development', '4000'), 4000);
assert.equal(resolveReaderGateThresholdMs('development', '500'), 90_000);
assert.equal(resolveReaderGateThresholdMs('development', undefined), 90_000);

assert.equal(canAdvanceToPage({ targetPage: 4, pageCount: 8, accessEstablished: false, gatePage: null }), true);
assert.equal(canAdvanceToPage({ targetPage: 4, pageCount: 8, accessEstablished: false, gatePage: 3 }), false);
assert.equal(canAdvanceToPage({ targetPage: 3, pageCount: 8, accessEstablished: false, gatePage: 3 }), true);
assert.equal(canAdvanceToPage({ targetPage: 2, pageCount: 8, accessEstablished: false, gatePage: 3 }), true);
assert.equal(canAdvanceToPage({ targetPage: 8, pageCount: 8, accessEstablished: true, gatePage: 3 }), true);
assert.equal(canAdvanceToPage({ targetPage: 0, pageCount: 8, accessEstablished: true, gatePage: null }), false);
assert.equal(canAdvanceToPage({ targetPage: 9, pageCount: 8, accessEstablished: true, gatePage: null }), false);

assert.equal(
  chapterOneDocumentAccess({
    secFetchSite: 'same-origin',
    secFetchMode: 'cors',
    secFetchDest: 'empty',
    wantsAttachment: false,
  }),
  'allow',
);
assert.equal(
  chapterOneDocumentAccess({
    secFetchSite: 'same-origin',
    secFetchMode: 'navigate',
    secFetchDest: 'document',
    wantsAttachment: false,
  }),
  'allow-if-recognized',
);
assert.equal(
  chapterOneDocumentAccess({
    secFetchSite: 'same-origin',
    secFetchMode: 'cors',
    secFetchDest: 'empty',
    wantsAttachment: true,
  }),
  'allow-if-recognized',
);
assert.equal(
  chapterOneDocumentAccess({
    secFetchSite: 'cross-site',
    secFetchMode: 'cors',
    secFetchDest: 'empty',
    wantsAttachment: false,
  }),
  'deny',
);
assert.equal(
  chapterOneDocumentAccess({
    secFetchSite: null,
    secFetchMode: null,
    secFetchDest: null,
    wantsAttachment: false,
  }),
  'deny',
);
assert.equal(
  chapterOneDocumentAccess({
    secFetchSite: 'same-origin',
    secFetchMode: 'navigate',
    secFetchDest: 'iframe',
    wantsAttachment: false,
  }),
  'allow-if-recognized',
);

const reader = read('src/app/sample-chapters/read/[id]/ChapterReaderClient.tsx');
const invitation = read('src/components/sample-chapters/JodyReaderInvitation.tsx');
const one = read('src/components/sample-chapters/ChapterOneReader.tsx');
const route = read('src/app/api/sample-chapters/chapter-1/document/route.ts');
const middleware = read('src/middleware.ts');
const lead = read('src/lib/readersAgreeLead.ts');

assert.match(reader, /chapterId === '1'/);
assert.match(reader, /<iframe/);
assert.match(reader, /\{showJody && \(/);
assert.ok(reader.indexOf('<iframe') < reader.indexOf('{showJody && ('));
assert.match(reader, /Open full chapter/);
assert.doesNotMatch(one, /<iframe/);
assert.doesNotMatch(one, /\/chapters\/chapter1\.pdf/);
assert.doesNotMatch(one, /consentAccepted/);
assert.doesNotMatch(invitation, /consentAccepted/);
assert.doesNotMatch(invitation, /prospectNurture/);
assert.doesNotMatch(invitation, /type="checkbox"/);
assert.doesNotMatch(invitation, /router\.push/);
assert.match(invitation, /submitReadersAgreeLead/);
assert.match(invitation, /Not now/);
assert.match(invitation, /not a mailing list/);
assert.match(one, /fetchReadersAgreeRecognition/);
assert.match(one, /Not you\?/);
assert.match(one, /CHAPTER_ONE_DOCUMENT_PATH/);
assert.match(one, /access === 'recognized'/);
assert.doesNotMatch(route, /consentAccepted/);
assert.match(route, /chapter1\.pdf/);
assert.match(route, /allow-if-recognized/);
assert.match(middleware, /pathname === '\/chapters\/chapter1\.pdf'/);
assert.doesNotMatch(lead, /consentAccepted:\s*true/);

console.log(JSON.stringify({ pass: true, gateMs: JODY_READER_GATE_MS, cases: 'clock, page-lock, document-access, source' }));
