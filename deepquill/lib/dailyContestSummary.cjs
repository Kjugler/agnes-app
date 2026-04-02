/**
 * Daily contest summary: top 3 by net ledger points earned in America/Denver calendar day,
 * placement awards (10 / 5 / 3), canonical DailyContestSummary row.
 */

const { startOfDenverDayUtc, endOfDenverDayUtc, previousDenverSummaryDateKey } = require('./denverTime.cjs');
const { getPointsRollupForUser } = require('./pointsRollup.cjs');

const PLACEMENT_TYPES = new Set(['DAILY_CONTEST_FIRST', 'DAILY_CONTEST_SECOND', 'DAILY_CONTEST_THIRD']);
const PLACEMENT_POINTS = { DAILY_CONTEST_FIRST: 10, DAILY_CONTEST_SECOND: 5, DAILY_CONTEST_THIRD: 3 };

function formatPublicName(user) {
  if (!user) return 'Player';
  const first = (user.firstName || user.fname || '').trim();
  const last = (user.lname || '').trim();
  if (!first && !last) return 'Player';
  const li = last ? `${last[0].toUpperCase()}.` : '';
  if (first && li) return `${first} ${li}`;
  if (first) return first;
  return li || 'Player';
}

function defaultCashClaimText() {
  return (
    process.env.DAILY_SUMMARY_CASH_CLAIM_DEFAULT ||
    'If your name appears in the cash challenge slot, email hello@theagnesprotocol.com from your contest email with subject line "Daily cash challenge" within 72 hours to verify and claim.'
  );
}

/**
 * Ledger rows that count toward "points earned today" (aligned with rollup filters; excludes placement types for that day).
 */
async function fetchLedgerRowsForDay(prisma, startUtc, endUtc) {
  return prisma.ledger.findMany({
    where: {
      createdAt: { gte: startUtc, lt: endUtc },
      OR: [{ points: { gt: 0 } }, { currency: 'points' }],
      NOT: [{ currency: 'email' }, { currency: 'usd' }],
      type: { notIn: [...PLACEMENT_TYPES] },
    },
    select: { userId: true, points: true, createdAt: true },
  });
}

function aggregateDailyScores(rows) {
  const byUser = new Map();
  for (const r of rows) {
    const pts = r.points || 0;
    if (pts === 0) continue;
    let cur = byUser.get(r.userId);
    if (!cur) {
      cur = { sum: 0, minCreated: r.createdAt };
      byUser.set(r.userId, cur);
    }
    cur.sum += pts;
    if (r.createdAt < cur.minCreated) cur.minCreated = r.createdAt;
  }
  const ranked = [...byUser.entries()]
    .filter(([, v]) => v.sum > 0)
    .map(([userId, v]) => ({
      userId,
      dailyPoints: v.sum,
      tieAt: v.minCreated,
    }))
    .sort((a, b) => {
      if (b.dailyPoints !== a.dailyPoints) return b.dailyPoints - a.dailyPoints;
      if (a.tieAt.getTime() !== b.tieAt.getTime()) return a.tieAt.getTime() - b.tieAt.getTime();
      return a.userId.localeCompare(b.userId);
    });
  return { ranked, contestantCount: ranked.length };
}

async function resolveLiveLeader(prisma) {
  const distinct = await prisma.ledger.findMany({
    distinct: ['userId'],
    select: { userId: true },
  });
  let best = { userId: null, totalPoints: -1 };
  for (const { userId } of distinct) {
    const r = await getPointsRollupForUser(prisma, userId);
    if (r.totalPoints > best.totalPoints) {
      best = { userId, totalPoints: r.totalPoints };
    }
  }
  if (!best.userId) return { userId: null, totalPoints: 0, displayName: null, user: null };
  const user = await prisma.user.findUnique({
    where: { id: best.userId },
    select: { id: true, firstName: true, fname: true, lname: true },
  });
  return {
    userId: best.userId,
    totalPoints: best.totalPoints,
    displayName: formatPublicName(user),
    user,
  };
}

async function awardPlacementIfNeeded(prisma, summaryDate, ranked, existingAwardedAt) {
  if (existingAwardedAt) {
    return { skipped: true, reason: 'already_awarded' };
  }
  const slots = [
    { rank: 1, type: 'DAILY_CONTEST_FIRST', points: PLACEMENT_POINTS.DAILY_CONTEST_FIRST, entry: ranked[0] },
    { rank: 2, type: 'DAILY_CONTEST_SECOND', points: PLACEMENT_POINTS.DAILY_CONTEST_SECOND, entry: ranked[1] },
    { rank: 3, type: 'DAILY_CONTEST_THIRD', points: PLACEMENT_POINTS.DAILY_CONTEST_THIRD, entry: ranked[2] },
  ];
  const awarded = [];
  for (const slot of slots) {
    if (!slot.entry) continue;
    const sessionId = `daily_summary:${summaryDate}:${slot.type}`;
    try {
      await prisma.ledger.create({
        data: {
          userId: slot.entry.userId,
          sessionId,
          type: slot.type,
          points: slot.points,
          amount: slot.points,
          currency: 'points',
          note: `Daily contest placement ${slot.rank} for ${summaryDate} (America/Denver)`,
          meta: { summaryDate, rank: slot.rank, dailyPoints: slot.entry.dailyPoints },
        },
      });
      awarded.push({ userId: slot.entry.userId, rank: slot.rank, points: slot.points });
    } catch (e) {
      if (e.code === 'P2002' || e.message?.includes('Unique constraint')) {
        continue;
      }
      throw e;
    }
  }
  return { skipped: false, awarded };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Object} [opts]
 * @param {string} [opts.summaryDate] YYYY-MM-DD (America/Denver). Default: previous Denver calendar day.
 */
async function runDailyContestSummary(prisma, opts = {}) {
  const summaryDate = opts.summaryDate || previousDenverSummaryDateKey();

  const startUtc = startOfDenverDayUtc(summaryDate);
  const endUtc = endOfDenverDayUtc(summaryDate);

  const rows = await fetchLedgerRowsForDay(prisma, startUtc, endUtc);
  const { ranked, contestantCount } = aggregateDailyScores(rows);

  const top3 = ranked.slice(0, 3);
  const userIds = [...new Set(top3.map((t) => t.userId))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, fname: true, lname: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const live = await resolveLiveLeader(prisma);

  const existing = await prisma.dailyContestSummary.findUnique({
    where: { summaryDate },
  });

  const buildSlot = (entry) => {
    if (!entry) return { userId: null, dailyPoints: null, displayName: null };
    const u = userById.get(entry.userId);
    return {
      userId: entry.userId,
      dailyPoints: entry.dailyPoints,
      displayName: formatPublicName(u),
    };
  };

  const s1 = buildSlot(top3[0]);
  const s2 = buildSlot(top3[1]);
  const s3 = buildSlot(top3[2]);

  const instructions =
    existing?.cashChallengeClaimInstructions?.trim() || defaultCashClaimText();

  const baseData = {
    firstUserId: s1.userId,
    secondUserId: s2.userId,
    thirdUserId: s3.userId,
    firstDailyPoints: s1.dailyPoints,
    secondDailyPoints: s2.dailyPoints,
    thirdDailyPoints: s3.dailyPoints,
    firstDisplayName: s1.displayName,
    secondDisplayName: s2.displayName,
    thirdDisplayName: s3.displayName,
    contestantCount,
    liveLeaderUserId: live.userId,
    liveLeaderDisplayName: live.displayName,
    liveLeaderTotalPoints: live.totalPoints,
  };

  let summary = await prisma.dailyContestSummary.upsert({
    where: { summaryDate },
    create: {
      summaryDate,
      ...baseData,
      cashChallengeClaimInstructions: instructions,
      cashChallengeClaimed: false,
    },
    update: {
      ...baseData,
      cashChallengeClaimInstructions: instructions,
      cashChallengeWinnerDisplayName: existing?.cashChallengeWinnerDisplayName ?? null,
      cashChallengeWinnerUserId: existing?.cashChallengeWinnerUserId ?? null,
      cashChallengeClaimed: existing?.cashChallengeClaimed ?? false,
      placementPointsAwardedAt: existing?.placementPointsAwardedAt ?? null,
      manuallyEditedNames: existing?.manuallyEditedNames ?? false,
      firstDisplayOverride: existing?.firstDisplayOverride ?? null,
      secondDisplayOverride: existing?.secondDisplayOverride ?? null,
      thirdDisplayOverride: existing?.thirdDisplayOverride ?? null,
    },
  });

  const awardResult = await awardPlacementIfNeeded(
    prisma,
    summaryDate,
    ranked,
    summary.placementPointsAwardedAt
  );

  if (!awardResult.skipped && awardResult.awarded?.length) {
    summary = await prisma.dailyContestSummary.update({
      where: { id: summary.id },
      data: { placementPointsAwardedAt: new Date() },
    });
  }

  return {
    summary,
    summaryDate,
    rankedTop3: top3,
    contestantCount,
    placement: awardResult,
    liveLeader: live,
  };
}

function toPublicSummaryDto(row) {
  if (!row) return null;
  const first =
    row.firstDisplayOverride || row.firstDisplayName || '—';
  const second =
    row.secondDisplayOverride || row.secondDisplayName || '—';
  const third =
    row.thirdDisplayOverride || row.thirdDisplayName || '—';
  return {
    summaryDate: row.summaryDate,
    first: { name: first, dailyPoints: row.firstDailyPoints },
    second: { name: second, dailyPoints: row.secondDailyPoints },
    third: { name: third, dailyPoints: row.thirdDailyPoints },
    contestantCount: row.contestantCount,
    liveLeader: {
      name: row.liveLeaderDisplayName,
      totalPoints: row.liveLeaderTotalPoints,
    },
    cashChallenge: {
      winnerDisplayName: row.cashChallengeWinnerDisplayName,
      claimInstructions: row.cashChallengeClaimInstructions,
      claimed: row.cashChallengeClaimed,
    },
    /** Admin/UI: raw overrides (public display already merges these into first/second/third names). */
    displayOverrides: {
      first: row.firstDisplayOverride || null,
      second: row.secondDisplayOverride || null,
      third: row.thirdDisplayOverride || null,
    },
    generatedAt: row.generatedAt,
    updatedAt: row.updatedAt,
  };
}

const JOB_STATUS_ID = 'daily_contest_summary';
const MAX_JOB_ERROR_LEN = 4000;

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function recordDailyContestSummaryJobRun(prisma, { success, errorMessage }) {
  const now = new Date();
  const err =
    success || !errorMessage ? null : String(errorMessage).slice(0, MAX_JOB_ERROR_LEN);
  await prisma.dailyContestSummaryJobStatus.upsert({
    where: { id: JOB_STATUS_ID },
    create: {
      id: JOB_STATUS_ID,
      lastRunAt: now,
      lastSuccessAt: success ? now : null,
      lastError: err,
    },
    update: {
      lastRunAt: now,
      ...(success ? { lastSuccessAt: now, lastError: null } : { lastError: err }),
    },
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function getDailyContestSummaryJobStatus(prisma) {
  const row = await prisma.dailyContestSummaryJobStatus.findUnique({
    where: { id: JOB_STATUS_ID },
  });
  if (!row) {
    return {
      id: JOB_STATUS_ID,
      lastRunAt: null,
      lastSuccessAt: null,
      lastError: null,
      updatedAt: null,
    };
  }
  return {
    id: row.id,
    lastRunAt: row.lastRunAt,
    lastSuccessAt: row.lastSuccessAt,
    lastError: row.lastError,
    updatedAt: row.updatedAt,
  };
}

function ribbonLineFromSummary(row) {
  const dto = toPublicSummaryDto(row);
  if (!dto) return null;
  const parts = [];
  const d = dto.summaryDate;
  if (dto.first.dailyPoints && dto.first.name !== '—') {
    parts.push(`Daily leaders ${d}: 1st ${dto.first.name} (${dto.first.dailyPoints} pts)`);
  }
  if (dto.second.dailyPoints && dto.second.name !== '—') {
    parts.push(`2nd ${dto.second.name} (${dto.second.dailyPoints} pts)`);
  }
  if (dto.third.dailyPoints && dto.third.name !== '—') {
    parts.push(`3rd ${dto.third.name} (${dto.third.dailyPoints} pts)`);
  }
  if (dto.liveLeader?.name && dto.liveLeader.totalPoints != null) {
    parts.push(`Overall leader: ${dto.liveLeader.name} (${dto.liveLeader.totalPoints} pts)`);
  }
  if (
    dto.cashChallenge?.winnerDisplayName &&
    !dto.cashChallenge.claimed
  ) {
    parts.push(`Cash challenge winner: ${dto.cashChallenge.winnerDisplayName}`);
  }
  if (!parts.length) return null;
  return parts.join(' • ');
}

module.exports = {
  runDailyContestSummary,
  toPublicSummaryDto,
  ribbonLineFromSummary,
  formatPublicName,
  previousDenverSummaryDateKey,
  PLACEMENT_TYPES,
  recordDailyContestSummaryJobRun,
  getDailyContestSummaryJobStatus,
  JOB_STATUS_ID,
};
