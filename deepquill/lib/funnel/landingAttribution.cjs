// Reporting-layer landing attribution. Does not rename stored events.
// Click identifiers may be read as evidence and must never be copied into report output.

const { FUNNEL_EVENT_TYPES: T } = require('./funnelEventTypes.cjs');

const LANDING_PAGES = Object.freeze([
  { key: 'readers-agree', path: '/readers-agree', label: 'Readers Agree' },
  { key: 'readers-cheer', path: '/readers-cheer', label: 'Readers Cheer' },
  { key: 'world-wondering', path: '/world-wondering', label: 'World Wondering' },
  { key: 'sample-chapters', path: '/sample-chapters', label: 'Sample Chapters' },
]);

const LANDING_KEYS = new Set(LANDING_PAGES.map((page) => page.key));
const PATH_TO_KEY = new Map(LANDING_PAGES.map((page) => [page.path, page.key]));

const PATH_BY_SOURCE = Object.freeze({
  'readers-agree': '/readers-agree',
  'readers-cheer': '/readers-cheer',
  'world-wondering': '/world-wondering',
  'sample-chapters': '/sample-chapters',
});

const CLICK_ID_KEYS = ['fbclid', 'gclid', 'ttclid', 'msclkid'];
const DUPLICATE_WINDOW_MS = 2000;

function visitorId(event) {
  const vid = event && event.meta ? event.meta.visitorId : null;
  return vid ? String(vid) : null;
}

function pathnameOf(event) {
  const raw = String((event && event.meta && event.meta.path) || '');
  const path = raw.split('?')[0];
  if (!path) return '';
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function eventTime(event) {
  const t = new Date(event && event.createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

function normalizeEntryPath(value) {
  const raw = String(value || '').trim().split('?')[0];
  if (!raw) return null;
  const path = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
  return PATH_TO_KEY.has(path) ? path : null;
}

/**
 * Stored-path helper retained for tests. Report attribution uses each event's
 * own entryPage and does not call this to inherit an earlier landing.
 * @returns {{ entryPage: string | null, persist: string | null }}
 */
function resolveEntryLanding({ stored, source, explicit } = {}) {
  const existing = normalizeEntryPath(stored);
  if (existing) return { entryPage: existing, persist: null };
  const chosen = normalizeEntryPath(explicit) || PATH_BY_SOURCE[source] || null;
  return { entryPage: chosen, persist: chosen };
}

function hasAdEvidence(meta) {
  const m = meta || {};
  if (m.utm_source || m.utm_medium || m.utm_campaign || m.utm_content || m.utm_term) return true;
  if (CLICK_ID_KEYS.some((key) => m[key])) return true;
  if (m.src === 'ad') return true;
  if (m.origin === 'meta' || m.origin === 'tiktok' || m.origin === 'google' || m.origin === 'microsoft') {
    return true;
  }
  return false;
}

function currentLandingKey(event) {
  const meta = (event && event.meta) || {};
  const source = meta.source || '';
  const surface = meta.captureSurface || '';
  const path = pathnameOf(event);
  const type = (event && event.type) || '';

  if (source === 'readers-cheer' || surface === 'cheer' || path === '/readers-cheer') return 'readers-cheer';
  if (source === 'world-wondering' || path === '/world-wondering' || type.startsWith('WORLD_WONDERING_')) {
    return 'world-wondering';
  }
  if (
    source === 'readers-agree' ||
    source === 'readers-agree-bridge' ||
    path === '/readers-agree' ||
    path.startsWith('/readers-agree/')
  ) {
    return 'readers-agree';
  }
  if (source === 'sample-chapters' || path === '/sample-chapters' || type === T.SAMPLE_CHAPTERS_PAGE_VIEW) {
    return 'sample-chapters';
  }
  if (type === T.MARKETING_CONSENT_GRANTED) {
    if (surface === 'cheer' || meta.entryPage === '/readers-cheer') return 'readers-cheer';
    if (surface === 'bridge' || surface === 'landing' || meta.entryPage === '/readers-agree') return 'readers-agree';
    return null;
  }
  if (type.startsWith('READERS_AGREE_')) {
    if (meta.entryPage === '/readers-cheer') return 'readers-cheer';
    if (source === 'world-wondering') return 'world-wondering';
    return 'readers-agree';
  }
  return null;
}

function isCheerSource(event) {
  const source = event && event.meta ? event.meta.source : '';
  if (source === 'readers-agree' || source === 'readers-agree-bridge') return false;
  return currentLandingKey(event) === 'readers-cheer';
}

function isLandingObservation(event, key) {
  const type = (event && event.type) || '';
  if (type === T.READERS_AGREE_PAGE_VIEW || type === T.WORLD_WONDERING_PAGE_VIEW || type === T.SAMPLE_CHAPTERS_PAGE_VIEW) {
    return true;
  }
  if (key === 'world-wondering' && (type.startsWith('WORLD_WONDERING_') || type === T.READERS_AGREE_AMAZON_CLICK || type === T.READERS_AGREE_BN_CLICK)) {
    return true;
  }
  if ((key === 'readers-agree' || key === 'readers-cheer') && type.startsWith('READERS_AGREE_')) return true;
  if (
    key === 'sample-chapters' &&
    (type === T.SAMPLE_CHAPTERS_PAGE_VIEW || type === T.SAMPLE_CHAPTERS_BUY_CLICK || type === T.SAMPLE_CHAPTERS_HUB_CLICK)
  ) {
    return true;
  }
  return false;
}

function entryCandidate(event) {
  const explicit = normalizeEntryPath(event && event.meta ? event.meta.entryPage : null);
  if (explicit) return PATH_TO_KEY.get(explicit);
  const current = currentLandingKey(event);
  if (current && isLandingObservation(event, current)) return current;
  return null;
}

function assignVisitorEntries(events) {
  /** @type {Map<string, { key: string, at: number }>} */
  const entryByVisitor = new Map();
  /** @type {Map<string, object[]>} */
  const grouped = new Map();
  for (const event of events) {
    const vid = visitorId(event);
    if (!vid) continue;
    if (!grouped.has(vid)) grouped.set(vid, []);
    grouped.get(vid).push(event);
  }
  for (const [vid, list] of grouped) {
    let found = null;
    let at = 0;
    for (const event of list) {
      const candidate = entryCandidate(event);
      if (!candidate) continue;
      const when = eventTime(event);
      if (!found || when < at) {
        found = candidate;
        at = when;
      }
    }
    if (found) entryByVisitor.set(vid, { key: found, at });
  }
  return entryByVisitor;
}

function entryKeyForEvent(event, _entryByVisitor) {
  const explicit = normalizeEntryPath(event && event.meta ? event.meta.entryPage : null);
  if (!explicit) return null;
  return PATH_TO_KEY.get(explicit) || null;
}

function campaignIdentity(meta) {
  const m = meta || {};
  let source = String(m.utm_source || m.origin || (m.src === 'ad' ? 'ad' : '') || '').trim();
  if (!source && CLICK_ID_KEYS.some((key) => m[key])) source = 'Advertising click id';
  if (!source) source = 'Unknown';
  return {
    source,
    medium: String(m.utm_medium || '').trim(),
    campaign: String(m.utm_campaign || '').trim() || 'Unknown',
    content: String(m.utm_content || '').trim(),
    term: String(m.utm_term || '').trim(),
  };
}

function rate(numerator, denominator, unavailable) {
  if (unavailable) {
    return { display: 'Not attributable', numerator: null, denominator, percent: null };
  }
  if (!denominator) {
    return { display: 'Insufficient data', numerator, denominator: 0, percent: null };
  }
  const percent = Math.round((numerator / denominator) * 1000) / 10;
  return {
    display: `${percent}% (${numerator} / ${denominator} unique visitors)`,
    numerator,
    denominator,
    percent,
  };
}

function countWhere(events, predicate) {
  let raw = 0;
  const ids = new Set();
  for (const event of events) {
    if (!predicate(event)) continue;
    raw += 1;
    const vid = visitorId(event);
    if (vid) ids.add(vid);
  }
  return { raw, uniqueVisitors: ids.size, ids };
}

function countDuplicateSubmissions(events) {
  const groups = new Map();
  for (const event of events) {
    const vid = visitorId(event);
    if (!vid) continue;
    const key = `${vid}|${event.type}|${event.meta?.path || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(eventTime(event));
  }
  let extra = 0;
  for (const times of groups.values()) {
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i += 1) {
      if (times[i] - times[i - 1] <= DUPLICATE_WINDOW_MS) extra += 1;
    }
  }
  return extra;
}

function attributePurchases(purchases, events, entryByVisitor) {
  const bySession = new Map();
  for (const event of events) {
    if (event.type !== T.PURCHASE_COMPLETED) continue;
    const sessionId = event.meta && event.meta.session_id ? String(event.meta.session_id) : '';
    if (!sessionId) continue;
    if (!bySession.has(sessionId)) bySession.set(sessionId, []);
    bySession.get(sessionId).push(event);
  }

  const attributed = [];
  let unattributed = 0;
  for (const purchase of purchases) {
    const sessionId = purchase && purchase.sessionId ? String(purchase.sessionId) : '';
    const matches = sessionId ? bySession.get(sessionId) || [] : [];
    const entries = new Set();
    let linkedVisitor = null;
    for (const event of matches) {
      const vid = visitorId(event);
      if (vid) linkedVisitor = vid;
      const entry = entryKeyForEvent(event, entryByVisitor);
      if (entry) entries.add(entry);
    }
    if (entries.size === 1 && linkedVisitor) {
      attributed.push({ sessionId, landing: [...entries][0], visitorId: linkedVisitor });
      continue;
    }
    unattributed += 1;
  }
  return { attributed, unattributed };
}

function sampleClickPredicate(pageKey) {
  return (event) => {
    if (currentLandingKey(event) !== pageKey) return false;
    if (pageKey === 'world-wondering') return event.type === T.WORLD_WONDERING_SAMPLE_CHAPTERS_CLICK;
    if (pageKey === 'readers-agree' || pageKey === 'readers-cheer') {
      return event.type === T.READERS_AGREE_SAMPLE_CHAPTERS_CLICK;
    }
    return false;
  };
}

function sampleClickNote(pageKey, raw) {
  if (pageKey === 'readers-agree' || pageKey === 'readers-cheer') {
    return raw
      ? 'Legacy sample-chapter button. Current sample entry on this page is the email submit.'
      : 'No sample-chapter click is recorded on the current page. Sample entry is the email submit.';
  }
  if (pageKey === 'world-wondering') return 'Explore the Book clicks. Not a confirmed read.';
  return 'This landing page has no separate sample-click event. Chapter opens are reading engagement.';
}

function buildCampaignRows(viewEvents) {
  const groups = new Map();
  for (const event of viewEvents) {
    const vid = visitorId(event);
    if (!vid) continue;
    const identity = campaignIdentity(event.meta);
    const key = [identity.source, identity.medium, identity.campaign, identity.content, identity.term].join('|');
    if (!groups.has(key)) groups.set(key, { ...identity, visitors: new Set() });
    groups.get(key).visitors.add(vid);
  }
  return [...groups.values()]
    .map((row) => ({
      source: row.source,
      medium: row.medium || '—',
      campaign: row.campaign,
      content: row.content || '—',
      term: row.term || '—',
      uniqueVisitors: row.visitors.size,
    }))
    .sort((a, b) => b.uniqueVisitors - a.uniqueVisitors || a.source.localeCompare(b.source));
}

function pageViewType(pageKey) {
  if (pageKey === 'world-wondering') return T.WORLD_WONDERING_PAGE_VIEW;
  if (pageKey === 'sample-chapters') return T.SAMPLE_CHAPTERS_PAGE_VIEW;
  return T.READERS_AGREE_PAGE_VIEW;
}

/**
 * @param {object[]} events
 * @param {{ sessionId?: string | null }[]} purchases
 */
function buildLandingPerformance(events, purchases) {
  const list = Array.isArray(events) ? events : [];
  const purchaseRows = Array.isArray(purchases) ? purchases : [];
  const entryByVisitor = assignVisitorEntries(list);
  const purchaseLink = attributePurchases(purchaseRows, list, entryByVisitor);

  const pages = LANDING_PAGES.map((page) => {
    const views = countWhere(
      list,
      (event) => event.type === pageViewType(page.key) && currentLandingKey(event) === page.key,
    );
    const adViews = countWhere(
      list,
      (event) =>
        event.type === pageViewType(page.key) &&
        currentLandingKey(event) === page.key &&
        hasAdEvidence(event.meta),
    );
    const sampleClicks = countWhere(list, sampleClickPredicate(page.key));
    const reading = countWhere(
      list,
      (event) => event.type === T.SAMPLE_CHAPTER_OPEN && entryKeyForEvent(event, entryByVisitor) === page.key,
    );
    const emails = countWhere(
      list,
      (event) => event.type === T.READERS_AGREE_EMAIL_SUBMITTED && currentLandingKey(event) === page.key,
    );
    const consent = countWhere(
      list,
      (event) => event.type === T.MARKETING_CONSENT_GRANTED && currentLandingKey(event) === page.key,
    );
    const catalogs = countWhere(
      list,
      (event) => event.type === T.CATALOG_PAGE_VIEW && entryKeyForEvent(event, entryByVisitor) === page.key,
    );
    const amazon = countWhere(
      list,
      (event) => event.type === T.READERS_AGREE_AMAZON_CLICK && currentLandingKey(event) === page.key,
    );
    const bn = countWhere(
      list,
      (event) => event.type === T.READERS_AGREE_BN_CLICK && currentLandingKey(event) === page.key,
    );
    const checkouts = countWhere(
      list,
      (event) => event.type === T.CHECKOUT_STARTED && entryKeyForEvent(event, entryByVisitor) === page.key,
    );
    const buyDirect = countWhere(
      list,
      (event) => event.type === T.READERS_AGREE_BUY_DIRECT_CLICK && currentLandingKey(event) === page.key,
    );
    const attributedPurchases = purchaseLink.attributed.filter((row) => row.landing === page.key);

    const readingWithoutVisitor = list.filter(
      (event) => event.type === T.SAMPLE_CHAPTER_OPEN && !visitorId(event),
    ).length;
    const catalogWithoutVisitor = list.filter(
      (event) => event.type === T.CATALOG_PAGE_VIEW && !visitorId(event),
    ).length;
    const checkoutWithoutVisitor = list.filter(
      (event) => event.type === T.CHECKOUT_STARTED && !visitorId(event),
    ).length;

    const gaps = [];
    const viewsMissingVisitor = list.filter(
      (event) => event.type === pageViewType(page.key) && currentLandingKey(event) === page.key && !visitorId(event),
    ).length;
    if (viewsMissingVisitor) gaps.push(`${viewsMissingVisitor} page views have no visitor id.`);
    if (!views.uniqueVisitors && views.raw) gaps.push('Page views cannot be deduplicated without a visitor id.');

    const purchaseRateUnavailable = attributedPurchases.length === 0 && purchaseLink.unattributed > 0;

    return {
      key: page.key,
      label: page.label,
      path: page.path,
      metrics: [
        metric('page_views', 'Page views', views.raw, views.uniqueVisitors, 'Raw loads of this page. Unique visitors are people, not refreshes.'),
        metric('ad_attributed_visitors', 'Ad-attributed visitors', adViews.raw, adViews.uniqueVisitors, 'Visitors whose view of this page carried utm, src=ad, origin, or a click id. Click ids are not shown.'),
        metric('sample_clicks', 'Sample chapter clicks', sampleClicks.raw, sampleClicks.uniqueVisitors, sampleClickNote(page.key, sampleClicks.raw)),
        metric('reading', 'Reading engagement', reading.raw, reading.uniqueVisitors, 'Sample chapter opens that record this page as the visit entry. Opens with no visit entry stay unknown.'),
        metric('email', 'Email access submissions', emails.raw, emails.uniqueVisitors, 'Reading-access registrations. This is not marketing consent.'),
        metric('marketing_consent', 'Marketing consent granted', consent.raw, consent.uniqueVisitors, 'Explicit optional consent only. An email submit without this event is not consent.'),
        metric('catalog', 'Catalog visits', catalogs.raw, catalogs.uniqueVisitors, 'Catalog views that record this page as the visit entry. Not a sale. Views with no visit entry stay unknown.'),
        metric('buy_direct', 'Buy Direct clicks', buyDirect.raw, buyDirect.uniqueVisitors, 'On-page Buy Direct clicks. Not a checkout and not a sale.'),
        metric('amazon', 'Amazon outbound clicks', amazon.raw, amazon.uniqueVisitors, 'Outbound retailer clicks. Not confirmed Amazon sales.'),
        metric('bn', 'Barnes & Noble outbound clicks', bn.raw, bn.uniqueVisitors, 'Outbound retailer clicks. Not confirmed Barnes & Noble sales.'),
        metric('checkout', 'Checkout initiations', checkouts.raw, checkouts.uniqueVisitors, 'Checkouts that record this page as the visit entry. Not a sale. Checkouts with no visit entry stay unknown.'),
        metric(
          'verified_purchases',
          'Attributed verified purchases',
          attributedPurchases.length,
          null,
          'Server Purchase rows whose success event records this visit entry. Sales with no visit entry stay unattributed.',
        ),
      ],
      rates: {
        sampleEngagement: rate(
          reading.uniqueVisitors,
          views.uniqueVisitors,
          reading.uniqueVisitors === 0 && readingWithoutVisitor > 0 && views.uniqueVisitors > 0,
        ),
        catalog: rate(
          catalogs.uniqueVisitors,
          views.uniqueVisitors,
          catalogs.uniqueVisitors === 0 && catalogWithoutVisitor > 0 && views.uniqueVisitors > 0,
        ),
        checkout: rate(
          checkouts.uniqueVisitors,
          views.uniqueVisitors,
          checkouts.uniqueVisitors === 0 && checkoutWithoutVisitor > 0 && views.uniqueVisitors > 0,
        ),
        verifiedPurchase: rate(attributedPurchases.length, views.uniqueVisitors, purchaseRateUnavailable),
      },
      rateNotes: {
        sampleEngagement: 'Unique visitors with a chapter open ÷ unique visitors who viewed this page.',
        catalog: 'Unique visitors with a catalog view ÷ unique visitors who viewed this page.',
        checkout: 'Unique visitors who started checkout ÷ unique visitors who viewed this page.',
        verifiedPurchase: 'Attributed server purchases ÷ unique visitors who viewed this page. Not a retailer conversion.',
      },
      campaigns: buildCampaignRows(
        list.filter((event) => event.type === pageViewType(page.key) && currentLandingKey(event) === page.key),
      ),
      attributionGaps: gaps,
    };
  });

  const overviewVisitors = new Set();
  for (const page of LANDING_PAGES) {
    for (const event of list) {
      if (event.type === pageViewType(page.key) && currentLandingKey(event) === page.key) {
        const vid = visitorId(event);
        if (vid) overviewVisitors.add(vid);
      }
    }
  }

  const unknownVisitors = new Set();
  for (const event of list) {
    const vid = visitorId(event);
    if (!vid || overviewVisitors.has(vid)) continue;
    if (!entryByVisitor.has(vid)) unknownVisitors.add(vid);
  }

  const legacy = {
    READERS_AGREE_BUY_CLICK: list.filter((event) => event.type === T.READERS_AGREE_BUY_CLICK).length,
    READERS_AGREE_SAMPLE_CHAPTERS_CLICK: list.filter((event) => event.type === T.READERS_AGREE_SAMPLE_CHAPTERS_CLICK).length,
    READERS_AGREE_START_READING_CLICK: list.filter((event) => event.type === T.READERS_AGREE_START_READING_CLICK).length,
  };

  const retailerClicks = list.filter(
    (event) => event.type === T.READERS_AGREE_AMAZON_CLICK || event.type === T.READERS_AGREE_BN_CLICK,
  ).length;

  return {
    pages,
    overview: {
      uniqueVisitors: overviewVisitors.size,
      verifiedDirectPurchases: purchaseRows.length,
      attributedVerifiedPurchases: purchaseLink.attributed.length,
      unattributedVerifiedPurchases: purchaseLink.unattributed,
      retailerOutboundClicks: retailerClicks,
      unknownVisitors: unknownVisitors.size,
      campaigns: buildCampaignRows(
        list.filter((event) => {
          const key = currentLandingKey(event);
          return key && event.type === pageViewType(key);
        }),
      ),
      measurementEnds:
        'A verified purchase is a server Purchase row. It is attributed only when a success-page event has the same Stripe session id and that event records one visit entry. A success page alone is not a sale. Amazon and Barnes & Noble clicks are not retailer sales. Reading, catalog, checkout, and purchase follow the visit entry on the event. A later visit is not assigned to an earlier landing. Activity with no visit entry is unknown. Stored events are not rewritten. Click identifiers are omitted from this report.',
    },
    diagnostics: {
      missingVisitorId: list.filter((event) => !visitorId(event)).length,
      missingLandingMetadata: list.filter((event) => {
        const type = event.type;
        const isView = type === T.READERS_AGREE_PAGE_VIEW || type === T.WORLD_WONDERING_PAGE_VIEW || type === T.SAMPLE_CHAPTERS_PAGE_VIEW;
        return isView && !currentLandingKey(event);
      }).length,
      unknownSourceVisitors: countWhere(
        list,
        (event) => {
          const key = currentLandingKey(event);
          return Boolean(key) && event.type === pageViewType(key) && !hasAdEvidence(event.meta);
        },
      ).uniqueVisitors,
      duplicateSubmissions: countDuplicateSubmissions(list),
      unmatchedCheckouts: list.filter(
        (event) => event.type === T.CHECKOUT_STARTED && !entryKeyForEvent(event, entryByVisitor),
      ).length,
      unknownVisitActivity: list.filter((event) => {
        const tracked =
          event.type === T.SAMPLE_CHAPTER_OPEN ||
          event.type === T.CATALOG_PAGE_VIEW ||
          event.type === T.CHECKOUT_STARTED ||
          event.type === T.PURCHASE_COMPLETED;
        return tracked && visitorId(event) && !entryKeyForEvent(event, entryByVisitor);
      }).length,
      unmatchedPurchases: purchaseLink.unattributed,
      legacyEvents: legacy,
      eventsWithoutLanding: list.filter((event) => !currentLandingKey(event) && !entryKeyForEvent(event, entryByVisitor)).length,
    },
  };
}

function metric(key, label, raw, uniqueVisitors, note) {
  return { key, label, raw, uniqueVisitors, note };
}

module.exports = {
  LANDING_PAGES,
  LANDING_KEYS,
  CLICK_ID_KEYS,
  resolveEntryLanding,
  normalizeEntryPath,
  hasAdEvidence,
  currentLandingKey,
  isCheerSource,
  entryCandidate,
  assignVisitorEntries,
  entryKeyForEvent,
  campaignIdentity,
  buildLandingPerformance,
  visitorId,
};
