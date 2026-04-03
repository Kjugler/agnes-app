'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Summary = {
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
  displayOverrides?: {
    first: string | null;
    second: string | null;
    third: string | null;
  };
};

type JobStatus = {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

function formatJobTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default function DailyContestAdminClient() {
  const [summaryDate, setSummaryDate] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [firstOverride, setFirstOverride] = useState('');
  const [secondOverride, setSecondOverride] = useState('');
  const [thirdOverride, setThirdOverride] = useState('');
  const [cashName, setCashName] = useState('');
  const [cashInstr, setCashInstr] = useState('');
  const [cashClaimed, setCashClaimed] = useState(false);

  const syncFormFromSummary = useCallback((s: Summary | null) => {
    if (!s) return;
    setFirstOverride(s.displayOverrides?.first ?? '');
    setSecondOverride(s.displayOverrides?.second ?? '');
    setThirdOverride(s.displayOverrides?.third ?? '');
    setCashName(s.cashChallenge?.winnerDisplayName ?? '');
    setCashInstr(s.cashChallenge?.claimInstructions ?? '');
    setCashClaimed(Boolean(s.cashChallenge?.claimed));
  }, []);

  useEffect(() => {
    syncFormFromSummary(summary);
  }, [summary, syncFormFromSummary]);

  const loadJobStatus = useCallback(() => {
    fetch('/api/admin/contest/daily-summary/job-status')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.jobStatus) {
          setJobStatus({
            lastRunAt: d.jobStatus.lastRunAt ?? null,
            lastSuccessAt: d.jobStatus.lastSuccessAt ?? null,
            lastError: d.jobStatus.lastError ?? null,
            updatedAt: d.jobStatus.updatedAt ?? null,
          });
        }
      })
      .catch(() => {});
  }, []);

  const loadLatest = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/contest/daily-summary').then((r) => r.json()),
      fetch('/api/admin/contest/daily-summary/job-status').then((r) => r.json()),
    ])
      .then(([d, jd]) => {
        if (jd.ok && jd.jobStatus) {
          setJobStatus({
            lastRunAt: jd.jobStatus.lastRunAt ?? null,
            lastSuccessAt: jd.jobStatus.lastSuccessAt ?? null,
            lastError: jd.jobStatus.lastError ?? null,
            updatedAt: jd.jobStatus.updatedAt ?? null,
          });
        }
        if (d.ok && d.summary) {
          setSummary(d.summary);
          setSummaryDate(d.summary.summaryDate || '');
        } else {
          setSummary(null);
        }
        setMessage(d.ok ? null : d.error || 'Load failed');
      })
      .catch(() => setMessage('Network error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  const regenerate = () => {
    setLoading(true);
    setMessage(null);
    const body = summaryDate.trim() ? { summaryDate: summaryDate.trim() } : {};
    fetch('/api/admin/contest/daily-summary/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.summary) {
          setSummary(d.summary);
          if (d.jobStatus) {
            setJobStatus({
              lastRunAt: d.jobStatus.lastRunAt ?? null,
              lastSuccessAt: d.jobStatus.lastSuccessAt ?? null,
              lastError: d.jobStatus.lastError ?? null,
              updatedAt: d.jobStatus.updatedAt ?? null,
            });
          } else {
            loadJobStatus();
          }
          setMessage('Regenerated.');
        } else {
          setMessage(d.error || 'Regenerate failed');
          loadJobStatus();
        }
      })
      .catch(() => setMessage('Network error'))
      .finally(() => setLoading(false));
  };

  const saveOverrides = () => {
    if (!summaryDate.trim()) {
      setMessage('Set summary date (YYYY-MM-DD)');
      return;
    }
    setLoading(true);
    setMessage(null);
    const body = {
      firstDisplayOverride: firstOverride,
      secondDisplayOverride: secondOverride,
      thirdDisplayOverride: thirdOverride,
      cashChallengeWinnerDisplayName: cashName,
      cashChallengeClaimInstructions: cashInstr,
      cashChallengeClaimed: cashClaimed,
    };
    fetch(`/api/admin/contest/daily-summary/${encodeURIComponent(summaryDate.trim())}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstDisplayOverride: body.firstDisplayOverride || null,
        secondDisplayOverride: body.secondDisplayOverride || null,
        thirdDisplayOverride: body.thirdDisplayOverride || null,
        cashChallengeWinnerDisplayName: body.cashChallengeWinnerDisplayName || null,
        cashChallengeClaimInstructions: body.cashChallengeClaimInstructions || null,
        cashChallengeClaimed: body.cashChallengeClaimed,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.summary) {
          setSummary(d.summary);
          setMessage('Saved overrides.');
        } else {
          setMessage(d.error || 'Save failed');
        }
      })
      .catch(() => setMessage('Network error'))
      .finally(() => setLoading(false));
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.25rem' }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/admin/fulfillment/labels" style={{ color: '#0070f3' }}>
          ← Fulfillment admin
        </Link>
      </p>
      <h1 style={{ fontSize: '1.5rem', marginBottom: 8 }}>Daily contest summary</h1>
      <p style={{ color: '#555', fontSize: '0.95rem', marginBottom: 24 }}>
        Regenerate pulls ledger data for the scoring day (America/Denver). Placement points (10 / 5 / 3) are awarded once per
        day when first generated. Uses the same staff cookie as fulfillment; server must have{' '}
        <code>ADMIN_KEY</code> set to reach deepquill.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Summary date (optional)</span>
          <input
            value={summaryDate}
            onChange={(e) => setSummaryDate(e.target.value)}
            placeholder="YYYY-MM-DD — blank = previous Denver day"
            style={{ padding: '8px 12px', minWidth: 260 }}
          />
        </label>
        <button
          type="button"
          onClick={regenerate}
          disabled={loading}
          style={{
            padding: '10px 18px',
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: 22,
          }}
        >
          Regenerate
        </button>
        <button
          type="button"
          onClick={loadLatest}
          disabled={loading}
          style={{
            padding: '10px 18px',
            background: '#eee',
            border: '1px solid #ccc',
            borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: 22,
          }}
        >
          Reload latest
        </button>
        <button
          type="button"
          onClick={loadJobStatus}
          disabled={loading}
          style={{
            padding: '10px 18px',
            background: '#f0f7ff',
            border: '1px solid #bcd',
            borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: 22,
          }}
        >
          Refresh job status
        </button>
      </div>

      <div
        style={{
          border: '1px solid #cfe8ff',
          background: '#f6fbff',
          borderRadius: 8,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: '1rem', marginBottom: 10, marginTop: 0 }}>Job pipeline status</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: '0.95rem' }}>
          <li>
            <strong>Last run:</strong> {formatJobTime(jobStatus?.lastRunAt)}
          </li>
          <li>
            <strong>Last success:</strong> {formatJobTime(jobStatus?.lastSuccessAt)}
          </li>
          <li>
            <strong>Last error:</strong>{' '}
            {jobStatus?.lastError ? (
              <span style={{ color: '#a30', whiteSpace: 'pre-wrap' }}>{jobStatus.lastError}</span>
            ) : (
              '—'
            )}
          </li>
        </ul>
        <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: '#555' }}>
          Updated when the cron job or &quot;Regenerate&quot; finishes (success or failure). Clears last error on the next
          successful run.
        </p>
      </div>

      {message && (
        <div style={{ padding: 12, background: '#fff3cd', borderRadius: 8, marginBottom: 16, fontSize: '0.9rem' }}>
          {message}
        </div>
      )}

      {summary && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Current: {summary.summaryDate}</h2>
          <ul style={{ lineHeight: 1.7, marginBottom: 16 }}>
            <li>
              1st: {summary.first?.name} ({summary.first?.dailyPoints ?? '—'} pts)
            </li>
            <li>
              2nd: {summary.second?.name} ({summary.second?.dailyPoints ?? '—'} pts)
            </li>
            <li>
              3rd: {summary.third?.name} ({summary.third?.dailyPoints ?? '—'} pts)
            </li>
            <li>Contestants (earned &gt;0 that day): {summary.contestantCount}</li>
            <li>
              Live leader: {summary.liveLeader?.name ?? '—'} ({summary.liveLeader?.totalPoints ?? '—'})
            </li>
          </ul>
          <p style={{ fontSize: '0.82rem', color: '#555', marginTop: 10, lineHeight: 1.45 }}>
            <strong>Contestant count</strong> here is only users with net positive <em>ledger points that calendar day</em>{' '}
            (America/Denver), excluding same-day placement awards. It is not the same as Contest Hub &quot;players
            exploring&quot; (everyone who ever joined the contest).
          </p>

          <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Display overrides (public ribbon/bulletin)</h3>
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            <input
              value={firstOverride}
              onChange={(e) => setFirstOverride(e.target.value)}
              placeholder="1st override (e.g. Jane D.) — leave blank to use ledger name"
              style={{ padding: 8 }}
            />
            <input
              value={secondOverride}
              onChange={(e) => setSecondOverride(e.target.value)}
              placeholder="2nd override"
              style={{ padding: 8 }}
            />
            <input
              value={thirdOverride}
              onChange={(e) => setThirdOverride(e.target.value)}
              placeholder="3rd override"
              style={{ padding: 8 }}
            />
          </div>

          <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Cash challenge</h3>
          <input
            value={cashName}
            onChange={(e) => setCashName(e.target.value)}
            placeholder="Winner display name"
            style={{ padding: 8, width: '100%', marginBottom: 8 }}
          />
          <textarea
            value={cashInstr}
            onChange={(e) => setCashInstr(e.target.value)}
            placeholder="Claim instructions"
            rows={3}
            style={{ padding: 8, width: '100%', marginBottom: 8 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <input type="checkbox" checked={cashClaimed} onChange={(e) => setCashClaimed(e.target.checked)} />
            Mark claimed
          </label>

          <button
            type="button"
            onClick={saveOverrides}
            disabled={loading || !summaryDate.trim()}
            style={{
              padding: '10px 18px',
              background: '#0070f3',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: loading || !summaryDate.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            Save overrides & cash fields
          </button>
        </div>
      )}

      <p style={{ fontSize: '0.85rem', color: '#666' }}>
        <strong>Automation (intended):</strong> ~2:00 AM America/Denver. The repo ships{' '}
        <code>agnes-next/vercel.json</code> with <code>GET /api/cron/daily-contest-summary</code> at{' '}
        <code>5 9 * * *</code> (09:05 UTC = 2:05 AM MST; during MDT it runs 3:05 AM Denver unless you adjust the
        schedule or use an external scheduler). Vercel must have <code>CRON_SECRET</code> and{' '}
        <code>ADMIN_KEY</code> (same as deepquill) on the agnes-next project. Manual deepquill call:{' '}
        <code>GET/POST /api/admin/jobs/daily-contest-summary</code> with <code>x-admin-key</code>.
      </p>
    </div>
  );
}
