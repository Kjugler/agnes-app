#!/usr/bin/env node
/**
 * Readers Agree Amazon Attribution: Denver Oct. 1 / Oct. 2 boundary, CLEAN preserved, no Oct. 16 end.
 * Usage: node scripts/verify-amazon-attribution.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const ts = require('typescript');

const CLEAN =
  'https://www.amazon.com/dp/B0GWQBDH66?maas=maas_adg_B1F3C0D9F386C2563E467F32B9954434_afap_abs&ref_=aa_maas&tag=maas';
const OCT2 =
  'https://www.amazon.com/dp/B0GWQBDH66?maas=maas_adg_77A82354D25FFFE4B0719EBAF99C4EC1_afap_abs&ref_=aa_maas&tag=maas';
const REVIEWS = 'https://www.amazon.com/dp/B0GWQBDH66#customerReviews';

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function transpile(fileName, source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  }).outputText;
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-amazon-attribution-'));
fs.writeFileSync(
  path.join(outDir, 'paperbackOffer.mjs'),
  transpile('paperbackOffer.ts', read('src/lib/paperbackOffer.ts')),
);
fs.writeFileSync(
  path.join(outDir, 'textAFriendOg.mjs'),
  transpile('textAFriendOg.ts', read('src/lib/textAFriendOg.ts')),
);
fs.writeFileSync(
  path.join(outDir, 'metaAdLanding.mjs'),
  transpile('metaAdLanding.ts', read('src/lib/metaAdLanding.ts')),
);

const landingSource = read('src/lib/readerRecommendationLanding.ts')
  .replace("from '@/lib/textAFriendOg'", "from './textAFriendOg.mjs'")
  .replace("from '@/lib/paperbackOffer'", "from './paperbackOffer.mjs'")
  .replace("from '@/lib/metaAdLanding'", "from './metaAdLanding.mjs'");
fs.writeFileSync(
  path.join(outDir, 'readerRecommendationLanding.mjs'),
  transpile('readerRecommendationLanding.ts', landingSource),
);

const { formatDenverYmd } = await import(
  pathToFileURL(path.join(outDir, 'paperbackOffer.mjs')).href
);
const {
  getReadersAgreeAmazonAttributionUrl,
  READERS_AGREE_AMAZON_ATTRIBUTION_URL_CLEAN,
  READERS_AGREE_AMAZON_ATTRIBUTION_URL_OCT2,
  READERS_AGREE_AMAZON_ATTRIBUTION_URL,
  AMAZON_ATTRIBUTION_OCT2_START_YMD,
  AMAZON_REVIEWS_URL,
} = await import(pathToFileURL(path.join(outDir, 'readerRecommendationLanding.mjs')).href);

const OCT1_END = new Date('2026-10-02T05:59:59.000Z');
const OCT2_START = new Date('2026-10-02T06:00:00.000Z');
const AFTER_FREE_SHIPPING = new Date('2026-10-17T06:00:00.000Z');
const FAR_FUTURE = new Date('2027-01-15T12:00:00.000Z');

assert.equal(formatDenverYmd(OCT1_END), '2026-10-01');
assert.equal(formatDenverYmd(OCT2_START), '2026-10-02');
assert.equal(AMAZON_ATTRIBUTION_OCT2_START_YMD, '2026-10-02');

assert.equal(READERS_AGREE_AMAZON_ATTRIBUTION_URL_CLEAN, CLEAN);
assert.equal(READERS_AGREE_AMAZON_ATTRIBUTION_URL, CLEAN);
assert.equal(READERS_AGREE_AMAZON_ATTRIBUTION_URL_OCT2, OCT2);
assert.equal(AMAZON_REVIEWS_URL, REVIEWS);

assert.equal(getReadersAgreeAmazonAttributionUrl(OCT1_END), CLEAN);
assert.equal(getReadersAgreeAmazonAttributionUrl(OCT2_START), OCT2);
assert.equal(getReadersAgreeAmazonAttributionUrl(AFTER_FREE_SHIPPING), OCT2);
assert.equal(getReadersAgreeAmazonAttributionUrl(FAR_FUTURE), OCT2);

const landing = read('src/app/readers-agree/ReadersAgreeLandingClient.tsx');
assert.match(landing, /getReadersAgreeAmazonAttributionUrl/);
assert.match(landing, /const amazonAttributionUrl = getReadersAgreeAmazonAttributionUrl\(\)/);
assert.doesNotMatch(landing, /READERS_AGREE_AMAZON_ATTRIBUTION_URL[^_]/);

const amazonPage = read('src/app/readers-agree/go/amazon/page.tsx');
assert.match(amazonPage, /getReadersAgreeAmazonAttributionUrl/);
assert.match(amazonPage, /destinationUrl=\{getReadersAgreeAmazonAttributionUrl\(\)\}/);
assert.match(amazonPage, /export const dynamic = 'force-dynamic'/);
assert.doesNotMatch(amazonPage, /READERS_AGREE_AMAZON_ATTRIBUTION_URL[^_G]/);

const metaAd = read('src/lib/metaAdLanding.ts');
assert.match(metaAd, /export const AMAZON_REVIEWS_URL =\s*'https:\/\/www\.amazon\.com\/dp\/B0GWQBDH66#customerReviews'/);

const continueReading = read('src/app/reader/continue/ContinueReadingClient.tsx');
assert.match(continueReading, /AMAZON_REVIEWS_URL/);
assert.doesNotMatch(continueReading, /getReadersAgreeAmazonAttributionUrl/);

const metaLanding = read('src/app/readers-cant-put-it-down/MetaAdLandingClient.tsx');
assert.match(metaLanding, /AMAZON_REVIEWS_URL/);
assert.doesNotMatch(metaLanding, /getReadersAgreeAmazonAttributionUrl/);

const bridgeVerify = read('scripts/verify-bridge-return.mjs');
assert.match(bridgeVerify, /B1F3C0D9F386C2563E467F32B9954434/);
assert.match(bridgeVerify, /77A82354D25FFFE4B0719EBAF99C4EC1/);
assert.match(bridgeVerify, /AMAZON_ATTRIBUTION_OCT2_START_YMD/);
assert.match(bridgeVerify, /expectedAmazonAttributionUrl/);

const landingLib = read('src/lib/readerRecommendationLanding.ts');
assert.doesNotMatch(landingLib, /PAPERBACK_FREE_SHIPPING_END_YMD/);
assert.doesNotMatch(landingLib, /isPaperbackSalePriceActive/);
assert.match(landingLib, /AMAZON_ATTRIBUTION_OCT2_START_YMD = '2026-10-02'/);

fs.rmSync(outDir, { recursive: true, force: true });
console.log('verify-amazon-attribution: ok');
