// deepquill/api/associate/status.cjs
// Get associate status - canonical DB owner

const { prisma } = require('../../server/prisma.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { hasContestJoin } = require('../../lib/contest/hasContestJoin.cjs');

async function handleAssociateStatus(req, res) {
  try {
    ensureDatabaseUrl();
    
    // [PRINCIPAL] Resolve canonical principal identity
    const cookieHeader = req.headers.cookie || '';
    const userIdMatch = cookieHeader.match(/contest_user_id=([^;]+)/);
    const userIdCookie = userIdMatch?.[1] ? decodeURIComponent(userIdMatch[1]) : null;
    
    const headerEmail = req.headers['x-user-email'];
    const queryEmail = req.query?.email;
    const cookieEmail = req.cookies?.contest_email || req.cookies?.mockEmail || req.cookies?.user_email || req.cookies?.associate_email || null;

    let userId = userIdCookie;
    let email = null;
    let principalResolutionMethod = 'none';

    // Resolve by userId cookie (canonical)
    if (userIdCookie) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userIdCookie },
          select: { id: true, email: true },
        });
        if (user) {
          userId = user.id;
          email = user.email;
          principalResolutionMethod = 'cookie_userId';
          console.log('[PRINCIPAL] Principal resolved by userId cookie', { userId, email });
        } else {
          console.warn('[PRINCIPAL] MISMATCH - userId cookie provided but User not found', { userIdCookie });
        }
      } catch (err) {
        console.error('[PRINCIPAL] Error looking up user by userId cookie', { userIdCookie, error: err });
      }
    }

    // Fallback: Resolve by email
    if (!userId || !email) {
      const emailRaw = cookieEmail || headerEmail || queryEmail;
      if (emailRaw) {
        email = normalizeEmail(emailRaw);
        if (email) {
          principalResolutionMethod = userIdCookie ? 'email_fallback' : 'email';
          console.log('[PRINCIPAL] Principal resolved by email', {
            email,
            method: principalResolutionMethod,
            hadUserIdCookie: !!userIdCookie,
          });
        }
      }
    }

    if (!email && !userId) {
      console.warn('[PRINCIPAL] Principal NOT resolved - no userId or email available');
      return res.status(200).json({
        ok: true,
        hasAssociate: false,
        reason: 'anonymous',
        contestJoined: false,
        id: null,
        email: null,
      });
    }

    const select = {
      id: true,
      email: true,
      fname: true,
      lname: true,
      firstName: true,
      code: true,
      referralCode: true,
      handleX: true,
      handleInstagram: true,
      handleTiktok: true,
      handleTruth: true,
      contestJoinedAt: true,
    };

    let user = null;
    if (userId) {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select,
      });
    }

    if (!user && email) {
      user = await prisma.user.findUnique({
        where: { email },
        select,
      });
    }

    let newlyCreated = false;

    // [PRINCIPAL] Log final resolution
    console.log('[PRINCIPAL] Principal resolved for associate/status', {
      userId: userId || user?.id || 'MISSING',
      email: email || user?.email || 'MISSING',
      method: principalResolutionMethod,
    });

    if (!user) {
      return res.json({
        ok: true,
        id: null,
        email,
        hasProfile: false,
        hasJoinedContest: false,
        contestJoined: false, // R3: Explicit boolean field
        newlyCreated,
      });
    }

    const firstName = user.firstName || user.fname || null;
    const lastName = user.lname || null;
    const hasProfile = Boolean(firstName || lastName);
    const name =
      firstName && lastName
        ? `${firstName} ${lastName}`
        : firstName || lastName || null;

    // B1: Check if user has joined the contest - LEDGER ONLY (single source of truth)
    // Use hasContestJoin helper (ledger-driven)
    const contestJoined = await hasContestJoin(prisma, user.id);

    return res.json({
      ok: true,
      id: user.id,
      email: user.email,
      firstName,
      lastName,
      name,
      code: user.referralCode || user.code || null,
      hasProfile,
      hasJoinedContest: contestJoined, // R3: Ledger-driven only
      contestJoined, // R3: Explicit boolean field (ledger-driven)
      newlyCreated,
      handles: {
        x: user.handleX,
        instagram: user.handleInstagram,
        tiktok: user.handleTiktok,
        truth: user.handleTruth,
      },
    });
  } catch (err) {
    console.error('[associate/status] error', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

module.exports = handleAssociateStatus;
