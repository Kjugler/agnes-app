/** Public daily contest bulletin payload (deepquill toPublicSummaryDto / GET /api/contest/daily-summary). */
export type DailySummaryBulletin = {
  summaryDate: string;
  first: { name: string; dailyPoints: number | null };
  second: { name: string; dailyPoints: number | null };
  third: { name: string; dailyPoints: number | null };
  contestantCount: number;
  liveLeader: { name: string | null; totalPoints: number | null };
  cashChallenge: {
    winnerDisplayName: string | null;
    claimInstructions: string | null;
    claimed: boolean;
  };
};
