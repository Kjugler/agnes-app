'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { JodyConciergePostVerify } from '@/components/jody/JodyConcierge';
import { contestLoginWithEmail, fetchJodyReaderState } from '@/lib/jodyConciergeApi';
import { writeContestEmail } from '@/lib/identity';
import { markReaderKnown } from '@/lib/readerStatus';

type VerifyState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      email: string;
      chapterId: string;
      greetingName: string | null;
      showUpdates: boolean;
    };

export default function JodyVerifyClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<VerifyState>({ status: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ status: 'error', message: 'This link is missing a verification token.' });
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        const res = await fetch(
          `/api/jody/remember/verify?token=${encodeURIComponent(token!)}`,
          { credentials: 'include' },
        );
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok || !data?.ok) {
          setState({
            status: 'error',
            message: 'This link is invalid or has expired. You can request a new one from Jody.',
          });
          return;
        }

        writeContestEmail(data.email);
        markReaderKnown();
        await contestLoginWithEmail(data.email);

        const freshState = await fetchJodyReaderState();
        const showUpdates = !freshState?.emailUpdatesConsent;

        setState({
          status: 'success',
          email: data.email,
          chapterId: data.chapterId,
          greetingName: data.greetingName ?? null,
          showUpdates,
        });
      } catch {
        if (!cancelled) {
          setState({ status: 'error', message: 'Something went wrong. Please try again.' });
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div
      style={{
        minHeight: '100svh',
        backgroundColor: '#000',
        color: '#00ffe5',
        fontFamily: '"Courier New", Courier, monospace',
        padding:
          'max(24px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))',
      }}
    >
      <p style={{ textAlign: 'center', marginBottom: 24, fontSize: 14 }}>
        <Link href="/sample-chapters" style={{ color: '#00ffe5' }}>
          ← Sample Chapters
        </Link>
      </p>

      {state.status === 'loading' && (
        <p style={{ textAlign: 'center', color: 'rgba(0, 255, 229, 0.75)' }}>Verifying…</p>
      )}

      {state.status === 'error' && (
        <div style={{ textAlign: 'center', maxWidth: 400, margin: '0 auto' }}>
          <p style={{ lineHeight: 1.6, marginBottom: 16 }}>{state.message}</p>
          <Link
            href="/sample-chapters"
            style={{
              display: 'inline-block',
              padding: '12px 20px',
              border: '1px solid #00ffe5',
              borderRadius: 8,
              color: '#00ffe5',
              textDecoration: 'none',
            }}
          >
            Back to Sample Chapters
          </Link>
        </div>
      )}

      {state.status === 'success' && (
        <JodyConciergePostVerify
          greetingName={state.greetingName}
          chapterId={state.chapterId}
          showUpdates={state.showUpdates}
        />
      )}
    </div>
  );
}
