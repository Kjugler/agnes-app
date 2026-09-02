#!/usr/bin/env node
/**
 * Local synthetic mock for Reader Lifecycle list + detail preview.
 * Does not use production, real readers, or deepquill/dev.db.
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ADMIN_KEY = process.env.ADMIN_KEY || 'checkpoint4a-synthetic-admin-key';

function iso(day) {
  return `${day}T12:00:00.000Z`;
}

function comm(partial) {
  return {
    deliveryKnown: false,
    deliveryNote: 'This row records an attempt or history item, not proof of inbox delivery.',
    templateOrAskId: null,
    batchLabel: null,
    jobName: null,
    caption: null,
    trigger: 'unknown',
    ...partial,
  };
}

function evidence(partial) {
  return {
    sourceLabel: null,
    purchaseDate: null,
    details: null,
    reason: 'synthetic',
    actorType: 'admin',
    actorLabel: 'Synthetic reviewer',
    origin: 'mock',
    originRef: partial.id || 'ref',
    supersededById: null,
    createdAt: iso('2026-07-01'),
    accountingTruth: false,
    ...partial,
  };
}

function purchase(partial) {
  return {
    amount: 12,
    currency: 'usd',
    source: 'website',
    saleStatus: 'live',
    fulfillmentStatus: 'unfulfilled',
    accountingTruth: true,
    sessionId: 'cs_live_mock',
    sessionMode: 'live',
    createdAt: iso('2026-06-01'),
    ...partial,
  };
}

function baseList(id, name, extra) {
  return {
    readerProfileId: `rp_${id}`,
    userId: `user_${id}`,
    name,
    email: extra.hasRealEmail === false ? null : extra.email || `${id}@example.test`,
    emailDisplay:
      extra.hasRealEmail === false ? 'no_mailable_email' : extra.email || `${id}@example.test`,
    hasRealEmail: extra.hasRealEmail !== false,
    legacy: {
      source: extra.legacySource || 'website',
      readerType: extra.legacyType || 'interested',
      status: extra.legacyStatus || 'active',
    },
    ownership: extra.ownership || 'purchaser',
    sources: extra.sources || ['website'],
    confidence: extra.confidence || 'confirmed',
    contactability: extra.contactability || 'contactable',
    review: extra.review || 'clear',
    nurtureSuppressed: extra.nurtureSuppressed !== false,
    reasons: extra.reasons || [],
    latestCommunication: extra.latestCommunication === undefined ? comm({
      id: `c_${id}_latest`,
      occurredAt: iso('2026-08-01'),
      category: 'purchase_confirmation',
      outcome: 'recorded_sent_delivery_unknown',
      caption: 'Confirmation recorded',
      deliveryNote: 'Historical or reconstructed send recorded; delivery is unknown.',
      trigger: 'job',
    }) : extra.latestCommunication,
    createdAt: iso('2026-05-01'),
  };
}

function detailFrom(list, extra) {
  return {
    ...list,
    notes: extra.notes || '',
    phone: extra.phone || '',
    smsConsentGranted: Boolean(extra.smsConsentGranted),
    evidenceHistory: extra.evidenceHistory || [],
    purchases: extra.purchases || [],
    communications: extra.communications || (list.latestCommunication ? [list.latestCommunication] : []),
    contactDecisions: extra.contactDecisions || [],
    identityReviews: extra.identityReviews || [],
    distinctions: {
      purchasesAreAccountingTruth: true,
      evidenceIsLifecycleHistory: true,
      providerSuppressionIntegrated: false,
      contactableMeans: 'local_record_only',
      safeToSend: false,
      notForSendingSystems: true,
    },
  };
}

const web = baseList('web', 'Website Confirmed', {});
const amz = baseList('amz', 'Amazon Provisional', {
  sources: ['amazon'],
  confidence: 'provisional',
  review: 'incomplete',
});
const bn = baseList('bn', 'BN Provisional', {
  sources: ['barnes_noble'],
  confidence: 'provisional',
  review: 'incomplete',
});
const multi = baseList('multi', 'Website And BN', { sources: ['website', 'barnes_noble'] });
const gift = baseList('gift', 'Gifted Owner', {
  ownership: 'book_owner_gifted',
  sources: [],
  confidence: 'confirmed',
});
const non = baseList('non', 'Non Purchaser', {
  ownership: 'non_purchaser',
  sources: [],
  confidence: 'unknown',
  nurtureSuppressed: false,
  latestCommunication: null,
});
const unk = baseList('unk', 'Unknown Person', {
  ownership: 'unknown',
  sources: [],
  confidence: 'unknown',
  latestCommunication: null,
});
const inc = baseList('inc', 'Incomplete Case', { confidence: 'provisional', review: 'incomplete' });
const conf = baseList('conf', 'Conflict Case', {
  ownership: 'non_purchaser',
  review: 'conflicting',
  sources: [],
});
const idrev = baseList('idrev', 'Identity Review', {
  ownership: 'unknown',
  review: 'identity_review_required',
});
const dnc = baseList('dnc', 'Manual Dnc', { contactability: 'suppressed_do_not_contact' });
const nomail = baseList('nomail', 'No Mail', {
  hasRealEmail: false,
  contactability: 'no_mailable_email',
});

const DETAILS = {
  rp_web: detailFrom(web, {
    phone: '555-0100',
    notes: 'Synthetic website purchaser notes.',
    smsConsentGranted: true,
    purchases: [
      purchase({ id: 'p_web_live', createdAt: iso('2026-06-02'), saleStatus: 'live', fulfillmentStatus: 'label_printed' }),
      purchase({
        id: 'p_web_archived',
        createdAt: iso('2026-01-02'),
        saleStatus: 'archived_beta',
        amount: 0,
        fulfillmentStatus: 'n/a',
      }),
    ],
    evidenceHistory: [
      evidence({
        id: 'e_web',
        kind: 'website_stripe',
        status: 'confirmed',
        sourceLabel: 'website',
        purchaseDate: iso('2026-06-02'),
        details: 'Checkout webhook',
        reason: 'live_website_purchase',
      }),
    ],
    communications: [
      comm({
        id: 'c_web',
        occurredAt: iso('2026-08-01'),
        category: 'purchase_confirmation',
        outcome: 'recorded_sent_delivery_unknown',
        caption: 'Confirmation recorded',
        trigger: 'job',
        jobName: 'purchase-confirmation',
        templateOrAskId: 'purchase_confirmation_v1',
      }),
    ],
  }),
  rp_amz: detailFrom(amz, {
    evidenceHistory: [
      evidence({
        id: 'e_amz',
        kind: 'manual_amazon',
        status: 'provisional',
        sourceLabel: 'amazon',
        purchaseDate: iso('2026-04-10'),
        details: 'Order email',
        reason: 'provisional_manual_retailer',
      }),
    ],
  }),
  rp_bn: detailFrom(bn, {
    evidenceHistory: [
      evidence({
        id: 'e_bn',
        kind: 'kris_personal_knowledge',
        status: 'provisional',
        sourceLabel: 'barnes_noble',
        purchaseDate: iso('2026-03-08'),
        details: 'Kris personal knowledge',
        reason: 'provisional_personal_knowledge',
      }),
    ],
  }),
  rp_multi: detailFrom(multi, {
    purchases: [purchase({ id: 'p_multi', createdAt: iso('2026-05-09') })],
    evidenceHistory: [
      evidence({
        id: 'e_multi_web',
        kind: 'website_stripe',
        status: 'confirmed',
        sourceLabel: 'website',
        reason: 'live_website_purchase',
      }),
      evidence({
        id: 'e_multi_bn',
        kind: 'manual_bn',
        status: 'confirmed',
        sourceLabel: 'barnes_noble',
        purchaseDate: iso('2026-04-01'),
        details: 'Signed copy',
        reason: 'confirmed_manual_retailer',
      }),
    ],
  }),
  rp_gift: detailFrom(gift, {
    evidenceHistory: [
      evidence({
        id: 'e_gift',
        kind: 'gift_book_owner',
        status: 'confirmed',
        details: 'Gifted at event',
        reason: 'gift_without_purchase',
      }),
    ],
  }),
  rp_non: detailFrom(non, {}),
  rp_unk: detailFrom(unk, {}),
  rp_inc: detailFrom(inc, {
    evidenceHistory: [
      evidence({
        id: 'e_inc',
        kind: 'manual_amazon',
        status: 'provisional',
        sourceLabel: 'amazon',
        details: 'Missing purchase date',
        reason: 'missing_purchase_date',
      }),
    ],
  }),
  rp_conf: detailFrom(conf, {
    evidenceHistory: [
      evidence({
        id: 'e_conf',
        kind: 'manual_amazon',
        status: 'disputed',
        sourceLabel: 'amazon',
        details: 'Association disputed',
        reason: 'disputed_association',
      }),
    ],
  }),
  rp_idrev: detailFrom(idrev, {
    identityReviews: [
      {
        id: 'ir_open',
        primaryUserId: 'user_idrev',
        otherUserId: 'user_other_synthetic',
        reasonCode: 'duplicate_name',
        details: 'Two profiles share the same display name.',
        status: 'open',
        resolutionReason: null,
        resolvedAt: null,
        actorType: 'admin',
        actorLabel: 'Synthetic reviewer',
        createdAt: iso('2026-07-15'),
      },
    ],
  }),
  rp_dnc: detailFrom(dnc, {
    contactDecisions: [
      {
        id: 'cd_suppress',
        decision: 'suppress',
        reason: 'Reader asked not to be contacted',
        actorType: 'admin',
        actorLabel: 'Synthetic reviewer',
        createdAt: iso('2026-06-01'),
      },
      {
        id: 'cd_allow',
        decision: 'allow',
        reason: 'Later permission recorded',
        actorType: 'admin',
        actorLabel: 'Synthetic reviewer',
        createdAt: iso('2026-07-01'),
      },
    ],
  }),
  rp_nomail: detailFrom(nomail, {}),
  rp_hist: detailFrom(
    baseList('hist', 'Evidence History', { sources: ['amazon'], confidence: 'confirmed' }),
    {
      evidenceHistory: [
        evidence({
          id: 'e_hist_conf',
          kind: 'manual_amazon',
          status: 'confirmed',
          sourceLabel: 'amazon',
          purchaseDate: iso('2026-05-01'),
          details: 'Current',
          reason: 'confirmed_manual_retailer',
          createdAt: iso('2026-07-20'),
        }),
        evidence({
          id: 'e_hist_prov',
          kind: 'kris_personal_knowledge',
          status: 'provisional',
          sourceLabel: 'amazon',
          details: 'Still checking date',
          reason: 'provisional_personal_knowledge',
          createdAt: iso('2026-07-18'),
        }),
        evidence({
          id: 'e_hist_disp',
          kind: 'manual_amazon',
          status: 'disputed',
          details: 'Wrong person',
          reason: 'disputed_association',
          createdAt: iso('2026-07-10'),
        }),
        evidence({
          id: 'e_hist_sup',
          kind: 'manual_amazon',
          status: 'superseded',
          details: 'Old wrong date',
          reason: 'corrected',
          supersededById: 'e_hist_conf',
          createdAt: iso('2026-07-01'),
        }),
        evidence({
          id: 'e_hist_agg',
          kind: 'aggregate_marketing_not_individual',
          status: 'confirmed',
          details: 'Campaign total',
          reason: 'aggregate_not_individual_proof',
          createdAt: iso('2026-06-01'),
        }),
      ],
    },
  ),
  rp_comms: detailFrom(baseList('comms', 'Communication Mix', {}), {
    communications: [
      comm({
        id: 'c_acc',
        occurredAt: iso('2026-08-04'),
        category: 'reader_recommendation_taf',
        outcome: 'accepted',
        trigger: 'webhook',
        templateOrAskId: 'ask_2',
        caption: 'Reader accepted the ask',
      }),
      comm({
        id: 'c_rej',
        occurredAt: iso('2026-08-03'),
        category: 'reader_recommendation_taf',
        outcome: 'rejected',
        trigger: 'webhook',
        templateOrAskId: 'ask_2',
      }),
      comm({
        id: 'c_fail',
        occurredAt: iso('2026-08-02'),
        category: 'purchase_confirmation',
        outcome: 'failed',
        trigger: 'job',
        jobName: 'purchase-confirmation',
        batchLabel: 'batch-22',
      }),
      comm({
        id: 'c_unk',
        occurredAt: iso('2026-08-01'),
        category: 'purchase_confirmation',
        outcome: 'recorded_sent_delivery_unknown',
        trigger: 'job',
        caption: 'Confirmation recorded',
      }),
    ],
  }),
};

const PAGE1 = [web, amz, bn, multi, gift, non, unk, inc, conf, idrev, dnc, nomail];
const PAGE2 = [
  baseList('page2a', 'Second Page A', {}),
  baseList('page2b', 'Second Page B', { sources: ['amazon'] }),
];

export function getListPayload(url) {
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const cursor = url.searchParams.get('cursor');
  let items = cursor === 'page2' ? PAGE2 : PAGE1;
  if (q === 'zzzempty') items = [];
  else if (q) items = items.filter((row) => `${row.name} ${row.email || ''}`.toLowerCase().includes(q));
  const ownership = url.searchParams.get('ownership');
  if (ownership) items = items.filter((row) => row.ownership === ownership);
  return {
    ok: true,
    items,
    pageSize: 100,
    nextCursor: cursor === 'page2' || items.length === 0 ? null : 'page2',
    hasMore: cursor !== 'page2' && q !== 'zzzempty',
    partial: q === 'partialscan',
    totalCount: items.length,
    populationCount: cursor === 'page2' ? PAGE2.length : PAGE1.length,
    queueCounts: {
      archived: 0,
      dnc: 1,
      identity: 1,
      test_synthetic: 0,
      legacy_gifted: 0,
      legacy_purchaser: 0,
      prospects: 1,
      needs_review: 3,
      clear_no_action: 6,
    },
  };
}

export function getDetailPayload(id) {
  if (id === 'rp_down') return { status: 502, body: { ok: false, error: 'proxy_unavailable' } };
  const reader = DETAILS[id];
  if (!reader) return { status: 404, body: { ok: false, error: 'Not found' } };
  return { status: 200, body: { ok: true, reader } };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method !== 'GET' || !url.pathname.startsWith('/api/admin/reader-lifecycle/readers')) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    return;
  }
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Forbidden - x-admin-key required in production' }));
    return;
  }
  const suffix = url.pathname.replace('/api/admin/reader-lifecycle/readers', '').replace(/^\//, '');
  let status = 200;
  let body;
  if (!suffix) {
    body = getListPayload(url);
  } else {
    const result = getDetailPayload(decodeURIComponent(suffix));
    status = result.status;
    body = result.body;
  }
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
});

const thisFile = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invoked && path.resolve(invoked) === path.resolve(thisFile)) {
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    process.stdout.write(`MOCK_PORT=${port}\n`);
  });
}
