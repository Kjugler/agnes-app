#!/usr/bin/env node
/**
 * Frontend paperback offer: Denver bounds, catalog copy order, InitiateCheckout values, 15% of $21.95.
 * Usage: node scripts/verify-paperback-offer.mjs
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

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function transpile(fileName, source) {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  });
  return result.outputText;
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-paperback-offer-'));
fs.writeFileSync(
  path.join(outDir, 'paperbackOffer.mjs'),
  transpile('paperbackOffer.ts', read(path.join(ROOT, 'src/lib/paperbackOffer.ts'))),
);
const productsSource = read(path.join(ROOT, 'src/lib/products.ts')).replace(
  "from '@/lib/paperbackOffer'",
  "from './paperbackOffer.mjs'",
);
fs.writeFileSync(path.join(outDir, 'products.mjs'), transpile('products.ts', productsSource));
const catalogPricingSource = read(path.join(ROOT, 'src/lib/catalogPricing.ts')).replace(
  "from '@/lib/products'",
  "from './products.mjs'",
);
fs.writeFileSync(
  path.join(outDir, 'catalogPricing.mjs'),
  transpile('catalogPricing.ts', catalogPricingSource),
);

const {
  formatDenverYmd,
  isPaperbackSalePriceActive,
  isPaperbackFreeShippingWindow,
  getPaperbackCatalogPhase,
  getPaperbackOffer,
  paperbackInitiateCheckoutValueCents,
  PAPERBACK_PROMO_COPY,
} = await import(pathToFileURL(path.join(outDir, 'paperbackOffer.mjs')).href);
const { getProduct } = await import(pathToFileURL(path.join(outDir, 'products.mjs')).href);
const { discountedPriceCents } = await import(pathToFileURL(path.join(outDir, 'catalogPricing.mjs')).href);

const BEFORE = new Date('2026-10-02T05:59:59.000Z');
const START = new Date('2026-10-02T06:00:00.000Z');
const LAST_FREE = new Date('2026-10-17T05:59:59.000Z');
const AFTER = new Date('2026-10-17T06:00:00.000Z');

assert.equal(formatDenverYmd(BEFORE), '2026-10-01');
assert.equal(formatDenverYmd(START), '2026-10-02');
assert.equal(formatDenverYmd(LAST_FREE), '2026-10-16');
assert.equal(formatDenverYmd(AFTER), '2026-10-17');

assert.equal(isPaperbackSalePriceActive(BEFORE), false);
assert.equal(isPaperbackFreeShippingWindow(BEFORE), false);
assert.equal(getPaperbackCatalogPhase(BEFORE), 'pre_sale');
assert.equal(getPaperbackOffer(BEFORE).priceCents, 2600);
assert.equal(getPaperbackOffer(BEFORE).displayPrice, '$26.00');
assert.equal(getPaperbackOffer(BEFORE).shippingCents, 495);
assert.equal(paperbackInitiateCheckoutValueCents(BEFORE), 3095);
assert.equal(getProduct('paperback', BEFORE).priceCents, 2600);

assert.equal(isPaperbackSalePriceActive(START), true);
assert.equal(isPaperbackFreeShippingWindow(START), true);
assert.equal(getPaperbackCatalogPhase(START), 'free_shipping');
assert.equal(getPaperbackOffer(START).priceCents, 2195);
assert.equal(getPaperbackOffer(START).displayPrice, '$21.95');
assert.equal(getPaperbackOffer(START).shippingCents, 0);
assert.equal(paperbackInitiateCheckoutValueCents(START), 2195);
assert.equal(getProduct('paperback', START).priceCents, 2195);

assert.equal(getPaperbackCatalogPhase(LAST_FREE), 'free_shipping');
assert.equal(paperbackInitiateCheckoutValueCents(LAST_FREE), 2195);

assert.equal(isPaperbackSalePriceActive(AFTER), true);
assert.equal(isPaperbackFreeShippingWindow(AFTER), false);
assert.equal(getPaperbackCatalogPhase(AFTER), 'sale_paid_shipping');
assert.equal(getPaperbackOffer(AFTER).priceCents, 2195);
assert.equal(getPaperbackOffer(AFTER).shippingCents, 495);
assert.equal(paperbackInitiateCheckoutValueCents(AFTER), 2690);

assert.equal(discountedPriceCents(2195), 1866);

assert.equal(PAPERBACK_PROMO_COPY.was, 'WAS $26.00');
assert.equal(PAPERBACK_PROMO_COPY.now, 'NOW $21.95');
assert.equal(PAPERBACK_PROMO_COPY.freeShipping, 'FREE SHIPPING THROUGH OCTOBER 16');
assert.equal(PAPERBACK_PROMO_COPY.afterNote, 'After October 16, standard shipping returns.');
assert.equal(PAPERBACK_PROMO_COPY.title, 'THE AGNES PROTOCOL');
assert.equal(PAPERBACK_PROMO_COPY.author, 'Simon McQuade');

const catalog = read(path.join(ROOT, 'src/app/catalog/CatalogClient.tsx'));
const promoFn = catalog.slice(catalog.indexOf('function PaperbackOfferBlock'), catalog.indexOf('export default function CatalogClient'));
const order = [
  'PAPERBACK_PROMO_COPY.was',
  'PAPERBACK_PROMO_COPY.now',
  'PAPERBACK_PROMO_COPY.freeShipping',
  'PAPERBACK_PROMO_COPY.afterNote',
  'PAPERBACK_PROMO_COPY.title',
  'PAPERBACK_PROMO_COPY.author',
];
let last = -1;
for (const token of order) {
  const idx = promoFn.indexOf(token);
  assert.ok(idx > last, `catalog promo order missing or wrong: ${token}`);
  last = idx;
}
assert.match(promoFn, /textDecoration: 'line-through'/);
assert.match(catalog, /Includes FREE eBook/);
assert.doesNotMatch(catalog, /from '@\/lib\/readersAgree/);
assert.doesNotMatch(catalog, /Jody/);

const checkout = read(path.join(ROOT, 'src/lib/checkout.ts'));
assert.match(checkout, /paperbackShippingCents/);
assert.doesNotMatch(checkout, /PAPERBACK_SHIPPING_CENTS/);

fs.rmSync(outDir, { recursive: true, force: true });
console.log('verify-paperback-offer: ok');
