// GET /api/admin/sales-ledger — Purchase + Order + product resolution (ledger / referral / order presence)
// Auth: x-admin-key (or dev bypass). Uses prisma + fulfillmentPrisma for split-DB parity.

const express = require('express');
const { prisma, fulfillmentPrisma, ensureDatabaseUrl } = require('../prisma.cjs');

const router = express.Router();

const MAX_ROWS = 2500;

function isAuthorized(req) {
  if (process.env.NODE_ENV === 'development') return true;
  const key = req.headers['x-admin-key'];
  return !!process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

router.use((req, res, next) => {
  if (!isAuthorized(req)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  next();
});

const PRODUCT_LABELS = {
  paperback: 'Paperback',
  ebook: 'eBook',
  audio_preorder: 'Audio preorder',
  unknown: 'Unknown',
};

function normalizeProduct(raw) {
  if (!raw || typeof raw !== 'string') return 'unknown';
  const s = raw.trim().toLowerCase();
  if (s === 'paperback' || s === 'ebook' || s === 'audio_preorder') return s;
  return 'unknown';
}

function productFromLedgerMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  return meta.product || null;
}

function formatBuyerName(u) {
  if (!u) return '';
  const first = (u.firstName || u.fname || '').trim();
  const last = (u.lname || '').trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return '';
}

function formatAmountCents(cents, currency) {
  if (cents == null || Number.isNaN(Number(cents))) return '—';
  const n = (Number(cents) / 100).toFixed(2);
  const c = (currency || 'usd').toUpperCase();
  return `$${n} ${c}`;
}

/**
 * @param {string} productType
 * @param {{ saleStatus: string }} purchase
 * @param {object | null} order
 */
function shippingStatus(productType, purchase, order) {
  if (productType === 'ebook' || productType === 'audio_preorder') {
    return { key: 'na', label: 'N/A' };
  }
  if (productType === 'unknown') {
    if (!order) {
      return { key: 'na', label: 'N/A' };
    }
  }

  const purArchived = purchase.saleStatus === 'archived_beta';
  const ordArchived = order && order.saleStatus === 'archived_beta';
  if (purArchived || ordArchived) {
    return { key: 'archived_beta', label: 'Archived Beta' };
  }

  if (productType === 'paperback' || order) {
    if (!order) {
      return { key: 'open', label: 'Open' };
    }
    if (order.shippedAt) {
      return { key: 'shipped', label: 'Shipped' };
    }
    if (order.labelPrintedAt) {
      return { key: 'label_printed', label: 'Label Printed' };
    }
    return { key: 'open', label: 'Open' };
  }

  return { key: 'na', label: 'N/A' };
}

router.get('/sales-ledger', async (req, res) => {
  try {
    ensureDatabaseUrl();
    if (!prisma) {
      return res.status(500).json({ ok: false, error: 'database_unavailable' });
    }
    const fp = fulfillmentPrisma || prisma;

    const q = req.query || {};
    const now = new Date();

    function parseDay(s, which) {
      if (!s) return null;
      const str = String(s).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return which === 'end' ? new Date(`${str}T23:59:59.999Z`) : new Date(`${str}T00:00:00.000Z`);
      }
      const d = new Date(str);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    let end = q.end != null && q.end !== '' ? parseDay(String(q.end), 'end') : now;
    let start =
      q.start != null && q.start !== ''
        ? parseDay(String(q.start), 'start')
        : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (end == null) end = now;
    if (start == null) start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ ok: false, error: 'invalid_date' });
    }
    if (start > end) {
      const t = start;
      start = end;
      end = t;
    }

    const productFilter = String(q.product || 'all').toLowerCase();
    const saleStatusFilter = String(q.saleStatus || 'all').toLowerCase();
    const shippingFilter = String(q.shipping || 'all').toLowerCase();

    const purchaseWhere = {
      createdAt: { gte: start, lte: end },
    };

    const purchases = await prisma.purchase.findMany({
      where: purchaseWhere,
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            fname: true,
            lname: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS + 1,
    });

    const capped = purchases.length > MAX_ROWS;
    const list = capped ? purchases.slice(0, MAX_ROWS) : purchases;
    const sessionIds = list.map((p) => p.sessionId).filter(Boolean);

    const [orders, conversions, ledgerRows] = await Promise.all([
      sessionIds.length
        ? fp.order.findMany({
            where: { stripeSessionId: { in: sessionIds } },
          })
        : [],
      sessionIds.length
        ? prisma.referralConversion.findMany({
            where: { stripeSessionId: { in: sessionIds } },
            select: { stripeSessionId: true, product: true },
          })
        : [],
      sessionIds.length
        ? prisma.ledger.findMany({
            where: {
              sessionId: { in: sessionIds },
              type: 'PURCHASE_RECORDED',
            },
            select: { sessionId: true, meta: true },
          })
        : [],
    ]);

    const orderBySession = new Map(orders.map((o) => [o.stripeSessionId, o]));
    const convBySession = new Map(conversions.map((c) => [c.stripeSessionId, c]));
    const ledgerBySession = new Map();
    for (const row of ledgerRows) {
      if (row.sessionId && !ledgerBySession.has(row.sessionId)) {
        ledgerBySession.set(row.sessionId, row);
      }
    }

    const rows = [];

    for (const p of list) {
      const sid = p.sessionId;
      const order = orderBySession.get(sid) || null;
      const conv = convBySession.get(sid);
      const led = ledgerBySession.get(sid);
      let productType = normalizeProduct(conv?.product) || normalizeProduct(productFromLedgerMeta(led?.meta));
      if (productType === 'unknown' && order) {
        productType = 'paperback';
      }

      const ship = shippingStatus(productType, p, order);

      const row = {
        orderDate: p.createdAt.toISOString(),
        buyerName: formatBuyerName(p.user) || '—',
        buyerEmail: p.user?.email || '—',
        productType,
        productTypeLabel: PRODUCT_LABELS[productType] || PRODUCT_LABELS.unknown,
        amount: formatAmountCents(p.amount, p.currency),
        saleStatus: p.saleStatus || 'live',
        shippingStatusLabel: ship.label,
        shippingStatusKey: ship.key,
        countsForPoints: !!p.countsForPoints,
        countsForPointsLabel: p.countsForPoints ? 'Yes' : 'No',
        countsForShipping: !!p.countsForShipping,
        countsForShippingLabel: p.countsForShipping ? 'Yes' : 'No',
        sessionId: sid,
        orderId: order ? order.id : null,
        purchaseId: p.id,
        userId: p.userId,
      };

      if (productFilter !== 'all' && productType !== productFilter) continue;
      if (saleStatusFilter !== 'all' && (p.saleStatus || 'live') !== saleStatusFilter) continue;
      if (shippingFilter !== 'all' && ship.key !== shippingFilter) continue;

      rows.push(row);
    }

    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      range: { start: start.toISOString(), end: end.toISOString() },
      meta: {
        totalInRange: list.length,
        rowCount: rows.length,
        capped,
        maxRows: MAX_ROWS,
        fulfillmentDbSplit: fp !== prisma,
      },
      rows,
    });
  } catch (err) {
    console.error('[admin/sales-ledger]', err);
    return res.status(500).json({
      ok: false,
      error: err?.message || 'server_error',
    });
  }
});

module.exports = router;
