'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';

const MOTIVATIONAL_LINES = [
  'Join the game. It takes less than 30 seconds.',
  'Solve the mystery. Earn points. Climb the leaderboard.',
  'Top players qualify for the 6-Day, 7-Night Family Vacation drawing.',
  'Every signal earns points. Every point moves you closer.',
  "You're already here. Join the game.",
  "It's fun. Everyone is doing it.",
];
import { useRouter } from 'next/navigation';
import {
  clearAssociateCaches,
  readAssociate,
  readContestEmail,
  writeAssociate,
  writeContestEmail,
  type AssociateCache,
} from '@/lib/identity';
import { normalizeEmail } from '@/lib/email';

const initialState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  x: '',
  instagram: '',
  tiktok: '',
  truth: '',
};

type FormState = typeof initialState;

type ContestEntryFormProps = {
  onCompleted?: () => void | Promise<void>;
  suppressAscensionRedirect?: boolean;
  useExplicitEntry?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export function ContestEntryForm({
  onCompleted,
  suppressAscensionRedirect = false,
  className,
  style,
  useExplicitEntry = false,
}: ContestEntryFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [contestEmail, setContestEmail] = useState<string | null>(null);
  const [contestEmailOverride, setContestEmailOverride] = useState<string | null>(null);
  const [associateCache, setAssociateCache] = useState<AssociateCache | null>(null);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [betaAcknowledged, setBetaAcknowledged] = useState(false);

  // Motivational banner: slow rotation, 2–3 seconds between messages
  useEffect(() => {
    const interval = setInterval(() => {
      setBannerIndex((prev) => (prev + 1) % MOTIVATIONAL_LINES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleChangeAccount = useCallback(() => {
    clearAssociateCaches();
    setContestEmail(null);
    setContestEmailOverride(null);
    setAssociateCache(null);
    router.replace('/contest');
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const syncEmail = () => {
      const email = readContestEmail();
      const stored = readAssociate();
      setContestEmail(email);
      setAssociateCache(stored);
      
      setForm((prev) => {
        const next = { ...prev };
        // Only update if field is empty to avoid overwriting user input
        if (stored?.name && !prev.firstName) {
          const parts = stored.name.trim().split(' ');
          if (parts.length > 0) next.firstName = parts[0];
          if (parts.length > 1) next.lastName = parts.slice(1).join(' ');
        }
        // Email: prioritize contest email, then stored associate email
        if (!prev.email) {
          if (email) {
            next.email = email;
          } else if (stored?.email) {
            next.email = stored.email;
          }
        }
        return next;
      });
    };
    
    // Sync immediately
    syncEmail();
    
    // Also sync after a short delay to catch cookies that might be set asynchronously
    const delayedSync = setTimeout(syncEmail, 200);
    
    return () => {
      clearTimeout(delayedSync);
    };
  }, []);

  const effectiveContestEmail = contestEmailOverride ?? contestEmail;

  const emailMismatch = useMemo(() => {
    if (!effectiveContestEmail) return false;
    if (!form.email || !form.email.trim()) return false; // No mismatch if email field is empty
    const normalizedFormEmail = normalizeEmail(form.email);
    const normalizedContestEmail = effectiveContestEmail.toLowerCase().trim();
    return normalizedFormEmail !== normalizedContestEmail;
  }, [effectiveContestEmail, form.email]);

  const stressTestMode = process.env.NEXT_PUBLIC_STRESS_TEST_MODE === '1';
  const canSubmit = useMemo(() => {
    const emailValid = /.+@.+/.test(form.email.trim());
    const baseValid =
      form.firstName.trim().length > 0 &&
      form.lastName.trim().length > 0 &&
      emailValid &&
      !emailMismatch;
    if (stressTestMode) {
      return baseValid && betaAcknowledged;
    }
    return baseValid;
  }, [form, emailMismatch, stressTestMode, betaAcknowledged]);

  const onChange = (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  useEffect(() => {
    if (associateCache) return;
    const normalized = normalizeEmail(form.email);
    const looksValid = /.+@.+/.test(normalized);
    if (!looksValid) return;
    if (effectiveContestEmail && normalized === effectiveContestEmail.toLowerCase()) return;
    writeContestEmail(normalized);
    setContestEmail(normalized);
    setContestEmailOverride(null);
  }, [associateCache, effectiveContestEmail, form.email]);

  const handleOverrideEmail = useCallback(() => {
    const normalizedEmail = normalizeEmail(form.email);
    if (!normalizedEmail) {
      setError('Enter a valid email address before switching.');
      return;
    }

    clearAssociateCaches();
    writeContestEmail(normalizedEmail);
    setContestEmailOverride(normalizedEmail);
    setContestEmail(normalizedEmail);
    setAssociateCache(null);
    setError(null);
  }, [form.email]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const normalizedEmail = normalizeEmail(form.email);
      if (effectiveContestEmail && normalizedEmail !== effectiveContestEmail.toLowerCase()) {
        setError(`You're currently signed in as ${effectiveContestEmail}. Click "Use this email for the contest" to switch.`);
        setSubmitting(false);
        return;
      }

      const targetEmail = normalizedEmail;
      if (!effectiveContestEmail) {
        writeContestEmail(targetEmail);
        setContestEmail(targetEmail);
      }

      console.log('[ContestEntryForm] Submitting form', { 
        email: targetEmail, 
        firstName: form.firstName, 
        lastName: form.lastName,
        hasHandles: !!(form.x || form.instagram || form.tiktok || form.truth)
      });

      let res: Response;
      try {
        res = await fetch('/api/associate/upsert', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': targetEmail,
          },
          credentials: 'include',
          body: JSON.stringify({
            firstName: form.firstName,
            lastName: form.lastName,
            email: targetEmail,
            phone: form.phone,
            handles: {
              x: form.x,
              instagram: form.instagram,
              tiktok: form.tiktok,
              truth: form.truth,
            },
            source: 'contest-signup',
          }),
        });
      } catch (fetchError: any) {
        console.error('[ContestEntryForm] Fetch error', fetchError);
        // Network error or CORS issue
        throw new Error(
          fetchError?.message?.includes('Failed to fetch') || fetchError?.message?.includes('NetworkError')
            ? 'Network error. Please check your connection and try again.'
            : `Connection error: ${fetchError?.message || 'Unknown error'}`
        );
      }

      if (!res.ok) {
        let errorMessage = `Failed to save (status ${res.status})`;
        try {
          const errorData = await res.json();
          console.error('[ContestEntryForm] API error response', errorData);
          if (errorData?.error) {
            errorMessage = errorData.error === 'missing_user_email' 
              ? 'Email is required. Please refresh and try again.'
              : errorData.error === 'email_mismatch'
              ? 'Email mismatch. Please use the email you signed in with.'
              : errorData.error === 'missing_fields'
              ? 'Please fill in all required fields.'
              : errorData.error === 'server_error'
              ? `Server error: ${errorData.message || 'Please try again or contact support.'}`
              : errorData.error || 'Could not save. Please try again.';
          }
        } catch (parseError) {
          console.error('[ContestEntryForm] Failed to parse error response', parseError);
          // If response isn't JSON, use default message
        }
        throw new Error(errorMessage);
      }

      const data = (await res.json()) as
        | { ok: true; id: string; email: string; name: string; code: string }
        | { ok: false; error?: string };
      if (!data.ok) {
        throw new Error(data.error || 'Could not save. Please try again.');
      }

      const associatePayload: AssociateCache = {
        id: data.id,
        email: data.email,
        name: data.name,
        code: data.code,
      };
      writeAssociate(associatePayload);
      setAssociateCache(associatePayload);
      setContestEmail(data.email);
      setContestEmailOverride(null);

      // Part B: Call /api/contest/join or /api/contest/explicit-enter to award 500 points (idempotent)
      let pointsAwarded = 0;
      let joinData: any = null; // Declare outside try block for event dispatch
      try {
        const endpoint = useExplicitEntry ? '/api/contest/explicit-enter' : '/api/contest/join';
        const joinRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': targetEmail,
          },
          credentials: 'include',
          body: JSON.stringify({
            email: targetEmail,
          }),
        });

        if (joinRes.ok) {
          joinData = await joinRes.json();
          pointsAwarded = joinData.pointsAwarded || 0;
          console.log(`[ContestEntryForm] ${useExplicitEntry ? 'Explicit entry' : 'Contest join'} result`, {
            alreadyEntered: joinData.alreadyEntered,
            joined: joinData.joined,
            pointsAwarded,
            reason: joinData.reason,
            newTotalPoints: joinData.newTotalPoints,
          });
        } else {
          const errorData = await joinRes.json().catch(() => ({ error: 'Unknown error' }));
          console.warn(`[ContestEntryForm] ${useExplicitEntry ? 'Explicit entry' : 'Contest join'} failed`, {
            status: joinRes.status,
            error: errorData.error,
          });
          // If explicit entry fails with not_in_contest, fall back to regular join
          if (useExplicitEntry && errorData.error === 'not_in_contest') {
            console.log('[ContestEntryForm] Falling back to regular contest join');
            const fallbackRes = await fetch('/api/contest/join', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-User-Email': targetEmail,
              },
              credentials: 'include',
              body: JSON.stringify({
                email: targetEmail,
              }),
            });
            if (fallbackRes.ok) {
              const fallbackData = await fallbackRes.json();
              pointsAwarded = fallbackData.pointsAwarded || 0;
            }
          }
        }
      } catch (joinErr) {
        console.warn(`[ContestEntryForm] ${useExplicitEntry ? 'Explicit entry' : 'Contest join'} error`, joinErr);
        // Non-blocking - form submission succeeded even if points failed
      }

      // Show success message with points if awarded
      if (pointsAwarded > 0) {
        setSuccessMessage(`You're officially entered. +${pointsAwarded} points.`);
      } else {
        setSuccessMessage('You are in!');
      }

      // Part B: Refresh points/score after join
      // Trigger a custom event that score/points components can listen to
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('contest:points-updated'));
        
        // Part D: Dispatch explicit entry completion event
        if (useExplicitEntry && (pointsAwarded > 0 || joinData?.alreadyEntered)) {
          window.dispatchEvent(new CustomEvent('contest:explicit-entry-complete', {
            detail: {
              pointsAwarded: pointsAwarded || 0,
              newTotalPoints: joinData?.newTotalPoints,
              alreadyEntered: joinData?.alreadyEntered || false,
            },
          }));
        }
      }

      // Call onCompleted callback if provided
      if (onCompleted) {
        await onCompleted();
      }

      // Redirect to Ascension unless suppressed
      // If using explicit entry, onCompleted handler will handle redirect
      if (!suppressAscensionRedirect && !useExplicitEntry) {
        setTimeout(() => {
          router.replace('/contest/ascension?joined=1');
        }, 600);
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.85rem 1rem',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.75)',
    color: 'white',
    fontSize: '0.95rem',
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={className}
      style={{
        width: '100%',
        maxWidth: 520,
        background: 'rgba(15, 23, 42, 0.8)',
        borderRadius: 18,
        padding: '2.5rem',
        boxShadow: '0 25px 60px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        ...style,
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Enter to Win a 6-Day, 7-Night Family Vacation</h1>
      <p style={{ marginBottom: '1.5rem', color: '#cbd5f5' }}>
        Join the Agnes Protocol contest. Earn points, climb the leaderboard, and qualify for the vacation drawing.
      </p>
      {process.env.NEXT_PUBLIC_STRESS_TEST_MODE === '1' && (
        <div style={{
          marginBottom: '1.5rem',
          padding: '12px 16px',
          background: 'rgba(0, 255, 127, 0.1)',
          border: '1px solid rgba(0, 255, 127, 0.3)',
          borderRadius: '8px',
          fontSize: '14px',
          color: '#a5b4fc',
        }}>
          <strong style={{ color: '#00ff7f' }}>PUBLIC STRESS TEST ACTIVE</strong> — Everything you see is a simulation. No real charges. No real deliveries. Your mission: try to break the system. <a href="mailto:hello@theagnesprotocol.com" style={{ color: '#00ff7f', textDecoration: 'underline' }}>Found a bug? Email hello@theagnesprotocol.com</a>
        </div>
      )}
      {effectiveContestEmail ? (
        <p
          style={{
            marginBottom: '1.5rem',
            color: '#a5b4fc',
            fontSize: '0.9rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          Signed in as <strong>{effectiveContestEmail}</strong>
          <button
            type="button"
            onClick={handleChangeAccount}
            style={{
              background: 'transparent',
              border: '1px solid rgba(148, 163, 184, 0.45)',
              color: '#cbd5f5',
              padding: '0.4rem 1rem',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            Change account
          </button>
        </p>
      ) : (
        <p style={{ marginBottom: '1.5rem', color: '#fca5a5', fontSize: '0.9rem' }}>
          No contest email is set. Use "Change account" on the previous page to restart the flow.
        </p>
      )}

      <div style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>First Name</span>
            <input
              type="text"
              value={form.firstName}
              onChange={onChange('firstName')}
              required
              placeholder="Simona"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Last Name</span>
            <input
              type="text"
              value={form.lastName}
              onChange={onChange('lastName')}
              required
              placeholder="Vernon"
              style={inputStyle}
            />
          </label>
        </div>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={onChange('email')}
            required
            placeholder="you@example.com"
            style={inputStyle}
          />
          {effectiveContestEmail && emailMismatch && (
            <span
              style={{
                color: '#fca5a5',
                fontSize: '0.8rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}
            >
              You're currently signed in as <strong>{effectiveContestEmail}</strong>.
              <button
                type="button"
                onClick={handleOverrideEmail}
                style={{
                  alignSelf: 'flex-start',
                  background: 'transparent',
                  border: '1px solid rgba(248, 113, 113, 0.5)',
                  color: '#fca5a5',
                  padding: '0.3rem 0.8rem',
                  borderRadius: 999,
                  cursor: 'pointer',
                }}
              >
                Use this email for the contest
              </button>
            </span>
          )}
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Mobile Number</span>
          <input
            type="tel"
            value={form.phone}
            onChange={onChange('phone')}
            placeholder="(555) 867-5309"
            style={inputStyle}
          />
        </label>

        <div style={{
          marginTop: '0.5rem',
          padding: '1rem',
          borderRadius: 12,
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          display: 'grid',
          gap: '0.75rem',
        }}>
          <span style={{ fontWeight: 600, color: '#a5b4fc', letterSpacing: '0.02em' }}>
            Social Handles (optional)
          </span>
          <label style={{ display: 'grid', gap: '0.2rem' }}>
            <span>X / Twitter</span>
            <input
              type="text"
              value={form.x}
              onChange={onChange('x')}
              placeholder="@yourhandle"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: '0.2rem' }}>
            <span>Instagram</span>
            <input
              type="text"
              value={form.instagram}
              onChange={onChange('instagram')}
              placeholder="@yourhandle"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: '0.2rem' }}>
            <span>TikTok</span>
            <input
              type="text"
              value={form.tiktok}
              onChange={onChange('tiktok')}
              placeholder="@yourhandle"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: '0.2rem' }}>
            <span>Truth Social</span>
            <input
              type="text"
              value={form.truth}
              onChange={onChange('truth')}
              placeholder="@yourhandle"
              style={inputStyle}
            />
          </label>
        </div>
      </div>

      {/* Motivational banner: slow rotation, smooth fade */}
      <div
        style={{
          marginTop: '1.5rem',
          padding: '1rem 1.25rem',
          borderRadius: 12,
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          minHeight: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'opacity 0.5s ease',
        }}
      >
        <p
          key={bannerIndex}
          style={{
            color: '#a5b4fc',
            fontSize: '0.95rem',
            margin: 0,
            textAlign: 'center',
            animation: 'contestBannerFade 0.5s ease',
          }}
        >
          {MOTIVATIONAL_LINES[bannerIndex]}
        </p>
      </div>

      {error && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: 12,
            background: 'rgba(220, 38, 38, 0.15)',
            border: '1px solid rgba(248, 113, 113, 0.35)',
            color: '#fecaca',
          }}
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: 12,
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(74, 222, 128, 0.35)',
            color: '#bbf7d0',
          }}
        >
          {successMessage}
        </div>
      )}

      {/* SPEC: Required beta acknowledgment during stress test */}
      {stressTestMode && (
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            marginTop: '1.5rem',
            marginBottom: '1rem',
            cursor: 'pointer',
            color: '#cbd5f5',
            fontSize: '0.9rem',
            lineHeight: 1.5,
          }}
        >
          <input
            type="checkbox"
            checked={betaAcknowledged}
            onChange={(e) => setBetaAcknowledged(e.target.checked)}
            style={{ marginTop: '4px', flexShrink: 0 }}
          />
          <span>
            I understand this is a public beta stress test. All purchases are simulated and no real deliveries will occur. I have read the{' '}
            <a
              href="/contest/beta-rules"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#00ff7f', textDecoration: 'underline' }}
            >
              Beta Test Rules
            </a>
            .
          </span>
        </label>
      )}

      {/* Quick completion reassurance */}
      <p style={{ marginTop: '1.5rem', marginBottom: 0, color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center' }}>
        Join the game. It takes less than 30 seconds.
      </p>

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        style={{
          marginTop: '1rem',
          width: '100%',
          padding: '0.95rem 1.25rem',
          borderRadius: 999,
          fontWeight: 700,
          fontSize: '1rem',
          letterSpacing: '0.04em',
          border: 'none',
          color: 'black',
          background: canSubmit && !submitting ? '#38ef7d' : '#94a3b8',
          cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          boxShadow: canSubmit && !submitting ? '0 15px 35px rgba(56, 239, 125, 0.35)' : 'none',
        }}
      >
        {submitting ? 'Saving…' : 'Officially Enter (500 pts)'}
      </button>

      {/* Legal line */}
      <p style={{ marginTop: '1.5rem', marginBottom: 0, color: '#64748b', fontSize: '0.8rem', textAlign: 'center' }}>
        No purchase necessary. Void where prohibited.
      </p>

      <style jsx global>{`
        @keyframes contestBannerFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </form>
  );
}

