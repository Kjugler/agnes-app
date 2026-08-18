/**
 * Verify human-test defect fixes: landing email + catalog referral discount.
 * Usage: DOROTHY_VERIFY_BASE=http://localhost:3009 node scripts/verify-defect-fixes.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.DOROTHY_VERIFY_BASE ?? 'http://localhost:3009';
const VALID_REF = process.env.LOCAL_VALID_REF ?? 'YSJT75';
const AD_QS =
  'src=meta&utm_source=facebook&utm_medium=cpc&utm_campaign=rrf-test&v=1&origin=messenger&fbclid=fbclid123';
const REF_QS = `ref=${VALID_REF}&${AD_QS}`;

function uniqueEmail(tag) {
  return `defect-fix+${tag}+${Date.now()}@example.com`;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];

  // 1. Plain landing email capture
  try {
    const email = uniqueEmail('landing-plain');
    await page.goto(`${BASE}/readers-agree`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.ra-email-capture-form input[type="email"]', { timeout: 15000 });
    await page.locator('.ra-email-capture-form input[type="email"]').fill(email);
    await page.locator('.ra-email-capture-form button[type="submit"]').click();
    await page.waitForURL(/\/sample-chapters(\?|$)/, { timeout: 30000 });
    results.push({ test: 'landing-plain-email', pass: true, url: page.url() });
  } catch (err) {
    const formError = await page.locator('.ra-email-capture-error').textContent().catch(() => null);
    results.push({ test: 'landing-plain-email', pass: false, error: err.message, formError, url: page.url() });
  }

  // 2. Catalog referral discount with valid ref
  try {
    await page.goto(`${BASE}/catalog?${REF_QS}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.catalog-card--paperback .catalog-price-discount', { timeout: 15000 });
    const list = await page.locator('.catalog-card--paperback .catalog-price-list').textContent();
    const discount = await page.locator('.catalog-card--paperback .catalog-price-discount').textContent();
    const final = await page.locator('.catalog-card--paperback .catalog-price-final').textContent();
    const pass =
      list?.includes('$26.00') &&
      discount?.includes('$3.90') &&
      final?.includes('$22.10');
    results.push({ test: 'catalog-referral-discount', pass, list, discount, final, url: page.url() });
  } catch (err) {
    results.push({ test: 'catalog-referral-discount', pass: false, error: err.message, url: page.url() });
  }

  // 3. Referral survives RA -> sample-chapters -> catalog
  try {
    const email = uniqueEmail('funnel');
    await page.goto(`${BASE}/readers-agree?${REF_QS}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.ra-email-capture-form input[type="email"]', { timeout: 15000 });
    await page.locator('.ra-email-capture-form input[type="email"]').fill(email);
    await page.locator('.ra-email-capture-form button[type="submit"]').click();
    await page.waitForURL(/\/sample-chapters/, { timeout: 30000 });
    const sampleUrl = page.url();
    const sampleHasRef = sampleUrl.includes(`ref=${VALID_REF}`);

    await page.goto(`${BASE}/catalog?${new URL(sampleUrl).searchParams.toString()}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForSelector('.catalog-card--paperback .catalog-price-discount', { timeout: 15000 });
    const discount = await page.locator('.catalog-card--paperback .catalog-price-discount').textContent();
    results.push({
      test: 'referral-funnel-survival',
      pass: sampleHasRef && discount?.includes('$3.90'),
      sampleUrl,
      catalogUrl: page.url(),
      discount,
    });
  } catch (err) {
    results.push({ test: 'referral-funnel-survival', pass: false, error: err.message, url: page.url() });
  }

  await browser.close();

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.pass);
  if (failed.length) {
    process.exitCode = 1;
    console.error(`\n${failed.length} test(s) failed`);
  } else {
    console.log('\nAll defect-fix checks passed');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
