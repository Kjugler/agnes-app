const express = require('express');
const { prisma } = require('../prisma.cjs');

const router = express.Router();

function isAdminAuthorized(req) {
  if (process.env.NODE_ENV === 'development') return true;
  const key = req.headers['x-admin-key'];
  return !!process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

router.use((req, res, next) => {
  if (!isAdminAuthorized(req)) {
    return res.status(403).json({ error: 'Forbidden - x-admin-key required in production' });
  }
  next();
});

router.post('/set-override', async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const hasOverrideEligible = typeof req.body?.overrideEligible === 'boolean';
    const overrideEligible = req.body?.overrideEligible === true;
    const hasOverrideAmount = Object.prototype.hasOwnProperty.call(req.body || {}, 'overrideAmount');
    const overrideAmountRaw = Number(req.body?.overrideAmount);
    const overrideAmount = Number.isFinite(overrideAmountRaw) ? overrideAmountRaw : null;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ ok: false, error: 'Valid email is required' });
    }
    if (!hasOverrideEligible) {
      return res.status(400).json({ ok: false, error: 'overrideEligible (boolean) is required' });
    }
    if (hasOverrideAmount && (overrideAmount === null || overrideAmount < 0)) {
      return res.status(400).json({ ok: false, error: 'overrideAmount must be a number >= 0 when provided' });
    }

    const updated = await prisma.user.update({
      where: { email },
      data: {
        overrideEligible,
        ...(hasOverrideAmount ? { overrideAmount } : {}),
      },
      select: {
        id: true,
        email: true,
        overrideEligible: true,
        overrideAmount: true,
      },
    });

    return res.json({
      ok: true,
      user: updated,
      payoutPolicy: 'Override payout uses a fixed $3.00 pool per purchase, split across connected overrideEligible reps.',
      overrideAmountNotice:
        'overrideAmount is informational/deprecated and is not used to calculate payout size.',
    });
  } catch (err) {
    if (err?.code === 'P2025') {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    console.error('[adminUsers] set-override', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' });
  }
});

router.get('/overrides', async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { overrideEligible: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        fname: true,
        lname: true,
        overrideEligible: true,
        overrideAmount: true,
      },
      orderBy: { email: 'asc' },
    });

    return res.json({
      ok: true,
      count: users.length,
      payoutPolicy: 'Override payout uses a fixed $3.00 pool per purchase, split across connected overrideEligible reps.',
      users,
    });
  } catch (err) {
    console.error('[adminUsers] overrides', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' });
  }
});

module.exports = router;
