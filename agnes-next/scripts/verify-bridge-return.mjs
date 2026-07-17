/**
 * Bridge return-path verification for Readers Agree Dorothy bridge.
 * Usage: node scripts/verify-bridge-return.mjs
 * Requires dev server with NEXT_PUBLIC_READERS_AGREE_DOROTHY_BRIDGE=1
 */
import { chromium } from 'playwright';

const BASE = process.env.DOROTHY_VERIFY_BASE ?? 'http://localhost:3002';
const QS =
  'ref=TESTREF&src=meta&utm_source=facebook&utm_medium=cpc&utm_campaign=rrf-test&v=1&origin=messenger&code=ABC123&fbclid=fbclid123';

function landingUrl() {
  return `${BASE}/readers-agree?${QS}`;
}

function bridgeAmazonUrl() {
  return `${BASE}/readers-agree/go/amazon?${QS}`;
}

function bridgeBnUrl() {
  return `${BASE}/readers-agree/go/bn?${QS}`;
}

async function getBridgeContinuationSignals(page) {
  return page.evaluate(() => {
    const heading = document.querySelector('main h1')?.textContent?.trim() ?? '';
    const buy = document.querySelector('a[href*="/catalog"]');
    const sample = document.querySelector('a[href*="/sample-chapters"]');
    return {
      heading,
      buyText: buy?.textContent?.trim() ?? '',
      buyHref: buy?.getAttribute('href') ?? '',
      sampleText: sample?.textContent?.trim() ?? '',
      sampleHref: sample?.getAttribute('href') ?? '',
      flags: {
        validated:
          sessionStorage.getItem('rrf_review_validated') ??
          localStorage.getItem('rrf_review_validated'),
        departed:
          sessionStorage.getItem('rrf_bridge_went_hidden') ??
          localStorage.getItem('rrf_bridge_went_hidden'),
        active:
          sessionStorage.getItem('rrf_momentum_active') ??
          localStorage.getItem('rrf_momentum_active'),
      },
    };
  });
}

async function openRetailerFromBridge(page, label) {
  await page.getByRole('link', { name: `Open ${label} reviews` }).waitFor({ state: 'visible' });
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: `Open ${label} reviews` }).click(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  return popup;
}

async function desktopFlow(page, retailerTitle, bridgePattern) {
  await page.goto(landingUrl(), { waitUntil: 'domcontentloaded', timeout: 120000 });
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('heading', { name: retailerTitle }).click(),
  ]);
  await page.waitForURL(bridgePattern);
  await popup.waitForLoadState('domcontentloaded');
  await popup.close();

  await page.bringToFront();
  await page.waitForTimeout(2600);

  return getBridgeContinuationSignals(page);
}

async function mobileFlow(page) {
  await page.goto(landingUrl(), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('a[href*="/readers-agree/go/amazon"]').first().click();
  await page.waitForURL(/\/readers-agree\/go\/amazon/);
  const popup = await openRetailerFromBridge(page, 'Amazon');
  await popup.close();
  await page.bringToFront();
  await page.waitForTimeout(2600);
  return getBridgeContinuationSignals(page);
}

function passContinuation(signals) {
  return (
    signals.heading === 'Ready to see for yourself?' &&
    signals.buyText.includes('Buy the Book') &&
    signals.sampleText.includes('Read Sample Chapters') &&
    signals.buyHref.includes('/catalog') &&
    signals.sampleHref.includes('/sample-chapters') &&
    signals.buyHref.includes('ref=TESTREF') &&
    signals.sampleHref.includes('fbclid=fbclid123') &&
    signals.flags.active === '1'
  );
}

async function run() {
  const browser = await chromium.launch();
  const results = {};

  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const signals = await desktopFlow(page, 'Amazon Readers', /\/readers-agree\/go\/amazon/);
    results.desktopAmazonReturn = { pass: passContinuation(signals), signals };
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const signals = await desktopFlow(page, 'Barnes & Noble Readers', /\/readers-agree\/go\/bn/);
    results.desktopBnReturn = { pass: passContinuation(signals), signals };
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const page = await context.newPage();
    const signals = await mobileFlow(page);
    results.mobileAmazonReturn = { pass: passContinuation(signals), signals };
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(landingUrl(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    const cold = await getBridgeContinuationSignals(page);
    results.coldLanding = {
      pass: cold.heading !== 'Ready to see for yourself?' && cold.flags.active === null,
      signals: cold,
    };
    await context.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  const allPass = Object.values(results).every((r) => r.pass !== false);
  if (!allPass) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
