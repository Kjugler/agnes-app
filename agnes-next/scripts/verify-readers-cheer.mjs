#!/usr/bin/env node
/**
 * Static contract for /readers-cheer. /readers-agree stays an email-free entry.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sampleChapterEmailPromptVisible,
  sampleChapterReadable,
} from '../src/lib/chapterOneGate.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const agreeCapture = read('src/components/readers-agree/ReadersAgreeEmailCapture.tsx');
const cheerCapture = read('src/components/readers-agree/ReadersCheerEmailCapture.tsx');
const agreePage = read('src/app/readers-agree/page.tsx');
const cheerPage = read('src/app/readers-cheer/page.tsx');
const landing = read('src/app/readers-agree/ReadersAgreeLandingClient.tsx');
const lead = read('src/lib/readersAgreeLead.ts');
const reader = read('src/components/sample-chapters/SampleChapterReader.tsx');
const gate = read('src/components/sample-chapters/JodyReaderInvitation.tsx');

assert.match(agreeCapture, /Start Reading →/);
assert.match(agreeCapture, /No email needed to begin/);
assert.doesNotMatch(agreeCapture, /type="email"/);
assert.doesNotMatch(agreeCapture, /promotionalOptIn/);
assert.match(agreePage, /<ReadersAgreeLandingClient \/>/);
assert.doesNotMatch(agreePage, /entry="cheer"/);

assert.match(cheerPage, /canonical: '\/readers-cheer'/);
assert.match(cheerPage, /<ReadersAgreeLandingClient entry="cheer" \/>/);
assert.match(cheerCapture, /type="email"/);
assert.match(cheerCapture, /Read Sample Chapters/);
assert.match(cheerCapture, /useState\(false\)/);
assert.match(cheerCapture, /captureSurface: 'cheer'/);
assert.match(cheerCapture, /Please enter a valid email address\./);
assert.match(cheerCapture, /Something went wrong\. Please try again\./);
assert.match(cheerCapture, /sampleChaptersDestination/);
assert.doesNotMatch(cheerCapture, /\/sample-chapters\/read/);
assert.match(cheerCapture, /Leaving this unchecked does not change reading access\./);
assert.doesNotMatch(cheerCapture, /sendEmail|mailchimp|runPromotionalNurture/);

assert.match(landing, /Buy Direct →/);
assert.match(landing, /Amazon/);
assert.match(landing, /Barnes &amp; Noble/);
assert.match(landing, /buildReadersAgreePathWithTracking/);
assert.match(landing, /entry === 'cheer'/);
assert.match(landing, /readers-cheer/);
assert.match(landing, /ReadersAgreeEmailCapture/);
assert.match(lead, /input\.captureSurface === 'cheer'/);
assert.match(lead, /promotionalOptIn === true/);

assert.match(reader, /sampleChapterEmailPromptVisible\(\{/);
assert.match(reader, /recognized: access === 'recognized'/);
assert.match(reader, /if \(access !== 'anonymous' \|\| exhausted\) return/);
assert.match(reader, /setAccess\('recognized'\)/);
assert.match(reader, /\[chapterId, identityGeneration\]/);
assert.match(gate, /data-testid="jody-reader-invitation"/);
assert.match(gate, /Leaving this unchecked does not change reading access\./);

const recognizedBranch = reader.slice(
  reader.indexOf('if (recognition.recognized)'),
  reader.indexOf('setEmailHint(null)'),
);
assert.match(recognizedBranch, /setAccess\('recognized'\)/);
assert.match(recognizedBranch, /setExhausted\(false\)/);
assert.match(recognizedBranch, /return;/);
assert.doesNotMatch(recognizedBranch, /JodyReaderInvitation|type="email"/);

const chapters = ['1', '2', '9', '45'];
for (const chapterId of chapters) {
  assert.equal(
    sampleChapterReadable({ recognized: true, exhausted: true }),
    true,
    `chapter ${chapterId} stays open after recognition`,
  );
  assert.equal(
    sampleChapterEmailPromptVisible({ recognized: true, exhausted: true }),
    false,
    `chapter ${chapterId} does not ask for email again after 90 seconds`,
  );
  assert.equal(
    sampleChapterEmailPromptVisible({ recognized: false, exhausted: true }),
    true,
    `chapter ${chapterId} still asks an anonymous reader after 90 seconds`,
  );
}

console.log('verify-readers-cheer: passed');
