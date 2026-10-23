#!/usr/bin/env node
/**
 * Static contract for /readers-cheer. /readers-agree stays an email-free entry.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

assert.match(reader, /access === 'anonymous' && exhausted/);
assert.match(reader, /if \(access !== 'anonymous' \|\| exhausted\) return/);
assert.match(reader, /setAccess\('recognized'\)/);
assert.match(gate, /data-testid="jody-reader-invitation"/);
assert.match(gate, /Leaving this unchecked does not change reading access\./);

const anonymousBranch = reader.slice(reader.indexOf("if (recognition.recognized)"));
assert.match(anonymousBranch, /setAccess\('recognized'\)/);
assert.match(anonymousBranch, /setExhausted\(false\)/);

console.log('verify-readers-cheer: passed');
