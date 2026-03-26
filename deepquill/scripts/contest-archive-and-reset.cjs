/**
 * Phase 2–3: Archive contest-related tables, verify, then Tier B ledger reset + User fields.
 *
 * Usage:
 *   cd deepquill
 *   node scripts/contest-archive-and-reset.cjs archive
 *   node scripts/contest-archive-and-reset.cjs reset
 *
 * Reset requires: CONFIRM_TIER_B_RESET=1
 * Loads .env from deepquill root (same as server).
 */

const fs = require('fs');
const path = require('path');

const deepquillRoot = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(deepquillRoot, '.env.local'), override: false });
require('dotenv').config({ path: path.join(deepquillRoot, '.env'), override: false });

const { prisma, ensureDatabaseUrl } = require('../server/prisma.cjs');
const { getPointsRollupForUser } = require('../lib/pointsRollup.cjs');
const { hasContestJoin } = require('../lib/contest/hasContestJoin.cjs');

/** Ledger types removed in Tier B (full leaderboard reset). */
const TIER_B_LEDGER_TYPES = [
  'CONTEST_JOIN',
  'CONTEST_EXPLICIT_ENTRY',
  'TERMINAL_DISCOVERY_BONUS',
  'SHARE_X',
  'SHARE_IG',
  'SHARE_FB',
  'SHARE_TRUTH',
  'SHARE_TT',
  'SUBSCRIBE_DIGEST',
  'TRIVIA',
  'RABBIT_BONUS',
  'SIGNUP_BONUS',
  'SIGNAL_APPROVED',
  'REVIEW_APPROVED',
  'PURCHASE_RECORDED',
  'POINTS_AWARDED_PURCHASE',
  'POINTS_SKIPPED_PURCHASE',
  'PURCHASE_BOOK',
  'REFER_FRIEND_PAYOUT',
  'REFER_EMAIL',
  'REFER_PURCHASE',
  'ASSOCIATE_PAYOUT',
  'MANUAL_ADJUST',
  'REFERRAL_DISCOUNT_APPLIED',
  'REFERRAL_COMMISSION_EARNED',
  'REFERRAL_POINTS_AWARDED',
  'FRIEND_SAVINGS_CREDITED',
  'REFERRAL_SKIPPED',
];

function getDbUrlSafe() {
  ensureDatabaseUrl();
  const u = process.env.DATABASE_URL || '';
  if (u.startsWith('file:')) return { display: u.replace(/^file:/, ''), full: u };
  return { display: '(non-file URL — not printed)', full: u };
}

async function cmdArchive() {
  const db = getDbUrlSafe();
  console.log('[archive] Resolved DATABASE_URL file path:', db.display);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveDir = path.join(deepquillRoot, 'scripts', 'archive', `contest-archive-${stamp}`);
  const parent = path.dirname(archiveDir);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  if (fs.existsSync(archiveDir)) {
    console.error('[archive] Refusing to overwrite existing:', archiveDir);
    process.exit(1);
  }
  fs.mkdirSync(archiveDir, { recursive: true });

  console.log('[archive] Exporting to', archiveDir);

  const [ledger, users, purchases, referrals] = await Promise.all([
    prisma.ledger.findMany(),
    prisma.user.findMany(),
    prisma.purchase.findMany(),
    prisma.referralConversion.findMany(),
  ]);

  const manifest = {
    createdAt: new Date().toISOString(),
    databaseUrlFile: db.display,
    tables: {
      Ledger: ledger.length,
      User: users.length,
      Purchase: purchases.length,
      ReferralConversion: referrals.length,
    },
  };

  fs.writeFileSync(path.join(archiveDir, 'ledger.json'), JSON.stringify(ledger, bigintReplacer, 2), 'utf8');
  fs.writeFileSync(path.join(archiveDir, 'user.json'), JSON.stringify(users, bigintReplacer, 2), 'utf8');
  fs.writeFileSync(path.join(archiveDir, 'purchase.json'), JSON.stringify(purchases, bigintReplacer, 2), 'utf8');
  fs.writeFileSync(
    path.join(archiveDir, 'referralConversion.json'),
    JSON.stringify(referrals, bigintReplacer, 2),
    'utf8'
  );
  fs.writeFileSync(path.join(archiveDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  for (const f of ['ledger.json', 'user.json', 'purchase.json', 'referralConversion.json', 'manifest.json']) {
    const p = path.join(archiveDir, f);
    const st = fs.statSync(p);
    if (st.size === 0) {
      console.error('[archive] ERROR: zero-byte file', f);
      process.exit(1);
    }
  }

  console.log('[archive] OK row counts:', manifest.tables);
  console.log('[archive] Folder:', archiveDir);
  return { archiveDir, manifest };
}

function bigintReplacer(_key, value) {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

async function cmdVerify(archiveDir) {
  if (!archiveDir || !fs.existsSync(archiveDir)) {
    console.error('[verify] Pass archive dir: node ... verify <path>');
    process.exit(1);
  }
  const manifestPath = path.join(archiveDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('[verify] missing manifest.json');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const f of ['ledger.json', 'user.json', 'purchase.json', 'referralConversion.json']) {
    const p = path.join(archiveDir, f);
    const st = fs.statSync(p);
    console.log('[verify]', f, 'bytes=', st.size, st.size > 0 ? 'OK' : 'FAIL');
    if (st.size === 0) process.exit(1);
  }
  console.log('[verify] manifest tables:', manifest.tables);
  console.log('[verify] PASSED for', archiveDir);
}

async function cmdReset(archiveDir) {
  if (process.env.CONFIRM_TIER_B_RESET !== '1') {
    console.error('[reset] Set CONFIRM_TIER_B_RESET=1 after archive verification.');
    process.exit(1);
  }
  if (!archiveDir || !fs.existsSync(path.join(archiveDir, 'manifest.json'))) {
    console.error('[reset] Provide verified archive dir: node ... reset <archiveDir>');
    process.exit(1);
  }

  ensureDatabaseUrl();
  const beforeTierB = await prisma.ledger.count({ where: { type: { in: TIER_B_LEDGER_TYPES } } });
  const beforeTotal = await prisma.ledger.count();

  const del = await prisma.ledger.deleteMany({
    where: { type: { in: TIER_B_LEDGER_TYPES } },
  });

  const updated = await prisma.user.updateMany({
    data: {
      points: 0,
      contestJoinedAt: null,
      terminalDiscoveryAwarded: false,
    },
  });

  const afterTierB = await prisma.ledger.count({ where: { type: { in: TIER_B_LEDGER_TYPES } } });
  const afterTotal = await prisma.ledger.count();

  const sampleUsers = await prisma.user.findMany({ take: 5, select: { id: true, email: true, points: true } });
  console.log('[reset] deleted ledger rows (Tier B types):', del.count);
  console.log('[reset] users updated:', updated.count);
  console.log('[reset] ledger count before (tier-b types / all):', beforeTierB, '/', beforeTotal);
  console.log('[reset] ledger count after (tier-b types / all):', afterTierB, '/', afterTotal);

  for (const u of sampleUsers) {
    const rollup = await getPointsRollupForUser(prisma, u.id);
    const joined = await hasContestJoin(prisma, u.id);
    console.log('[reset-verify] user', u.email, 'points field=', u.points, 'rollup.total=', rollup.totalPoints, 'joined=', joined);
  }

  const mismatch = await prisma.user.findFirst({ where: { points: { not: 0 } } });
  if (mismatch) {
    console.warn('[reset] WARNING: some users still have points != 0:', mismatch.id);
  } else {
    console.log('[reset] All User.points are 0');
  }
}

const cmd = process.argv[2];
const argDir = process.argv[3];

(async () => {
  try {
    if (cmd === 'archive') {
      await cmdArchive();
    } else if (cmd === 'verify') {
      await cmdVerify(argDir);
    } else if (cmd === 'reset') {
      await cmdReset(argDir);
    } else {
      console.log('Commands: archive | verify <dir> | reset <archiveDir>');
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})();
