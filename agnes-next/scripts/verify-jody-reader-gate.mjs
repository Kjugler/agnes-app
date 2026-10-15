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
  chapterOneDocumentAccess,
  sampleChapterReadable,
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

assert.equal(sampleChapterReadable({ recognized: false, exhausted: false }), true);
assert.equal(sampleChapterReadable({ recognized: false, exhausted: true }), false);
assert.equal(sampleChapterReadable({ recognized: true, exhausted: true }), true);

assert.equal(
  chapterOneDocumentAccess({
    secFetchSite: 'same-origin',
    secFetchMode: 'cors',
    secFetchDest: 'empty',
    wantsAttachment: false,
  }),
  'allowance-or-recognized',
);
assert.equal(
  chapterOneDocumentAccess({
    secFetchSite: 'same-origin',
    secFetchMode: 'navigate',
    secFetchDest: 'document',
    wantsAttachment: false,
  }),
  'recognized-only',
);
assert.equal(
  chapterOneDocumentAccess({
    secFetchSite: 'same-origin',
    secFetchMode: 'cors',
    secFetchDest: 'empty',
    wantsAttachment: true,
  }),
  'recognized-only',
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
  'recognized-only',
);

const reader = read('src/app/sample-chapters/read/[id]/ChapterReaderClient.tsx');
const invitation = read('src/components/sample-chapters/JodyReaderInvitation.tsx');
const shared = read('src/components/sample-chapters/SampleChapterReader.tsx');
const route = read('src/lib/serveSampleChapterDocument.ts');
const middleware = read('src/middleware.ts');
const lead = read('src/lib/readersAgreeLead.ts');
const capture = read('src/components/readers-agree/ReadersAgreeEmailCapture.tsx');

assert.match(reader, /SampleChapterReader/);
assert.doesNotMatch(reader, /<iframe/);
assert.match(reader, /\{showJody && \(/);
assert.ok(reader.indexOf('<SampleChapterReader') < reader.indexOf('{showJody && ('));
assert.doesNotMatch(shared, /Open full chapter/);
assert.doesNotMatch(shared, /chapter-one-download/);
assert.match(shared, /Back to Sample Chapters/);
assert.match(shared, /Buy the Book/);
assert.doesNotMatch(shared, /<iframe/);
assert.doesNotMatch(shared, /\/chapters\/chapter1\.pdf/);
assert.doesNotMatch(shared, /consentAccepted/);
assert.doesNotMatch(shared, /durationMs/);
assert.doesNotMatch(invitation, /consentAccepted/);
assert.doesNotMatch(invitation, /prospectNurture/);
assert.doesNotMatch(invitation, /type="checkbox"/);
assert.doesNotMatch(invitation, /router\.push/);
assert.match(invitation, /submitReadersAgreeLead/);
assert.match(invitation, /Continue Reading — Enter Email/);
assert.match(invitation, /Not Now — Back to Website/);
assert.match(invitation, /Your email unlocks all four sample chapters/);
assert.match(shared, /fetchReadersAgreeRecognition/);
assert.match(shared, /Not you\?/);
assert.match(shared, /sampleChapterDocumentPath/);
assert.match(shared, /access === 'recognized'/);
assert.match(shared, /decline: true/);
assert.doesNotMatch(route, /consentAccepted/);
assert.match(route, /chapter1\.pdf/);
assert.match(route, /chapter2\.pdf/);
assert.match(route, /chapter9\.pdf/);
assert.match(route, /chapter45\.pdf/);
assert.match(route, /recognized-only/);
assert.match(middleware, /pathname === '\/chapters\/chapter1\.pdf'/);
assert.match(middleware, /pathname === '\/chapters\/chapter45\.pdf'/);
assert.doesNotMatch(lead, /consentAccepted:\s*true/);
assert.match(capture, /buildReadersAgreeContinuePath/);
assert.doesNotMatch(capture, /type="email"/);

console.log(JSON.stringify({ pass: true, gateMs: JODY_READER_GATE_MS, cases: 'clock, page-lock, document-access, source' }));
