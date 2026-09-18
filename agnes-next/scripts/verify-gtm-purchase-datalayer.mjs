#!/usr/bin/env node
/**
 * Focused GTM purchase dataLayer tests.
 * Usage: node scripts/verify-gtm-purchase-datalayer.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGNES_NEXT_ROOT = path.resolve(SCRIPT_DIR, '..');

const HELPER_TS = path.join(AGNES_NEXT_ROOT, 'src', 'lib', 'googleTagManager.ts');
const PRODUCTS_TS = path.join(AGNES_NEXT_ROOT, 'src', 'lib', 'products.ts');
const SUCCESS_CLIENT = path.join(
  AGNES_NEXT_ROOT,
  'src',
  'app',
  'checkout',
  'success',
  'OrderConfirmationClient.tsx',
);
const THANK_YOU_CLIENT = path.join(
  AGNES_NEXT_ROOT,
  'src',
  'app',
  'contest',
  'thank-you',
  'ThankYouClient.tsx',
);
const GOOGLE_ADS_TS = path.join(AGNES_NEXT_ROOT, 'src', 'lib', 'googleAds.ts');
const VERIFY_SESSION_NEXT = path.join(
  AGNES_NEXT_ROOT,
  'src',
  'app',
  'api',
  'checkout',
  'verify-session',
  'route.ts',
);

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function transpileToTemp() {
  const require = createRequire(path.join(AGNES_NEXT_ROOT, 'package.json'));
  const ts = require('typescript');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-gtm-purchase-'));

  const products = ts.transpileModule(read(PRODUCTS_TS), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'products.ts',
  });
  fs.writeFileSync(path.join(outDir, 'products.mjs'), products.outputText);

  const helperSource = read(HELPER_TS).replace(
    "from '@/lib/products'",
    "from './products.mjs'",
  );
  const helper = ts.transpileModule(helperSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'googleTagManager.ts',
    reportDiagnostics: true,
  });
  if (helper.diagnostics?.length) {
    const msg = helper.diagnostics
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
      .join('\n');
    throw new Error(`helper transpile failed: ${msg}`);
  }
  const outFile = path.join(outDir, 'googleTagManager.mjs');
  fs.writeFileSync(outFile, helper.outputText);
  return { outDir, outFile };
}

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    get size() {
      return map.size;
    },
  };
}

function throwingStorage() {
  return {
    getItem() {
      throw new Error('localStorage unavailable');
    },
    setItem() {
      throw new Error('localStorage unavailable');
    },
  };
}

function installWindow({ storage } = {}) {
  const dataLayer = [];
  const localStorage = storage || createMemoryStorage();
  globalThis.window = { dataLayer, localStorage };
  return { dataLayer, localStorage };
}

function namedPurchases(dataLayer) {
  return dataLayer.filter((entry) => entry && entry.event === 'purchase');
}

function emitAfterVerify(mod, data, sessionId) {
  if (!(data.ok && data.paid)) return false;
  return mod.pushGtmPurchaseEvent({
    transactionId: sessionId,
    amountTotalCents: data.amountTotal,
    currency: data.currency,
    productType: data.productType,
  });
}

const { outFile } = transpileToTemp();
const mod = await import(pathToFileURL(outFile).href);

installWindow();
mod.clearGtmPurchaseInMemoryDedup();

{
  const { dataLayer } = installWindow();
  mod.clearGtmPurchaseInMemoryDedup();
  const pushed = emitAfterVerify(
    mod,
    { ok: true, paid: false, amountTotal: 2705, currency: 'usd', productType: 'paperback' },
    'cs_test_unpaid',
  );
  assert.equal(pushed, false);
  assert.equal(namedPurchases(dataLayer).length, 0, 'no purchase event before paid verification');
  console.log('ok  no purchase event before paid verification');
}

{
  const { dataLayer } = installWindow();
  mod.clearGtmPurchaseInMemoryDedup();
  const sessionId = 'cs_test_paid_once';
  const data = {
    ok: true,
    paid: true,
    amountTotal: 2705,
    currency: 'usd',
    productType: 'paperback',
  };
  assert.equal(emitAfterVerify(mod, data, sessionId), true);
  assert.equal(emitAfterVerify(mod, data, sessionId), false);
  const purchases = namedPurchases(dataLayer);
  assert.equal(purchases.length, 1, 'exactly one named purchase event after paid verification');
  assert.equal(dataLayer[0].ecommerce, null, 'ecommerce is cleared immediately before purchase');
  assert.equal(dataLayer[1].event, 'purchase');
  console.log('ok  exactly one named purchase event after paid verification');
}

{
  const { dataLayer } = installWindow();
  mod.clearGtmPurchaseInMemoryDedup();
  const sessionId = 'cs_live_txn_fields';
  emitAfterVerify(
    mod,
    { ok: true, paid: true, amountTotal: 2705, currency: 'usd', productType: 'paperback' },
    sessionId,
  );
  const purchase = namedPurchases(dataLayer)[0];
  assert.equal(purchase.ecommerce.transaction_id, sessionId);
  assert.equal(purchase.ecommerce.value, 27.05);
  assert.equal(purchase.ecommerce.currency, 'USD');
  console.log('ok  correct transaction ID/value/currency');
}

{
  const expected = {
    paperback: { item_id: 'paperback', item_name: 'Paperback', quantity: 1 },
    ebook: { item_id: 'ebook', item_name: 'eBook', quantity: 1 },
    audio_preorder: { item_id: 'audio_preorder', item_name: 'Audio (Preorder)', quantity: 1 },
  };
  for (const [productType, item] of Object.entries(expected)) {
    installWindow();
    mod.clearGtmPurchaseInMemoryDedup();
    const ecommerce = mod.buildGtmPurchaseEcommerce({
      transactionId: `cs_item_${productType}`,
      amountTotalCents: 1200,
      currency: 'usd',
      productType,
    });
    assert.deepEqual(ecommerce.items, [item], `known product mapping for ${productType}`);
  }
  console.log('ok  known product item mapping');
}

{
  for (const productType of [undefined, null, 'unknown', 'hardcover', '']) {
    const ecommerce = mod.buildGtmPurchaseEcommerce({
      transactionId: 'cs_unknown_product',
      amountTotalCents: 1200,
      currency: 'usd',
      productType,
    });
    assert.equal(ecommerce.transaction_id, 'cs_unknown_product');
    assert.equal('items' in ecommerce, false, `must not invent items for ${JSON.stringify(productType)}`);
    assert.equal(ecommerce.items, undefined);
  }
  const payload = JSON.stringify(
    mod.buildGtmPurchaseEcommerce({
      transactionId: 'cs_unknown_product',
      amountTotalCents: 1200,
      currency: 'usd',
      productType: 'unknown',
    }),
  );
  assert.equal(payload.includes('Paperback'), false);
  assert.equal(payload.includes('price'), false);
  console.log('ok  unknown product does not invent item data');
}

{
  const storage = createMemoryStorage();
  const first = installWindow({ storage });
  mod.clearGtmPurchaseInMemoryDedup();
  const sessionId = 'cs_test_refresh';
  const data = {
    ok: true,
    paid: true,
    amountTotal: 1200,
    currency: 'usd',
    productType: 'ebook',
  };
  assert.equal(emitAfterVerify(mod, data, sessionId), true);
  assert.equal(namedPurchases(first.dataLayer).length, 1);

  const revisit = installWindow({ storage });
  mod.clearGtmPurchaseInMemoryDedup();
  assert.equal(emitAfterVerify(mod, data, sessionId), false);
  assert.equal(
    namedPurchases(revisit.dataLayer).length,
    0,
    'refresh/revisit with the same Stripe session must not push another GTM purchase',
  );
  console.log('ok  refresh/revisit with the same Stripe session does not push another GTM purchase event');
}

{
  const storage = createMemoryStorage();
  const { dataLayer } = installWindow({ storage });
  mod.clearGtmPurchaseInMemoryDedup();
  const first = {
    ok: true,
    paid: true,
    amountTotal: 1200,
    currency: 'usd',
    productType: 'ebook',
  };
  const second = {
    ok: true,
    paid: true,
    amountTotal: 1800,
    currency: 'usd',
    productType: 'audio_preorder',
  };
  assert.equal(emitAfterVerify(mod, first, 'cs_session_a'), true);
  assert.equal(emitAfterVerify(mod, second, 'cs_session_b'), true);
  const purchases = namedPurchases(dataLayer);
  assert.equal(purchases.length, 2);
  assert.equal(purchases[0].ecommerce.transaction_id, 'cs_session_a');
  assert.equal(purchases[1].ecommerce.transaction_id, 'cs_session_b');
  assert.equal(purchases[1].ecommerce.value, 18);
  console.log('ok  different Stripe session can produce a new purchase event');
}

{
  const { dataLayer } = installWindow({ storage: throwingStorage() });
  mod.clearGtmPurchaseInMemoryDedup();
  const pushed = emitAfterVerify(
    mod,
    { ok: true, paid: true, amountTotal: 1800, currency: 'usd', productType: 'audio_preorder' },
    'cs_private_mode',
  );
  assert.equal(pushed, true, 'localStorage failure must not suppress the legitimate first event');
  assert.equal(namedPurchases(dataLayer).length, 1);
  assert.equal(namedPurchases(dataLayer)[0].ecommerce.transaction_id, 'cs_private_mode');
  console.log('ok  localStorage failure does not suppress the legitimate first event');
}

{
  const ads = read(GOOGLE_ADS_TS);
  assert.match(
    ads,
    /export function trackGoogleAdsPurchase\(props: GoogleAdsPurchaseProps\): void \{/,
  );
  assert.match(
    ads,
    /window\.gtag\?\.\('event', 'conversion', \{\s*send_to: sendTo,\s*value: props\.value,\s*currency: props\.currency,\s*transaction_id: props\.transactionId,\s*\}\);/,
  );
  assert.match(ads, /DEFAULT_GOOGLE_ADS_ID = 'AW-18340602294'/);
  assert.match(ads, /DEFAULT_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL = '3uBuCLqiqtQcELbDva1E'/);
  assert.doesNotMatch(ads, /pushGtmPurchaseEvent/);
  assert.doesNotMatch(ads, /event: 'purchase'/);

  const success = read(SUCCESS_CLIENT);
  const paidBlock = success.match(/if \(data\.ok && data\.paid\) \{([\s\S]*?)\n        \} else \{/);
  assert.ok(paidBlock, 'paid verification branch must exist');
  assert.match(paidBlock[1], /pushGtmPurchaseEvent\(\{/);
  assert.match(
    success,
    /if \(data\.ok && data\.paid\) \{[\s\S]*pushGtmPurchaseEvent\(\{[\s\S]*trackGoogleAdsPurchase\(\{/,
  );
  assert.match(
    success,
    /trackGoogleAdsPurchase\(\{\s*transactionId: currentSessionId,\s*value: \(data\.amountTotal \|\| 0\) \/ 100,\s*currency: \(data\.currency \|\| 'usd'\)\.toUpperCase\(\),\s*\}\);/,
  );
  console.log('ok  existing direct Google Ads conversion remains unchanged');
}

{
  const success = read(SUCCESS_CLIENT);
  assert.match(
    success,
    /trackTikTok\('CompletePayment', \{\s*event_id: currentSessionId,\s*content_id: data\.productType \|\| 'unknown',\s*value: \(data\.amountTotal \|\| 0\) \/ 100,\s*currency: \(data\.currency \|\| 'usd'\)\.toUpperCase\(\),\s*\}\);/,
  );
  assert.match(
    success,
    /trackMeta\(\s*'Purchase',\s*\{\s*content_ids: \[data\.productType \|\| 'unknown'\],\s*content_type: 'product',\s*value: \(data\.amountTotal \|\| 0\) \/ 100,\s*currency: \(data\.currency \|\| 'usd'\)\.toUpperCase\(\),\s*\},\s*\{ eventID: currentSessionId \},\s*\);/,
  );

  const thankYou = read(THANK_YOU_CLIENT);
  assert.doesNotMatch(thankYou, /pushGtmPurchaseEvent/);
  assert.match(thankYou, /trackTikTok\('CompletePayment'/);
  assert.match(thankYou, /trackMeta\(\s*'Purchase'/);
  assert.doesNotMatch(thankYou, /trackGoogleAdsPurchase/);

  const helper = read(HELPER_TS);
  assert.doesNotMatch(helper, /trackMeta/);
  assert.doesNotMatch(helper, /trackTikTok/);
  assert.doesNotMatch(helper, /trackGoogleAdsPurchase/);
  console.log('ok  Meta/TikTok behavior remains unchanged');
}

{
  const success = read(SUCCESS_CLIENT);
  const afterJson = success.split('const data = await res.json();')[1] || '';
  const beforePaid = afterJson.split('if (data.ok && data.paid)')[0];
  assert.doesNotMatch(beforePaid, /pushGtmPurchaseEvent/);
  assert.equal(
    (success.match(/pushGtmPurchaseEvent/g) || []).length,
    2,
    'import plus one call site only',
  );
  assert.match(success, /amountTotalCents: data\.amountTotal/);
  const gtmCall = success.slice(success.indexOf('pushGtmPurchaseEvent({'));
  assert.doesNotMatch(gtmCall.slice(0, 400), /amountTotal \|\| 2600/);
  assert.doesNotMatch(read(VERIFY_SESSION_NEXT), /pushGtmPurchaseEvent/);
  console.log('ok  GTM purchase is gated on ok && paid and does not use catalog amount fallbacks');
}

console.log('\nPASS  GTM purchase dataLayer checks');
