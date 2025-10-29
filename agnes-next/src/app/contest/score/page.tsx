// File: src/app/contest/score/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';

type PointsResponse = {
  actor: { id: string | null; displayName: string };
  totalPoints: number;
  breakdown: {
    purchases: number;
    purchaseEvents: number;
    amountUsdFloor: number;
    purchasePoints: number;
    amountPoints: number;
  };
  recent: { id: string; type: string; at: string; sessionId: string | null }[];
  rival: { label: string; points: number; gap: number; tip: string };
  error?: string;
};

export default function ScorePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [data, setData] = useState<PointsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // pick up localStorage flag set on Thank-you page
  useEffect(() => {
    try {
      const sid = window.localStorage.getItem('last_session_id');
      setSessionId(sid);
    } catch {}
  }, []);

  useEffect(() => {
    let url = `/api/points`;
    const params = new URLSearchParams();
    if (sessionId) params.set('sessionId', sessionId);
    const full = params.toString() ? `${url}?${params.toString()}` : url;

    setLoading(true);
    fetch(full, { method: 'GET', credentials: 'include' })
      .then(async (r) => r.json())
      .then((json) => setData(json))
      .catch((e) => {
        console.error('points fetch failed', e);
        setData({} as any);
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  const pctToRabbit = useMemo(() => {
    if (!data) return 0;
    const target = Math.max(data.rival.points, 1);
    const pct = Math.min(100, Math.floor((data.totalPoints / target) * 100));
    return pct;
  }, [data]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Your Score</h1>

      {loading && (
        <div className="mt-6 rounded-lg border p-4 text-sm text-gray-600">
          Calculating your points…
        </div>
      )}

      {!loading && data?.error && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {data.error}
        </div>
      )}

      {!loading && data && !data.error && (
        <>
          <section className="mt-6 rounded-xl border p-5">
            <div className="text-sm text-gray-500">Player</div>
            <div className="text-lg font-medium">{data.actor?.displayName ?? 'Guest'}</div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-sm text-gray-500">Total Points</div>
                <div className="text-3xl font-semibold">{data.totalPoints ?? 0}</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-sm text-gray-500">Purchases</div>
                <div className="text-3xl font-semibold">{data.breakdown?.purchases ?? 0}</div>
              </div>
            </div>

            {/* Chase the Rabbit */}
            <div className="mt-6">
              <div className="flex items-center justify-between text-sm">
                <span>Chase the {data.rival?.label ?? 'Rabbit'}</span>
                <span className="text-gray-500">{data.totalPoints} / {data.rival?.points}</span>
              </div>
              <div className="mt-2 h-3 w-full rounded-full bg-gray-200">
                <div
                  className="h-3 rounded-full bg-green-500 transition-all"
                  style={{ width: `${pctToRabbit}%` }}
                  aria-label="progress"
                />
              </div>
              {data.rival?.gap > 0 && (
                <div className="mt-2 text-xs text-gray-600">
                  You’re {data.rival.gap} points away. {data.rival.tip}
                </div>
              )}
            </div>
          </section>

          {/* Recent activity */}
          <section className="mt-6 rounded-xl border p-5">
            <h2 className="text-lg font-medium">Recent Activity</h2>
            <ul className="mt-3 space-y-2">
              {(data.recent ?? []).slice(0, 10).map((ev) => (
                <li key={ev.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm">
                  <span className="font-medium">{prettyType(ev.type)}</span>
                  <span className="text-gray-500">{new Date(ev.at).toLocaleString()}</span>
                </li>
              ))}
              {(!data.recent || data.recent.length === 0) && (
                <li className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                  No events (yet). Make your first move!
                </li>
              )}
            </ul>
          </section>

          {/* Keep earning */}
          <section className="mt-6 rounded-xl border p-5">
            <h2 className="text-lg font-medium">Keep Earning</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <a href="/contest"
                 className="rounded-xl border p-4 hover:bg-gray-50">
                Buy the Book (earn points)
              </a>
              <a href="/contest/share"
                 className="rounded-xl border p-4 hover:bg-gray-50">
                Share with Friends
              </a>
              <a href="/contest/quiz"
                 className="rounded-xl border p-4 hover:bg-gray-50">
                Daily Quiz
              </a>
              <a href="/contest/leaderboard"
                 className="rounded-xl border p-4 hover:bg-gray-50">
                View Leaderboard
              </a>
            </div>
          </section>
        </>
      )}

      {/* Debug helper while developing */}
      {!loading && !data?.error && (
        <div className="mt-6 text-xs text-gray-500">
          Session detected: <code>{sessionId || 'none'}</code>
        </div>
      )}
    </main>
  );
}

function prettyType(t?: string) {
  switch (t) {
    case 'PURCHASE_COMPLETED': return 'Purchase Completed';
    default: return t || 'Event';
  }
}
