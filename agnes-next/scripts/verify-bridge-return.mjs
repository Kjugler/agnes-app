/**
 * Bridge return-path verification for Readers Agree Dorothy bridge.
 * Usage: node scripts/verify-bridge-return.mjs
 * Requires dev server with NEXT_PUBLIC_READERS_AGREE_DOROTHY_BRIDGE=1
 */
import { chromium } from 'playwright';

const BASE = process.env.DOROTHY_VERIFY_BASE ?? 'http://localhost:3002';
const QS =
  'ref=TESTREF&src=meta&utm_source=facebook&utm_medium=cpc&utm_campaign=rrf-test&v=1&origin=messenger&code=ABC123&fbclid=fbclid123';
const AMAZON_ATTRIBUTION_URL =
  'https://www.amazon.com/dp/B0GWQBDH66?maas=maas_adg_B1F3C0D9F386C2563E467F32B9954434_afap_abs&ref_=aa_maas&tag=maas';

function landingUrl() {
  return `${BASE}/readers-agree?${QS}`;
}

async function getBridgeContinuationSignals(page) {
  return page.evaluate(() => {
    const heading = document.querySelector('main h1')?.textContent?.trim() ?? '';
    const buy = document.querySelector('a[href*="/catalog"]');
    const sample = document.querySelector('a[href*="/sample-chapters"]');
    const anotherLook = Array.from(document.querySelectorAll('a')).find((el) =>
      /another look/i.test(el.textContent || ''),
    );
    const noThanks = Array.from(document.querySelectorAll('a')).find((el) =>
      /No thanks — take me back/i.test(el.textContent || ''),
    );
    const emailLead = document.querySelector('.ra-email-capture-lead--bridge');
    const startReading = document.querySelector('.ra-email-capture-submit');
    const emailInput = document.querySelector('#ra-email-bridge');
    return {
      heading,
      buyText: buy?.textContent?.trim() ?? '',
      buyHref: buy?.getAttribute('href') ?? '',
      buyClass: buy?.className ?? '',
      sampleText: sample?.textContent?.trim() ?? '',
      sampleHref: sample?.getAttribute('href') ?? '',
      anotherLook: anotherLook?.textContent?.trim() ?? '',
      noThanksText: noThanks?.textContent?.trim() ?? '',
      noThanksHref: noThanks?.getAttribute('href') ?? '',
      emailLead: emailLead?.textContent?.trim() ?? '',
      startReading: startReading?.textContent?.trim() ?? '',
      hasEmailInput: Boolean(emailInput),
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

async function desktopFlow(page, retailerName, bridgePattern) {
  await page.goto(landingUrl(), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('.ra-bn-purchase-row').getByRole('link', { name: retailerName, exact: true }).waitFor({
    state: 'visible',
  });
  await page.waitForTimeout(400);
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('.ra-bn-purchase-row').getByRole('link', { name: retailerName, exact: true }).click(),
  ]);
  await page.waitForURL(bridgePattern, { timeout: 30000 });
  await popup.waitForLoadState('domcontentloaded');
  const popupUrl = popup.url();
  await popup.close();

  await page.bringToFront();
  await page.waitForTimeout(2600);

  const signals = await getBridgeContinuationSignals(page);
  return { ...signals, popupUrl };
}

async function mobileFlow(page) {
  await page.goto(landingUrl(), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('a[href*="/readers-agree/go/amazon"]').first().click();
  await page.waitForURL(/\/readers-agree\/go\/amazon/);
  const popup = await openRetailerFromBridge(page, 'Amazon');
  const popupUrl = popup.url();
  await popup.close();
  await page.bringToFront();
  await page.waitForTimeout(2600);
  const signals = await getBridgeContinuationSignals(page);
  return { ...signals, popupUrl };
}

function passContinuation(signals, { expectAmazonPopup = false } = {}) {
  const amazonOk = !expectAmazonPopup || signals.popupUrl.startsWith(AMAZON_ATTRIBUTION_URL);
  return (
    signals.heading === 'Ready to see for yourself?' &&
    signals.buyText.includes('Buy Direct') &&
    signals.buyClass.includes('ra-bn-cta-primary') &&
    signals.buyHref.includes('/catalog') &&
    signals.buyHref.includes('ref=TESTREF') &&
    signals.emailLead === 'Enter your email address to read free chapters' &&
    signals.startReading === 'START READING' &&
    signals.hasEmailInput &&
    signals.noThanksText === 'No thanks — take me back' &&
    signals.noThanksHref.includes('/readers-agree') &&
    signals.noThanksHref.includes('ref=TESTREF') &&
    !signals.sampleText &&
    !signals.anotherLook &&
    signals.flags.active === '1' &&
    amazonOk
  );
}

async function run() {
  const browser = await chromium.launch();
  const results = {};

  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const signals = await desktopFlow(page, 'Amazon', /\/readers-agree\/go\/amazon/);
    results.desktopAmazonReturn = {
      pass: passContinuation(signals, { expectAmazonPopup: true }),
      signals,
    };
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const signals = await desktopFlow(page, 'Barnes & Noble', /\/readers-agree\/go\/bn/);
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
    results.mobileAmazonReturn = {
      pass: passContinuation(signals, { expectAmazonPopup: true }),
      signals,
    };
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
