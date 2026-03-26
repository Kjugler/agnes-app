// deepquill/api/contest/terminalDiscovery.cjs
// SPEC 3: Award 250 bonus points for discovering the hidden terminal path.
// Idempotent: only one award per user (terminalDiscoveryAwarded flag).

const { prisma } = require('../../server/prisma.cjs');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { LedgerType } = require('@prisma/client');
const { recordLedgerEntry } = require('../../lib/ledger/recordLedger.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');

const TERMINAL_BONUS_POINTS = 250;

async function handleTerminalDiscovery(req, res) {
  try {
    ensureDatabaseUrl();

    // Resolve user from cookies (email)
    const cookieHeader = req.headers.cookie || '';
    const contestEmailMatch = cookieHeader.match(/contest_email=([^;]+)/);
    const userEmailMatch = cookieHeader.match(/user_email=([^;]+)/);
    const associateEmailMatch = cookieHeader.match(/associate_email=([^;]+)/);
    const emailRaw = contestEmailMatch?.[1] || userEmailMatch?.[1] || associateEmailMatch?.[1];
    const headerEmail = req.headers['x-user-email'];

    const email = normalizeEmail(headerEmail || (emailRaw ? decodeURIComponent(emailRaw) : null));
    if (!email) {
      return res.status(400).json({ ok: false, error: 'User must be logged in' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, terminalDiscoveryAwarded: true, points: true },
    });

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    if (user.terminalDiscoveryAwarded) {
      return res.json({
        ok: true,
        awarded: false,
        alreadyAwarded: true,
        pointsAwarded: 0,
        newTotalPoints: user.points,
      });
    }

    // Award: ledger entry + update user flag
    await recordLedgerEntry(prisma, {
      sessionId: 'terminal_discovery_bonus',
      userId: user.id,
      type: LedgerType.TERMINAL_DISCOVERY_BONUS,
      points: TERMINAL_BONUS_POINTS,
      note: 'Terminal Discovery Bonus',
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        terminalDiscoveryAwarded: true,
        points: { increment: TERMINAL_BONUS_POINTS },
      },
    });

    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: { points: true },
    });

    return res.json({
      ok: true,
      awarded: true,
      alreadyAwarded: false,
      pointsAwarded: TERMINAL_BONUS_POINTS,
      newTotalPoints: fresh?.points ?? user.points + TERMINAL_BONUS_POINTS,
    });
  } catch (err) {
    console.error('[contest/terminal-discovery] error', err);
    return res.status(500).json({ ok: false, error: 'Failed to award terminal discovery bonus' });
  }
}

module.exports = handleTerminalDiscovery;
