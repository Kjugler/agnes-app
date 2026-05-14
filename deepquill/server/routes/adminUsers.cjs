const express = require('express');
const { prisma } = require('../prisma.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const {
  buildReferralLink,
  buildChapter9Link,
  buildDiscountCode,
  buildReadyToSendMessage,
  normalizeRepRole,
  validateRepReferralCode,
} = require('../../lib/repOverrideAdmin.cjs');

const { sendClaimReaderProfileEmail } = require('../../lib/email/resendPurchaseEmails.cjs');

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

function repResponsePayload(user) {
  const referralCode = user.referralCode || user.code;
  const referralLink = buildReferralLink(referralCode);
  const chapter9Link = buildChapter9Link(referralCode);
  const discountCode = buildDiscountCode(referralCode);
  return {
    userId: user.id,
    displayName: user.firstName || user.fname || user.email || '',
    email: user.email,
    role: user.overrideRepRole || null,
    referralCode,
    referralLink,
    chapter9Link,
    discountCode,
    overrideEligible: !!user.overrideEligible,
    readyToSendMessage: buildReadyToSendMessage(referralCode),
  };
}

/** List override reps for admin table */
router.get('/reps', async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [{ overrideEligible: true }, { overrideRepRole: { not: null } }],
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        fname: true,
        referralCode: true,
        code: true,
        preferredDiscountCode: true,
        overrideEligible: true,
        overrideRepRole: true,
      },
      orderBy: { email: 'asc' },
    });

    const rows = users.map((u) => {
      const referralCode = u.referralCode || u.code || '';
      const referralLink = referralCode ? buildReferralLink(referralCode) : '';
      const chapter9Link = referralCode ? buildChapter9Link(referralCode) : '';
      return {
        id: u.id,
        name: u.firstName || u.fname || '',
        email: u.email,
        role: u.overrideRepRole || '',
        referralCode,
        discountCode: u.preferredDiscountCode || (referralCode ? buildDiscountCode(referralCode) : ''),
        overrideActive: !!u.overrideEligible,
        referralLink,
        chapter9Link,
        readyToSendMessage: referralCode ? buildReadyToSendMessage(referralCode) : '',
      };
    });

    return res.json({
      ok: true,
      payoutNote:
        'Override payout: walk buyer/direct-sponsor upline; all eligible regional/podcasters share a $3.00 pool per purchase (integer cents, split evenly with remainder to first reps).',
      reps: rows,
    });
  } catch (err) {
    console.error('[adminUsers] reps list', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' });
  }
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
      payoutPolicy:
        'Override payout: eligible regional/podcasters in upline share a $3.00 pool per purchase (exact cent split; see GET /api/admin/users/reps).',
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
        overrideRepRole: true,
        referralCode: true,
        preferredDiscountCode: true,
      },
      orderBy: { email: 'asc' },
    });

    return res.json({
      ok: true,
      count: users.length,
      payoutPolicy:
        'Override payout: all eligible regional/podcasters in upline share a $3.00 pool per purchase (exact cent split).',
      users,
    });
  } catch (err) {
    console.error('[adminUsers] overrides', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' });
  }
});

/**
 * POST /api/admin/users/promote-rep
 */
router.post('/promote-rep', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || '');
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    const role = normalizeRepRole(req.body?.role);
    const preferredRaw = req.body?.preferredCode;

    if (!email) {
      return res.status(400).json({ ok: false, error: 'email is required' });
    }
    if (!role) {
      return res.status(400).json({ ok: false, error: 'role must be regional or podcaster' });
    }
    if (!displayName) {
      return res.status(400).json({ ok: false, error: 'displayName is required' });
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        code: true,
        referralCode: true,
        firstName: true,
        fname: true,
        preferredDiscountCode: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ ok: false, error: 'User not found for email' });
    }

    let referralCode;
    if (preferredRaw && String(preferredRaw).trim()) {
      const cv = validateRepReferralCode(preferredRaw);
      if (!cv.ok) {
        return res.status(400).json({ ok: false, error: cv.error });
      }
      referralCode = cv.code;
    } else {
      const existingCode = String(existing.referralCode || existing.code || '')
        .trim()
        .toUpperCase();
      const ec = validateRepReferralCode(existingCode);
      if (ec.ok) {
        referralCode = ec.code;
      } else {
        const local = email.split('@')[0].replace(/[^a-zA-Z0-9]/gi, '').toUpperCase();
        const derived = local.slice(0, 12) || `REP${existing.id.replace(/[^A-Z0-9]/gi, '').slice(-4).toUpperCase()}`;
        const fc = validateRepReferralCode(derived);
        if (!fc.ok) {
          return res.status(400).json({
            ok: false,
            error: 'Could not derive a valid referral code; provide preferredCode (3–12 chars)',
          });
        }
        referralCode = fc.code;
      }
    }

    const conflict = await prisma.user.findFirst({
      where: {
        AND: [
          { id: { not: existing.id } },
          {
            OR: [{ referralCode: referralCode }, { code: referralCode }],
          },
        ],
      },
      select: { id: true, email: true },
    });

    if (conflict) {
      return res.status(409).json({
        ok: false,
        error: `Referral code "${referralCode}" is already used by another account`,
        conflictingEmail: conflict.email,
      });
    }

    const discountCode = buildDiscountCode(referralCode);

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        firstName: displayName,
        referralCode,
        code: referralCode,
        preferredDiscountCode: discountCode,
        overrideEligible: true,
        overrideRepRole: role,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        referralCode: true,
        code: true,
        preferredDiscountCode: true,
        overrideEligible: true,
        overrideRepRole: true,
      },
    });

    await prisma.event.create({
      data: {
        userId: updated.id,
        type: 'ADMIN_REP_PROMOTED',
        meta: {
          email: updated.email,
          referralCode,
          discountCode,
          role,
          source: 'promote-rep',
        },
      },
    });

    return res.json({ ok: true, ...repResponsePayload(updated) });
  } catch (err) {
    console.error('[adminUsers] promote-rep', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' });
  }
});

/**
 * POST /api/admin/users/replace-override-rep
 */
router.post('/replace-override-rep', async (req, res) => {
  try {
    const oldReferralCode = validateRepReferralCode(req.body?.oldReferralCode || '');
    const newEmail = normalizeEmail(req.body?.newEmail || '');
    const newDisplayName = typeof req.body?.newDisplayName === 'string' ? req.body.newDisplayName.trim() : '';
    const newRole = normalizeRepRole(req.body?.newRole);
    const newPreferred = req.body?.newPreferredCode;

    if (!oldReferralCode.ok) {
      return res.status(400).json({ ok: false, error: 'oldReferralCode invalid' });
    }
    if (!newEmail) {
      return res.status(400).json({ ok: false, error: 'newEmail required' });
    }
    if (!newDisplayName) {
      return res.status(400).json({ ok: false, error: 'newDisplayName required' });
    }
    if (!newRole) {
      return res.status(400).json({ ok: false, error: 'newRole must be regional or podcaster' });
    }

    const oldUser = await prisma.user.findFirst({
      where: {
        OR: [{ referralCode: oldReferralCode.code }, { code: oldReferralCode.code }],
      },
      select: { id: true, email: true, referralCode: true, code: true },
    });

    if (!oldUser) {
      return res.status(404).json({ ok: false, error: 'No user found for oldReferralCode' });
    }

    const newUser = await prisma.user.findUnique({
      where: { email: newEmail },
      select: {
        id: true,
        email: true,
        code: true,
        referralCode: true,
        firstName: true,
        fname: true,
      },
    });

    if (!newUser) {
      return res.status(404).json({ ok: false, error: 'newEmail user not found' });
    }

    let newReferralCode;
    if (newPreferred && String(newPreferred).trim()) {
      const pv = validateRepReferralCode(newPreferred);
      if (!pv.ok) {
        return res.status(400).json({ ok: false, error: pv.error });
      }
      newReferralCode = pv.code;
    } else {
      const local = newEmail.split('@')[0].replace(/[^a-zA-Z0-9]/gi, '').toUpperCase();
      const derived = local.slice(0, 12) || `REP${newUser.id.replace(/[^A-Z0-9]/gi, '').slice(-4).toUpperCase()}`;
      const dv = validateRepReferralCode(derived);
      if (!dv.ok) {
        return res.status(400).json({
          ok: false,
          error: 'Provide newPreferredCode (3–12 chars) — could not derive a valid code',
        });
      }
      newReferralCode = dv.code;
    }

    const conflict = await prisma.user.findFirst({
      where: {
        AND: [
          { id: { not: newUser.id } },
          {
            OR: [{ referralCode: newReferralCode }, { code: newReferralCode }],
          },
        ],
      },
      select: { id: true, email: true },
    });

    if (conflict) {
      return res.status(409).json({
        ok: false,
        error: `Referral code "${newReferralCode}" is already used by another account`,
        conflictingEmail: conflict.email,
      });
    }

    const discountCode = buildDiscountCode(newReferralCode);

    const result = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: oldUser.id },
        data: {
          overrideEligible: false,
        },
      });

      const promoted = await tx.user.update({
        where: { id: newUser.id },
        data: {
          firstName: newDisplayName,
          referralCode: newReferralCode,
          code: newReferralCode,
          preferredDiscountCode: discountCode,
          overrideEligible: true,
          overrideRepRole: newRole,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          referralCode: true,
          code: true,
          preferredDiscountCode: true,
          overrideEligible: true,
          overrideRepRole: true,
        },
      });

      await tx.event.create({
        data: {
          userId: promoted.id,
          type: 'ADMIN_OVERRIDE_REP_REPLACED',
          meta: {
            oldReferralCode: oldReferralCode.code,
            oldUserId: oldUser.id,
            oldEmail: oldUser.email,
            newUserId: promoted.id,
            newEmail: promoted.email,
            newReferralCode,
            newDiscountCode: discountCode,
            newRole,
          },
        },
      });

      return promoted;
    });

    console.log('[adminUsers] replace-override-rep', {
      oldReferralCode: oldReferralCode.code,
      newEmail: result.email,
      newReferralCode,
    });

    return res.json({
      ok: true,
      oldReferralCode: oldReferralCode.code,
      ...repResponsePayload(result),
    });
  } catch (err) {
    console.error('[adminUsers] replace-override-rep', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' });
  }
});

/**
 * POST /api/admin/users/disable-override
 */
router.post('/disable-override', async (req, res) => {
  try {
    const codeVal = validateRepReferralCode(req.body?.referralCode || '');
    if (!codeVal.ok) {
      return res.status(400).json({ ok: false, error: 'referralCode invalid' });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ referralCode: codeVal.code }, { code: codeVal.code }],
      },
      select: {
        id: true,
        email: true,
        referralCode: true,
        overrideEligible: true,
      },
    });

    if (!user) {
      return res.status(404).json({ ok: false, error: 'No user with that referral code' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { overrideEligible: false },
      select: { id: true, email: true, referralCode: true, overrideEligible: true },
    });

    await prisma.event.create({
      data: {
        userId: updated.id,
        type: 'ADMIN_OVERRIDE_DISABLED',
        meta: {
          referralCode: codeVal.code,
          email: updated.email,
        },
      },
    });

    return res.json({
      ok: true,
      userId: updated.id,
      email: updated.email,
      referralCode: updated.referralCode,
      overrideEligible: updated.overrideEligible,
    });
  } catch (err) {
    console.error('[adminUsers] disable-override', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' });
  }
});

/**
 * POST /api/admin/users/:userId/send-claim-profile-email
 */
router.post('/:userId/send-claim-profile-email', async (req, res) => {
  const userId = req.params.userId;
  if (!userId?.trim()) {
    return res.status(400).json({ ok: false, error: 'userId required' });
  }
  try {
    const out = await sendClaimReaderProfileEmail(prisma, userId.trim());
    if (out.error === 'user_not_found_or_missing_email') {
      return res.status(404).json({ ok: false, ...out });
    }
    if (out.error === 'no_purchase_for_user' || out.error === 'missing_customer_email') {
      return res.status(400).json({ ok: false, ...out });
    }
    if (!out.ok && out.error === 'mailchimp_not_configured') {
      return res.status(500).json({ ok: false, ...out });
    }
    const status = out.ok ? 200 : out.deliveryStatus === 'rejected' ? 502 : 500;
    return res.status(status).json({ ok: out.ok, ...out });
  } catch (err) {
    console.error('[adminUsers] send-claim-profile-email', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' });
  }
});

module.exports = router;
