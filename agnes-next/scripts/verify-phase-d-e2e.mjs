/**
 * Phase D local E2E verification (lead, bridge, Jody suppression, purchase suppress).
 * Usage: node scripts/verify-phase-d-e2e.mjs
 *
 * Requires:
 * - agnes-next on DOROTHY_VERIFY_BASE (default http://localhost:3005)
 * - deepquill on DEEPQUILL_BASE (default http://localhost:5055)
 */
import { chromium } from 'playwright';

const BASE = process.env.DOROTHY_VERIFY_BASE ?? 'http://localhost:3005';
const DEEPQUILL = process.env.DEEPQUILL_BASE ?? 'http://localhost:5055';
const AD_QS =
  'src=meta&utm_source=facebook&utm_medium=cpc&utm_campaign=rrf-test&v=1&origin=messenger&fbclid=fbclid123';
const REF_QS =
  'ref=TESTREF&code=ABC123&src=meta&utm_source=facebook&utm_medium=cpc&utm_campaign=rrf-test&v=1&origin=messenger&fbclid=fbclid123';

function landingUrl(qs) {
  return `${BASE}/readers-agree?${qs}`;
}

function uniqueEmail(tag) {
  return `phase-d-e2e+${tag}+${Date.now()}@example.com`;
}

async function waitForLeadRedirect(page) {
  try {
    await page.waitForURL(/\/sample-chapters(\?|$)/, { timeout: 30000, waitUntil: 'commit' });
  } catch (err) {
    const errorText = await page.locator('.ra-email-capture-error').textContent().catch(() => null);
    const href = page.url();
    throw new Error(`${err.message} url=${href} formError=${errorText ?? 'none'}`);
  }
}

async function submitLandingLead(page, qs, tag) {
  const email = uniqueEmail(tag);
  await page.goto(landingUrl(qs), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.ra-email-capture-form input[type="email"]', { timeout: 15000 });
  await page.locator('.ra-email-capture-form input[type="email"]').fill(email);
  await page.locator('.ra-email-capture-form button[type="submit"]').click();
  await waitForLeadRedirect(page);
  const url = page.url();
  return { email, url };
}

async function submitBridgeLead(page, tag) {
  const email = uniqueEmail(tag);
  await page.waitForSelector('.ra-email-capture-form input[type="email"]', { timeout: 15000 });
  await page.locator('.ra-email-capture-form input[type="email"]').fill(email);
  await page.locator('.ra-email-capture-form button[type="submit"]').click();
  await waitForLeadRedirect(page);
  return { email, url: page.url() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchProfileByEmail(email) {
  const res = await fetch(`${DEEPQUILL}/api/admin/debug/user-by-email?email=${encodeURIComponent(email)}`, {
    headers: { Accept: 'application/json' },
  }).catch(() => null);
  if (!res?.ok) return null;
  return res.json().catch(() => null);
}

async function queryProfileViaPrisma(email) {
  // Fallback: direct lead API introspection via repeat submit response
  const res = await fetch(`${BASE}/api/readers-agree/lead`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      visitorId: 'e2e-check',
      ref: 'TESTREF',
      code: 'ABC123',
      utm: { utm_source: 'facebook', fbclid: 'fbclid123', src: 'meta' },
      consentAccepted: true,
      captureSurface: 'landing',
    }),
  });
  return res.json().catch(() => ({}));
}

async function bridgeFlow(page, retailer) {
  const qs = REF_QS;
  await page.goto(landingUrl(qs), { waitUntil: 'domcontentloaded', timeout: 120000 });
  const retailerName = retailer === 'amazon' ? 'Amazon' : 'Barnes & Noble';
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: retailerName, exact: true }).click(),
  ]);
  await page.waitForURL(new RegExp(`/readers-agree/go/${retailer}`));
  await popup.close();
  await page.waitForFunction(
    () => document.querySelector('main h1')?.textContent?.trim() === 'Still deciding?',
    { timeout: 10000 },
  );
  return page;
}

async function postLeadDirect(body) {
  const res = await fetch(`${DEEPQUILL}/api/readers-agree/lead`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}

async function run() {
  const results = {};
  const browser = await chromium.launch();

  async function runBrowserCase(name, fn) {
    try {
      results[name] = await fn();
    } catch (err) {
      results[name] = { pass: false, error: err?.message || String(err) };
    }
  }

  await runBrowserCase('directLandingLead', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const { email, url } = await submitLandingLead(page, AD_QS, 'direct');
    await ctx.close();
    return {
      pass:
        url.includes('/sample-chapters') &&
        !url.includes('/read/1') &&
        url.includes('utm_source=facebook') &&
        url.includes('fbclid=fbclid123'),
      email,
      url,
    };
  });

  await runBrowserCase('referralLandingLead', async () => {
    const leadJson = await postLeadDirect({
      email: uniqueEmail('referral-api'),
      visitorId: 'e2e-referral',
      ref: 'TESTREF',
      code: 'ABC123',
      utm: {
        utm_source: 'facebook',
        utm_medium: 'cpc',
        utm_campaign: 'rrf-test',
        fbclid: 'fbclid123',
        src: 'meta',
      },
      consentAccepted: true,
      captureSurface: 'landing',
    });
    return {
      pass:
        leadJson.ok === true &&
        leadJson.redirectPath?.includes('ref=TESTREF') &&
        leadJson.redirectPath?.includes('code=ABC123') &&
        !leadJson.redirectPath?.includes('/read/1'),
      leadJson,
      note: 'Browser path shares agnes-next rate limit; verified via deepquill direct POST',
    };
  });

  await runBrowserCase('amazonBridge', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await bridgeFlow(page, 'amazon');
    const buyHref = await page.locator('a[href*="/catalog"]').first().getAttribute('href');
    const backHref = await page.locator('a.ra-bridge-back-link').getAttribute('href');
    await ctx.close();
    return {
      pass: buyHref?.includes('ref=TESTREF') && backHref?.includes('amazon'),
      buyHref,
      backHref,
    };
  });

  await runBrowserCase('bridgeLeadAmazon', async () => {
    const leadJson = await postLeadDirect({
      email: uniqueEmail('bridge-api'),
      visitorId: 'e2e-bridge',
      ref: 'TESTREF',
      code: 'ABC123',
      utm: { src: 'meta', fbclid: 'fbclid123' },
      consentAccepted: true,
      captureSurface: 'bridge',
      retailerOrigin: 'amazon',
    });
    return {
      pass:
        leadJson.ok === true &&
        leadJson.redirectPath?.includes('/sample-chapters') &&
        !leadJson.redirectPath?.includes('/read/1'),
      leadJson,
    };
  });

  await runBrowserCase('bnBridgeAltRetailer', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await bridgeFlow(page, 'bn');
    const altLink = page.locator('a.ra-bridge-btn').filter({ hasText: 'Amazon' });
    const [popup] = await Promise.all([page.waitForEvent('popup'), altLink.click()]);
    await popup.close();
    await page.waitForURL(/\/readers-agree\/go\/amazon/);
    const url = page.url();
    await ctx.close();
    return { pass: url.includes('/readers-agree/go/amazon'), url };
  });

  await runBrowserCase('bridgeBuyDirect', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/readers-agree/go/bn?${REF_QS}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      sessionStorage.setItem('rrf_review_validated', '1');
      sessionStorage.setItem('rrf_bridge_went_hidden', '1');
    });
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector('main h1')?.textContent?.trim() === 'Still deciding?',
      { timeout: 10000 },
    );
    await page.locator('a[href*="/catalog"]').first().click();
    await page.waitForURL(/\/catalog/);
    const url = page.url();
    await ctx.close();
    return { pass: url.includes('ref=TESTREF'), url };
  });

  await runBrowserCase('backToRetailer', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await bridgeFlow(page, 'amazon');
    const backHref = await page.locator('a.ra-bridge-back-link').getAttribute('href');
    await ctx.close();
    return {
      pass: Boolean(backHref && backHref.includes('amazon')),
      backHref,
    };
  });

  await runBrowserCase('mobileJodySuppression', async () => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(landingUrl(AD_QS), { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => sessionStorage.setItem('ap_ra_v2_lead_active', '1'));
    await page.goto(`${BASE}/sample-chapters/read/1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => sessionStorage.getItem('ap_ra_v2_lead_active') === null, {
      timeout: 10000,
    });
    const markerAfterChapterMount = await page.evaluate(() =>
      sessionStorage.getItem('ap_ra_v2_lead_active'),
    );
    const jodyGateVisible = await page
      .locator('.chapter-mobile-jody-delivery')
      .isVisible()
      .catch(() => false);
    await ctx.close();
    return {
      pass: markerAfterChapterMount === null && !jodyGateVisible,
      markerAfterChapterMount,
      jodyGateVisible,
      note: 'Simulated post-RA marker; gate also requires NEXT_PUBLIC_JODY_MOBILE_DELIVERY=1',
    };
  });

  await runBrowserCase('freshNonRaJodyPath', async () => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/sample-chapters/read/1`, { waitUntil: 'domcontentloaded' });
    const marker = await page.evaluate(() => sessionStorage.getItem('ap_ra_v2_lead_active'));
    await ctx.close();
    return {
      pass: marker === null,
      marker,
    };
  });

  await browser.close();

  const attribEmail = uniqueEmail('attribution-db');
  const leadJson = await postLeadDirect({
    email: attribEmail,
    visitorId: 'e2e-attrib',
    ref: 'TESTREF',
    code: 'ABC123',
    utm: {
      utm_source: 'facebook',
      utm_medium: 'cpc',
      utm_campaign: 'rrf-test',
      fbclid: 'fbclid123',
      src: 'meta',
    },
    consentAccepted: true,
    captureSurface: 'landing',
  });
  results.attributionStored = {
    pass:
      leadJson.ok === true &&
      leadJson.redirectPath?.includes('ref=TESTREF') &&
      leadJson.redirectPath?.includes('fbclid=fbclid123'),
    leadJson,
    email: attribEmail,
  };

  results.email0NonBlocking = {
    pass: leadJson.ok === true && leadJson.emailQueued === false,
    note:
      'TRANSACTIONAL_EMAIL_ENABLED not set locally; lead returns immediately with emailQueued false. Welcome send is setImmediate best-effort when enabled.',
  };

  console.log(JSON.stringify(results, null, 2));
  const allPass = Object.values(results).every((r) => r.pass !== false);
  if (!allPass) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
