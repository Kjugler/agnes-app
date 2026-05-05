'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

const pageStyle: CSSProperties = {
  maxWidth: 1080,
  margin: '0 auto',
  padding: '32px 20px 48px',
  fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
  color: '#0f172a',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
  marginTop: 12,
};

const thtd: CSSProperties = {
  border: '1px solid #e2e8f0',
  padding: '8px 10px',
  textAlign: 'left',
  verticalAlign: 'top',
};

const btn: CSSProperties = {
  fontSize: 12,
  padding: '4px 8px',
  marginRight: 6,
  marginBottom: 4,
  cursor: 'pointer',
  borderRadius: 4,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
};

type RepRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  referralCode: string;
  discountCode: string;
  overrideActive: boolean;
  referralLink: string;
  chapter9Link: string;
  readyToSendMessage?: string;
};

type MonthlyRow = {
  rep: string;
  role: string;
  directSales: number;
  downlineSales: number;
  overrideEarningsCents: number;
  totalEarningsCents: number;
  conversionCount: number;
  rank: number;
  topPerformingLink: string | null;
  bestSalesDay: string | null;
  monthlyGrowthCents: number;
  leaderboardPosition: number;
};

export default function AdminRepsPage() {
  const [reps, setReps] = useState<RepRow[]>([]);
  const [payoutNote, setPayoutNote] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reportRows, setReportRows] = useState<MonthlyRow[]>([]);
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const [promoteEmail, setPromoteEmail] = useState('');
  const [promoteName, setPromoteName] = useState('');
  const [promoteRole, setPromoteRole] = useState<'regional' | 'podcaster'>('regional');
  const [promoteCode, setPromoteCode] = useState('');

  const [replOld, setReplOld] = useState('');
  const [replEmail, setReplEmail] = useState('');
  const [replName, setReplName] = useState('');
  const [replRole, setReplRole] = useState<'regional' | 'podcaster'>('regional');
  const [replCode, setReplCode] = useState('');

  const loadReps = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await fetch('/api/admin/users/reps');
      const j = await r.json();
      if (!r.ok) {
        setLoadError(j?.error || `HTTP ${r.status}`);
        return;
      }
      setReps(Array.isArray(j.reps) ? j.reps : []);
      setPayoutNote(typeof j.payoutNote === 'string' ? j.payoutNote : '');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'load failed');
    }
  }, []);

  const loadMonthlyReport = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/reps/monthly-report?month=${encodeURIComponent(reportMonth)}`);
      const j = await r.json();
      if (!r.ok) return;
      setReportRows(Array.isArray(j.rows) ? j.rows : []);
    } catch {
      // Non-blocking UI section.
    }
  }, [reportMonth]);

  useEffect(() => {
    void loadReps();
  }, [loadReps]);

  useEffect(() => {
    void loadMonthlyReport();
  }, [loadMonthlyReport]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4200);
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied`);
    } catch {
      showToast('Copy failed');
    }
  }

  async function postJson(url: string, body: object) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    return { r, j };
  }

  async function handlePromote() {
    setBusy(true);
    try {
      const { r, j } = await postJson('/api/admin/users/promote-rep', {
        email: promoteEmail.trim(),
        displayName: promoteName.trim(),
        role: promoteRole,
        ...(promoteCode.trim() ? { preferredCode: promoteCode.trim() } : {}),
      });
      if (!r.ok) {
        showToast(j?.error || `Promote failed (${r.status})`);
        return;
      }
      showToast(`Promoted ${j.referralCode || ''}`);
      setPromoteEmail('');
      setPromoteName('');
      setPromoteCode('');
      await loadReps();
      // eslint-disable-next-line no-console
      console.log('[reps] promote result', j);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(referralCode: string) {
    if (!window.confirm(`Disable override for code ${referralCode}?`)) return;
    setBusy(true);
    try {
      const { r, j } = await postJson('/api/admin/users/disable-override', { referralCode });
      if (!r.ok) {
        showToast(j?.error || 'Disable failed');
        return;
      }
      showToast('Override disabled');
      await loadReps();
    } finally {
      setBusy(false);
    }
  }

  async function handleReplace() {
    setBusy(true);
    try {
      const { r, j } = await postJson('/api/admin/users/replace-override-rep', {
        oldReferralCode: replOld.trim(),
        newEmail: replEmail.trim().toLowerCase(),
        newDisplayName: replName.trim(),
        newRole: replRole,
        ...(replCode.trim() ? { newPreferredCode: replCode.trim() } : {}),
      });
      if (!r.ok) {
        showToast(j?.error || 'Replace failed');
        return;
      }
      showToast('Rep replaced');
      setReplOld('');
      setReplEmail('');
      setReplName('');
      setReplCode('');
      await loadReps();
      // eslint-disable-next-line no-console
      console.log('[reps] replace result', j);
    } finally {
      setBusy(false);
    }
  }

  const activeRows = reps.filter((x) => x.overrideActive);
  const money = (cents: number) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

  return (
    <div style={pageStyle}>
      <p style={{ margin: '0 0 8px 0', fontSize: 13 }}>
        <Link href="/admin" style={{ color: '#0070f3' }}>
          ← Admin hub
        </Link>
      </p>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px 0' }}>Regional / podcast reps</h1>
      <p style={{ margin: '0 0 8px 0', fontSize: 13, color: '#64748b' }}>
        Requires fulfillment login (/admin/fulfillment/auth).
      </p>
      {payoutNote ? (
        <p style={{ fontSize: 13, color: '#334155', marginBottom: 16 }}>{payoutNote}</p>
      ) : null}
      {loadError ? (
        <p style={{ color: '#b91c1c', marginBottom: 12 }}>
          {loadError === 'unauthorized' ? (
            <>
              Unauthorized —{' '}
              <Link href="/admin/fulfillment/auth" style={{ color: '#0070f3' }}>
                sign in
              </Link>
            </>
          ) : (
            loadError
          )}
        </p>
      ) : null}
      {toast ? (
        <div
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {toast}
        </div>
      ) : null}

      <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 24 }}>Active override reps</h2>
      <table style={tableStyle}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={thtd}>Name</th>
            <th style={thtd}>Email</th>
            <th style={thtd}>Role</th>
            <th style={thtd}>Referral code</th>
            <th style={thtd}>Discount code</th>
            <th style={thtd}>Chapter 9 link</th>
            <th style={thtd}>Override</th>
            <th style={thtd}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {activeRows.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ ...thtd, color: '#64748b' }}>
                No active override reps (or list empty).
              </td>
            </tr>
          ) : (
            activeRows.map((row) => (
              <tr key={row.id}>
                <td style={thtd}>{row.name || '—'}</td>
                <td style={thtd}>{row.email}</td>
                <td style={thtd}>{row.role || '—'}</td>
                <td style={thtd}>
                  <code>{row.referralCode}</code>
                </td>
                <td style={thtd}>
                  <code>{row.discountCode}</code>
                </td>
                <td style={thtd}>
                  <span style={{ display: 'block', maxWidth: 220, wordBreak: 'break-word' }}>
                    {row.chapter9Link || '—'}
                  </span>
                </td>
                <td style={thtd}>{row.overrideActive ? 'yes' : 'no'}</td>
                <td style={thtd}>
                  <button
                    type="button"
                    style={btn}
                    disabled={busy}
                    onClick={() => void copyText('Link', row.referralLink)}
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    style={btn}
                    disabled={busy}
                    onClick={() => void copyText('Chapter 9 link', row.chapter9Link)}
                  >
                    Copy Chapter 9 link
                  </button>
                  <button
                    type="button"
                    style={btn}
                    disabled={busy}
                    onClick={() =>
                      void (async () => {
                        const msg = row.readyToSendMessage?.trim();
                        if (!msg) {
                          showToast('Message not loaded — refresh the rep list');
                          return;
                        }
                        await copyText('Message', msg);
                      })()
                    }
                  >
                    Copy message
                  </button>
                  <button
                    type="button"
                    style={btn}
                    disabled={busy}
                    onClick={() => void handleDisable(row.referralCode)}
                  >
                    Disable override
                  </button>
                  <button
                    type="button"
                    style={btn}
                    disabled={busy}
                    onClick={() => {
                      setReplOld(row.referralCode);
                      showToast('Old code filled — complete Replace form below');
                    }}
                  >
                    Replace rep
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 32 }}>Monthly rep report</h2>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 13 }}>
          Month{' '}
          <input
            type="month"
            value={reportMonth}
            onChange={(e) => setReportMonth(e.target.value)}
            style={{ marginLeft: 6, padding: 6 }}
          />
        </label>
        <button type="button" style={{ ...btn, marginLeft: 8 }} onClick={() => void loadMonthlyReport()}>
          Refresh report
        </button>
      </div>
      <table style={tableStyle}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={thtd}>Rep</th>
            <th style={thtd}>Direct sales</th>
            <th style={thtd}>Downline sales</th>
            <th style={thtd}>Override earnings</th>
            <th style={thtd}>Total earnings</th>
            <th style={thtd}>Conversions</th>
            <th style={thtd}>Rank</th>
            <th style={thtd}>Top link</th>
            <th style={thtd}>Best day</th>
            <th style={thtd}>Growth</th>
          </tr>
        </thead>
        <tbody>
          {reportRows.length === 0 ? (
            <tr>
              <td colSpan={10} style={{ ...thtd, color: '#64748b' }}>
                No report rows for selected month.
              </td>
            </tr>
          ) : (
            reportRows.map((r) => (
              <tr key={`${r.rep}-${r.rank}`}>
                <td style={thtd}>
                  {r.rep}
                  <br />
                  <span style={{ color: '#64748b', fontSize: 12 }}>{r.role}</span>
                </td>
                <td style={thtd}>{r.directSales}</td>
                <td style={thtd}>{r.downlineSales}</td>
                <td style={thtd}>{money(r.overrideEarningsCents)}</td>
                <td style={thtd}>{money(r.totalEarningsCents)}</td>
                <td style={thtd}>{r.conversionCount}</td>
                <td style={thtd}>{r.rank}</td>
                <td style={thtd}>{r.topPerformingLink || '—'}</td>
                <td style={thtd}>{r.bestSalesDay || '—'}</td>
                <td style={thtd}>{money(r.monthlyGrowthCents)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 32 }}>Promote new rep</h2>
      <div style={{ display: 'grid', gap: 10, maxWidth: 480 }}>
        <label style={{ fontSize: 13 }}>
          Email
          <input
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            value={promoteEmail}
            onChange={(e) => setPromoteEmail(e.target.value)}
            placeholder="user@email.com"
          />
        </label>
        <label style={{ fontSize: 13 }}>
          Display name
          <input
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            value={promoteName}
            onChange={(e) => setPromoteName(e.target.value)}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          Role
          <select
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            value={promoteRole}
            onChange={(e) => setPromoteRole(e.target.value as 'regional' | 'podcaster')}
          >
            <option value="regional">regional</option>
            <option value="podcaster">podcaster</option>
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          Preferred code (optional)
          <input
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            value={promoteCode}
            onChange={(e) => setPromoteCode(e.target.value)}
            placeholder="JOE"
          />
        </label>
        <button
          type="button"
          style={{ ...btn, padding: '10px 16px', fontWeight: 600 }}
          disabled={busy}
          onClick={() => void handlePromote()}
        >
          Promote user to rep
        </button>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 32 }}>Replace override rep</h2>
      <p style={{ fontSize: 13, color: '#64748b' }}>
        Disables override on the old code (referral link stays). Promotes the new user with a new code (or derived).
      </p>
      <div style={{ display: 'grid', gap: 10, maxWidth: 480 }}>
        <label style={{ fontSize: 13 }}>
          Old referral code
          <input
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            value={replOld}
            onChange={(e) => setReplOld(e.target.value)}
            placeholder="FRANK"
          />
        </label>
        <label style={{ fontSize: 13 }}>
          New email
          <input
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            value={replEmail}
            onChange={(e) => setReplEmail(e.target.value)}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          New display name
          <input
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            value={replName}
            onChange={(e) => setReplName(e.target.value)}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          New role
          <select
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            value={replRole}
            onChange={(e) => setReplRole(e.target.value as 'regional' | 'podcaster')}
          >
            <option value="regional">regional</option>
            <option value="podcaster">podcaster</option>
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          New preferred code (optional)
          <input
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            value={replCode}
            onChange={(e) => setReplCode(e.target.value)}
            placeholder="JOE"
          />
        </label>
        <button
          type="button"
          style={{ ...btn, padding: '10px 16px', fontWeight: 600 }}
          disabled={busy}
          onClick={() => void handleReplace()}
        >
          Replace rep
        </button>
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: '#94a3b8' }}>
        Refresh list after changes — button-driven API only; no shell required.
      </p>
    </div>
  );
}
