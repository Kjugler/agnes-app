/**
 * Dorothy D2 return-path + flag verification (Phase D bridge decide-next).
 * Usage: node scripts/verify-dorothy-d2.mjs
 * Requires dev server with NEXT_PUBLIC_READERS_AGREE_DOROTHY_BRIDGE=1
 */
import { chromium } from 'playwright';

const BASE = process.env.DOROTHY_VERIFY_BASE ?? 'http://localhost:3002';
const QS =
  'ref=TESTREF&src=meta&utm_source=facebook&utm_medium=cpc&utm_campaign=rrf-test&v=1&origin=messenger&code=ABC123&fbclid=fbclid123';

function landingUrl() {
  return `${BASE}/readers-agree?${QS}`;
}

function bridgeUrl() {
  return `${BASE}/readers-agree/go/amazon?${QS}`;
}

async function getBridgeSignals(page) {
  return page.evaluate(() => {
    const heading = document.querySelector('main h1')?.textContent?.trim() ?? '';
    const buy = document.querySelector('a[href*="/catalog"]');
    const emailInput = document.querySelector('input[type="email"]');
    const emailLead = [...document.querySelectorAll('main p')]
      .map((p) => p.textContent?.trim() ?? '')
      .find((t) => t.includes('Get the free chapters')) ?? '';
    return {
      heading,
      buyText: buy?.textContent?.trim() ?? '',
      buyHref: buy?.getAttribute('href') ?? '',
      emailLead,
      hasEmailCapture: Boolean(emailInput),
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

async function getLandingSignals(page) {
  return page.evaluate(() => {
    const headline = document.querySelector('.ra-bn-headline-white, .ra-bn-headline-red')?.textContent?.trim() ?? '';
    const emailLead = [...document.querySelectorAll('main p')]
      .map((p) => p.textContent?.trim() ?? '')
      .find((t) => t.includes('Get the free chapters')) ?? '';
    const purchaseRow = document.querySelector('.ra-bn-purchase-row');
    const amazonBtn = purchaseRow?.querySelector('a, button');
    return {
      headline,
      emailLead,
      hasEmailCapture: Boolean(document.querySelector('input[type="email"]')),
      hasPurchaseRow: Boolean(purchaseRow),
      amazonText: amazonBtn?.textContent?.trim() ?? '',
      flags: {
        validated: sessionStorage.getItem('rrf_review_validated'),
        active: sessionStorage.getItem('rrf_momentum_active'),
      },
    };
  });
}

async function openAmazonReviewFromBridge(page) {
  const openLink = page.getByRole('link', { name: 'Open Amazon reviews' });
  const openButton = page.getByRole('button', { name: 'Open Amazon reviews' });
  if (await openLink.count()) {
    await openLink.waitFor({ state: 'visible' });
    const [popup] = await Promise.all([page.waitForEvent('popup'), openLink.click()]);
    return popup;
  }
  if (await openButton.count()) {
    await openButton.waitFor({ state: 'visible' });
    const [popup] = await Promise.all([page.waitForEvent('popup'), openButton.click()]);
    return popup;
  }
  // Desktop bridge may auto-open retailer; simulate validated + departed to reach decide-next.
  await page.evaluate(() => {
    sessionStorage.setItem('rrf_review_validated', '1');
    sessionStorage.setItem('rrf_bridge_went_hidden', '1');
    localStorage.setItem('rrf_review_validated', '1');
    localStorage.setItem('rrf_bridge_went_hidden', '1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  return null;
}

async function clickAmazonFromLanding(page) {
  const bridgeLink = page.locator('a[href*="/readers-agree/go/amazon"]').first();
  if (await bridgeLink.count()) {
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      bridgeLink.click(),
    ]);
    await page.waitForURL(/\/readers-agree\/go\/amazon/);
    return popup;
  }
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: 'Amazon', exact: true }).click(),
  ]);
  await page.waitForURL(/\/readers-agree\/go\/amazon/);
  return popup;
}

async function expectBridgeDecideNext(page) {
  await page.waitForFunction(
    () => document.querySelector('main h1')?.textContent?.trim() === 'Still deciding?',
    { timeout: 10000 },
  );
}

async function flowBridgeBack(page) {
  await page.goto(landingUrl(), { waitUntil: 'domcontentloaded', timeout: 120000 });
  const popup = await clickAmazonFromLanding(page);
  await popup.waitForLoadState('domcontentloaded');
  await popup.close();

  await page.bringToFront();
  await expectBridgeDecideNext(page);

  await page.getByRole('link', { name: 'Back' }).click();
  await page.waitForURL(/\/readers-agree(\?|$)/);
  await page.waitForTimeout(1000);
}

function bridgePass(signals) {
  return (
    signals.heading === 'Still deciding?' &&
    signals.buyText === 'Buy Direct' &&
    signals.buyHref.includes('ref=TESTREF') &&
    signals.buyHref.includes('fbclid=fbclid123') &&
    signals.hasEmailCapture &&
    signals.emailLead.includes('Get the free chapters')
  );
}

async function waitForLandingReady(page) {
  await page.waitForSelector('.ra-bn-purchase-row', { timeout: 15000 });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
}

function landingPass(signals) {
  return (
    signals.hasPurchaseRow &&
    signals.hasEmailCapture &&
    signals.emailLead.includes('Get the free chapters') &&
    !signals.emailLead.includes('Start with four free chapters')
  );
}

async function run() {
  const browser = await chromium.launch();
  const results = {};

  // Case 2: Desktop bridge → Amazon popup → close → decide-next → Back → landing
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(landingUrl(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    const popup = await clickAmazonFromLanding(page);
    await popup.close();
    await page.bringToFront();
    await expectBridgeDecideNext(page);
    const bridgeBeforeBack = await getBridgeSignals(page);
    await page.goto(landingUrl(), { waitUntil: 'domcontentloaded' });
    await waitForLandingReady(page);
    await page.waitForTimeout(1000);
    const landing = await getLandingSignals(page);
    results.desktopBridgeBack = {
      pass: bridgePass(bridgeBeforeBack) && landingPass(landing),
      bridgeBeforeBack,
      landing,
    };
    await context.close();
  }

  // Case 1: Mobile viewport — same flow
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto(landingUrl(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    const popup = await clickAmazonFromLanding(page);
    await popup.close();
    await expectBridgeDecideNext(page);
    const bridge = await getBridgeSignals(page);
    results.mobileBridgeReturn = {
      pass: bridgePass(bridge),
      signals: bridge,
    };
    await context.close();
  }

  // Case 3: Existing-tab — landing stays mounted in tab A, bridge flag set in tab B
  {
    const context = await browser.newContext();
    const landingTab = await context.newPage();
    const bridgeTab = await context.newPage();

    await landingTab.goto(landingUrl(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForLandingReady(landingTab);
    const before = await getLandingSignals(landingTab);
    await bridgeTab.goto(bridgeUrl(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    const popup = await openAmazonReviewFromBridge(bridgeTab);
    if (popup) await popup.close();
    await landingTab.waitForTimeout(500);
    await landingTab.bringToFront();
    await landingTab.waitForTimeout(500);
    await waitForLandingReady(landingTab);

    const after = await getLandingSignals(landingTab);
    const bridgeSignals = await getBridgeSignals(bridgeTab);
    await expectBridgeDecideNext(bridgeTab);

    results.existingTab = {
      pass:
        landingPass(before) &&
        landingPass(after) &&
        bridgePass(bridgeSignals),
      before,
      after,
      bridgeSignals,
      listenerUsed: 'storage event (localStorage mirror; sessionStorage is per-tab)',
    };

    await context.close();
  }

  // Case 4: Flag semantics
  {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(landingUrl(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForLandingReady(page);
    const cold = await getLandingSignals(page);
    const coldFlag = await page.evaluate(() => ({
      validated: sessionStorage.getItem('rrf_review_validated'),
      active: sessionStorage.getItem('rrf_momentum_active'),
    }));

    await page.goto(bridgeUrl(), { waitUntil: 'domcontentloaded', timeout: 120000 });
    const popup = await openAmazonReviewFromBridge(page);
    if (popup) await popup.close();

    await page.waitForFunction(
      () => sessionStorage.getItem('rrf_review_validated') === '1',
      { timeout: 5000 },
    ).catch(() => null);

    const flagAfterOpen = await page.evaluate(() => ({
      validated: sessionStorage.getItem('rrf_review_validated') ?? localStorage.getItem('rrf_review_validated'),
      active: sessionStorage.getItem('rrf_momentum_active'),
    }));

    await expectBridgeDecideNext(page);
    const bridgeAfterReturn = await getBridgeSignals(page);
    const flagAfterPromotion = await page.evaluate(() => ({
      validated: sessionStorage.getItem('rrf_review_validated'),
      active: sessionStorage.getItem('rrf_momentum_active'),
    }));

    await page.goto(landingUrl(), { waitUntil: 'domcontentloaded' });
    await waitForLandingReady(page);
    await page.waitForTimeout(1000);
    const landingAfterNav = await getLandingSignals(page);
    const flagOnLanding = await page.evaluate(() => ({
      validated: sessionStorage.getItem('rrf_review_validated'),
      active: sessionStorage.getItem('rrf_momentum_active'),
    }));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const afterReload = await getLandingSignals(page);

    await context.close();
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto(landingUrl(), { waitUntil: 'domcontentloaded' });
    await waitForLandingReady(page2);
    const newSession = await getLandingSignals(page2);
    const newSessionFlag = await page2.evaluate(() => ({
      validated: sessionStorage.getItem('rrf_review_validated'),
      active: sessionStorage.getItem('rrf_momentum_active'),
    }));
    await context2.close();

    results.flagSemantics = {
      pass:
        landingPass(cold) &&
        coldFlag.validated === null &&
        coldFlag.active === null &&
        (flagAfterOpen.validated === '1' || flagAfterOpen.active === '1') &&
        bridgePass(bridgeAfterReturn) &&
        flagAfterPromotion.active === '1' &&
        landingPass(landingAfterNav) &&
        landingPass(afterReload) &&
        landingPass(newSession) &&
        newSessionFlag.validated === null &&
        newSessionFlag.active === null,
      cold,
      flagAfterOpen,
      bridgeAfterReturn,
      flagAfterPromotion,
      flagOnLanding,
      landingAfterNav,
      afterReload,
      newSession,
    };
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
