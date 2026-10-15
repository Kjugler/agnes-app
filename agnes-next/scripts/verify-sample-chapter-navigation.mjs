#!/usr/bin/env node
/**
 * Readers-agree email lands on the sample-chapter hub.
 * Reading time starts on the chapter page, not the hub.
 *
 * Usage: node --experimental-strip-types scripts/verify-sample-chapter-navigation.mjs
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  catalogHref,
  sampleChapterReadHref,
  sampleChaptersDestination,
  sampleChaptersHubHref,
} from '../src/lib/sampleChapterNav.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const params = { get: (key) => ({ ref: 'REF1', code: 'CODE1', utm_source: 'mail', origin: 'amazon' })[key] || null };

assert.equal(
  sampleChaptersDestination('/sample-chapters?ref=REF1&code=CODE1'),
  '/sample-chapters?ref=REF1&code=CODE1',
);
assert.equal(
  sampleChaptersDestination('/sample-chapters/read/1?ref=REF1&code=CODE1'),
  '/sample-chapters?ref=REF1&code=CODE1',
);
assert.equal(sampleChaptersDestination('/read/chapter1?ref=REF1'), '/sample-chapters?ref=REF1');
assert.equal(sampleChaptersDestination('/sample-chapters'), '/sample-chapters');
assert.equal(
  sampleChapterReadHref('9', params),
  '/sample-chapters/read/9?ref=REF1&code=CODE1&origin=amazon&utm_source=mail',
);
assert.equal(sampleChaptersHubHref(params), '/sample-chapters?ref=REF1&code=CODE1&origin=amazon&utm_source=mail');
assert.equal(catalogHref(params).startsWith('/catalog?'), true);

const capture = read('src/components/readers-agree/ReadersAgreeEmailCapture.tsx');
const hub = read('src/app/sample-chapters/SampleChaptersClient.tsx');
const reader = read('src/app/sample-chapters/read/[id]/ChapterReaderClient.tsx');
const chapterReader = read('src/components/sample-chapters/SampleChapterReader.tsx');
const lead = read('../deepquill/api/readersAgree/lead.cjs');

assert.match(capture, /buildReadersAgreeContinuePath/);
assert.doesNotMatch(capture, /type="email"/);
assert.doesNotMatch(capture, /\/sample-chapters\/read\/1/);
assert.match(lead, /return qs \? `\/sample-chapters\?\$\{qs\}` : '\/sample-chapters'/);

for (const id of ['1', '2', '9', '45']) {
  assert.match(hub, new RegExp(`sampleChapterReadHref\\('${id}'`));
}
assert.match(hub, /Buy the Book/);
assert.match(hub, /pageViewType: FUNNEL_EVENT_TYPES\.SAMPLE_CHAPTERS_PAGE_VIEW/);
assert.doesNotMatch(hub, /SAMPLE_CHAPTER_TIME_ON_PAGE/);
assert.doesNotMatch(hub, /activeReadingClock/);
assert.doesNotMatch(hub, /useActiveReadingClock|readerGateThresholdMs/);

assert.match(reader, /SAMPLE_CHAPTER_OPEN/);
assert.match(reader, /SAMPLE_CHAPTER_TIME_ON_PAGE/);
assert.match(reader, /SampleChapterReader/);
assert.match(reader, /sampleChaptersHubHref/);
assert.match(chapterReader, /isActivelyReading/);
assert.match(chapterReader, /Buy the Book/);
assert.match(chapterReader, /sampleChaptersHubHref/);
assert.doesNotMatch(hub, /ChapterOneReader/);
assert.doesNotMatch(hub, /SampleChapterReader/);

console.log(JSON.stringify({ pass: true, hub: '/sample-chapters', chapters: [1, 2, 9, 45] }));
