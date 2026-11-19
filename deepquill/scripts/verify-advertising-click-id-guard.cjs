#!/usr/bin/env node
/**
 * Direct backend writes must not persist advertising click identifiers.
 * A caller-supplied consent flag is not permission. No database is used.
 */
const assert = require('assert');
const { recordFunnelEvent } = require('../lib/funnel/recordFunnelEvent.cjs');
const { buildRedirectPath } = require('../api/readersAgree/lead.cjs');
const { buildLeadAttributionSnapshot } = require('../lib/readers/readersAgreeLead.cjs');

const secret = {
  fbclid: 'fb-bypass',
  gclid: 'g-bypass',
  ttclid: 'tt-bypass',
  msclkid: 'ms-bypass',
};

function fakePrisma() {
  const rows = [];
  return {
    rows,
    event: {
      create: async ({ data }) => {
        rows.push(data);
        return { id: 'event-1' };
      },
    },
  };
}

async function main() {
  const prisma = fakePrisma();
  const saved = await recordFunnelEvent(prisma, {
    type: 'READERS_AGREE_PAGE_VIEW',
    visitorId: 'visitor-bypass',
    ref: 'friend-code',
    path: '/readers-agree?utm_source=meta&utm_campaign=fall&fbclid=fb-bypass&gclid=g-bypass&ttclid=tt-bypass&msclkid=ms-bypass',
    source: 'readers-agree',
    meta: {
      utm_source: 'meta',
      utm_medium: 'paid',
      utm_campaign: 'fall',
      ...secret,
      advertisingAllowed: true,
      consent: 'allow',
    },
  });
  assert.strictEqual(saved.ok, true);
  const meta = prisma.rows[0].meta;
  const encoded = JSON.stringify(meta);
  for (const value of Object.values(secret)) {
    assert.ok(!encoded.includes(value), `${value} was stored`);
  }
  for (const key of Object.keys(secret)) {
    assert.strictEqual(meta[key], undefined);
  }
  assert.strictEqual(meta.utm_source, 'meta');
  assert.strictEqual(meta.utm_campaign, 'fall');
  assert.strictEqual(meta.ref, 'friend-code');
  assert.ok(meta.path.includes('utm_source=meta'));
  assert.ok(meta.path.includes('utm_campaign=fall'));
  assert.ok(!meta.path.includes('fbclid'));
  assert.strictEqual(meta.advertisingAllowed, true);

  const redirect = buildRedirectPath({
    ref: 'friend-code',
    utm: { utm_source: 'meta', utm_campaign: 'fall', fbclid: 'fb-bypass' },
  });
  assert.strictEqual(redirect, '/sample-chapters?ref=friend-code&utm_source=meta&utm_campaign=fall');

  const snapshot = buildLeadAttributionSnapshot({
    visitorId: 'visitor-bypass',
    ref: 'friend-code',
    captureSurface: 'landing',
    utm: { utm_source: 'meta', utm_campaign: 'fall', fbclid: 'fb-bypass', gclid: 'g-bypass' },
  });
  assert.strictEqual(snapshot.fbclid, null);
  assert.strictEqual(snapshot.utm_source, 'meta');
  assert.strictEqual(snapshot.utm_campaign, 'fall');
  assert.strictEqual(snapshot.ref, 'friend-code');
  assert.strictEqual(snapshot.channel, 'meta');
  assert.ok(!JSON.stringify(snapshot).includes('fb-bypass'));
  assert.ok(!JSON.stringify(snapshot).includes('g-bypass'));

  const clickOnly = buildLeadAttributionSnapshot({
    captureSurface: 'landing',
    utm: { fbclid: 'fb-bypass' },
  });
  assert.strictEqual(clickOnly.fbclid, null);
  assert.strictEqual(clickOnly.channel, 'unknown');

  console.log('verify-advertising-click-id-guard: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
