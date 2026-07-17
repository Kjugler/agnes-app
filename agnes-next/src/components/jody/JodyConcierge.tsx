'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  JODY_CONCIERGE_COPY,
  resolveCopyLine,
  type JodyBeatId,
} from '@/config/jodyConciergeCopy';
import { getNextChapterId, JODY_CONCIERGE_CONFIG } from '@/config/jodyConcierge';
import { isJodyConciergeEnabled } from '@/lib/funnelConfig';
import {
  fetchJodyReaderState,
  requestRememberPlaceEmail,
  submitJodyUpdatesConsent,
  type JodyReaderState,
} from '@/lib/jodyConciergeApi';
import { readContestEmail, writeContestEmail } from '@/lib/identity';
import {
  dismissRememberOffer,
  isRememberDismissed,
} from '@/lib/readerJourney';
import type { ReaderStatus } from '@/config/readerStatus';
import { FUNNEL_EVENT_TYPES, trackFunnelEvent } from '@/lib/funnelTracking';
import { JodyConciergeShell, primaryBtn, secondaryBtn } from './JodyConciergeShell';

export type JodyConciergeMode = 'remember-offer' | 'return-welcome' | 'updates-only';

interface JodyConciergeProps {
  mode: JodyConciergeMode;
  chapterId?: string;
  /** Pre-loaded reader state (optional). */
  readerState?: JodyReaderState | null;
  readerStatus?: ReaderStatus;
  onClose?: () => void;
}

function BeatContent({
  beatId,
  vars,
  email,
  onEmailChange,
  emailError,
  submitting,
}: {
  beatId: JodyBeatId;
  vars: Record<string, string | null | undefined>;
  email: string;
  onEmailChange: (v: string) => void;
  emailError: string | null;
  submitting: boolean;
}) {
  const beat = JODY_CONCIERGE_COPY[beatId];

  return (
    <>
      {beat.lines.map((line, i) => (
        <p key={i} style={{ margin: i === 0 ? '0 0 8px 0' : '0 0 8px 0' }}>
          {resolveCopyLine(line, vars)}
        </p>
      ))}

      {beat.bulletItems && (
        <ul style={{ margin: '8px 0 12px 0', paddingLeft: 20, lineHeight: 1.5 }}>
          {beat.bulletItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      {beatId === 'email-capture' && (
        <div style={{ marginTop: 8, marginBottom: 4 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={submitting}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid rgba(0, 255, 229, 0.4)',
              background: 'rgba(0, 0, 0, 0.35)',
              color: '#e6fffb',
              fontSize: 14,
            }}
          />
          {emailError && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#ffb4b4' }}>{emailError}</p>
          )}
        </div>
      )}
    </>
  );
}

export function JodyConcierge({
  mode,
  chapterId,
  readerState: initialState,
  readerStatus,
  onClose,
}: JodyConciergeProps) {
  const [open, setOpen] = useState(true);
  const [beatId, setBeatId] = useState<JodyBeatId>(
    mode === 'return-welcome' ? 'return-welcome' : mode === 'updates-only' ? 'updates-offer' : 'remember-offer',
  );
  const [readerState, setReaderState] = useState<JodyReaderState | null>(initialState ?? null);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const appearTrackedRef = React.useRef(false);

  const effectiveChapterId = chapterId ?? JODY_CONCIERGE_CONFIG.firstAppearAfterChapter;

  useEffect(() => {
    if (!isJodyConciergeEnabled()) return;
    if (appearTrackedRef.current) return;
    appearTrackedRef.current = true;
    trackFunnelEvent(
      FUNNEL_EVENT_TYPES.JODY_APPEAR,
      {
        beatId,
        mode,
        chapterId: effectiveChapterId,
        readerStatus: readerStatus ?? null,
      },
      { source: 'jody-concierge' },
    );
  }, [beatId, mode, effectiveChapterId, readerStatus]);

  useEffect(() => {
    if (initialState) return;
    fetchJodyReaderState().then(setReaderState).catch(() => {});
  }, [initialState]);

  useEffect(() => {
    const existing = readContestEmail();
    if (existing) setEmail(existing);
  }, []);

  const nextChapter = getNextChapterId(
    readerState?.lastCompletedChapterId ?? effectiveChapterId,
  );

  const greetingName =
    readerState?.greetingName ||
    (email ? email.split('@')[0] : 'friend');

  const vars = {
    greetingName,
    nextChapter: nextChapter ?? '2',
  };

  const handleClose = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  const handleRememberAccept = () => {
    trackFunnelEvent(
      FUNNEL_EVENT_TYPES.JODY_REMEMBER_PLACE_ACCEPT,
      { chapterId: effectiveChapterId },
      { source: 'jody-concierge' },
    );
    setBeatId('email-capture');
  };

  const handleRememberDecline = () => {
    trackFunnelEvent(
      FUNNEL_EVENT_TYPES.JODY_REMEMBER_PLACE_DECLINE,
      { chapterId: effectiveChapterId },
      { source: 'jody-concierge' },
    );
    dismissRememberOffer();
    handleClose();
  };

  const handleEmailSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setEmailError(null);
    setSubmitting(true);
    const result = await requestRememberPlaceEmail(trimmed, effectiveChapterId);
    setSubmitting(false);
    if (!result.ok) {
      setEmailError('Something went wrong. Please try again.');
      return;
    }
    writeContestEmail(trimmed);
    setBeatId('email-sent');
  };

  const handleUpdatesAccept = async () => {
    trackFunnelEvent(FUNNEL_EVENT_TYPES.JODY_UPDATES_ACCEPT, {}, { source: 'jody-concierge' });
    await submitJodyUpdatesConsent(true);
    handleClose();
  };

  const handleUpdatesDecline = () => {
    trackFunnelEvent(FUNNEL_EVENT_TYPES.JODY_UPDATES_DECLINE, {}, { source: 'jody-concierge' });
    submitJodyUpdatesConsent(false).catch(() => {});
    handleClose();
  };

  const continueHref = nextChapter
    ? `/sample-chapters/read/${nextChapter}`
    : '/sample-chapters';

  const renderActions = () => {
    const beat = JODY_CONCIERGE_COPY[beatId];
    const actions: React.ReactNode[] = [];

    if (beat.primaryAction) {
      const { id, label } = beat.primaryAction;
      if (id === 'remember-accept') {
        actions.push(
          <button key={id} type="button" style={primaryBtn} onClick={handleRememberAccept}>
            {label}
          </button>,
        );
      } else if (id === 'email-submit') {
        actions.push(
          <button
            key={id}
            type="button"
            style={{ ...primaryBtn, opacity: submitting ? 0.7 : 1 }}
            onClick={handleEmailSubmit}
            disabled={submitting}
          >
            {submitting ? 'Sending…' : label}
          </button>,
        );
      } else if (id === 'verified-continue' || id === 'return-continue') {
        actions.push(
          <Link key={id} href={continueHref} style={{ ...primaryBtn, textDecoration: 'none', display: 'inline-block' }}>
            {label}
          </Link>,
        );
      } else if (id === 'updates-accept') {
        actions.push(
          <button key={id} type="button" style={primaryBtn} onClick={handleUpdatesAccept}>
            {label}
          </button>,
        );
      }
    }

    if (beat.secondaryAction) {
      const { id, label } = beat.secondaryAction;
      if (id === 'remember-decline') {
        actions.push(
          <button key={id} type="button" style={secondaryBtn} onClick={handleRememberDecline}>
            {label}
          </button>,
        );
      } else if (id === 'email-back') {
        actions.push(
          <button key={id} type="button" style={secondaryBtn} onClick={() => setBeatId('remember-offer')}>
            {label}
          </button>,
        );
      } else if (id === 'email-sent-close') {
        actions.push(
          <button key={id} type="button" style={secondaryBtn} onClick={handleClose}>
            {label}
          </button>,
        );
      } else if (id === 'updates-decline' || id === 'return-dismiss') {
        actions.push(
          <button
            key={id}
            type="button"
            style={secondaryBtn}
            onClick={id === 'updates-decline' ? handleUpdatesDecline : handleClose}
          >
            {label}
          </button>,
        );
      }
    }

    if (actions.length === 0) return null;

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {actions}
      </div>
    );
  };

  if (!isJodyConciergeEnabled() || !open) return null;

  return (
    <JodyConciergeShell open={open} onClose={handleClose}>
      <BeatContent
        beatId={beatId}
        vars={vars}
        email={email}
        onEmailChange={setEmail}
        emailError={emailError}
        submitting={submitting}
      />
      {renderActions()}
    </JodyConciergeShell>
  );
}

/** Called after email verification completes — advances to success + updates beats. */
const equalActionBtn: React.CSSProperties = {
  ...primaryBtn,
  flex: '1 1 140px',
  textAlign: 'center',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export function JodyConciergePostVerify({
  greetingName,
  chapterId,
  showUpdates,
}: {
  greetingName: string | null;
  chapterId: string;
  showUpdates: boolean;
}) {
  const [beatId, setBeatId] = useState<JodyBeatId>('verified-success');
  const nextChapter = getNextChapterId(chapterId);
  const continueHref = nextChapter
    ? `/sample-chapters/read/${nextChapter}`
    : '/sample-chapters';
  const catalogHref = '/catalog';

  useEffect(() => {
    trackFunnelEvent(
      FUNNEL_EVENT_TYPES.JODY_EMAIL_VERIFIED,
      { chapterId },
      { source: 'jody-verify' },
    );
  }, [chapterId]);

  const beat = JODY_CONCIERGE_COPY[beatId];
  const vars = { greetingName: greetingName ?? 'friend', nextChapter: nextChapter ?? '2' };

  const goToSavedLocation = () => {
    window.location.href = continueHref;
  };

  const handleContinueReading = () => {
    if (showUpdates) {
      setBeatId('updates-offer');
      return;
    }
    goToSavedLocation();
  };

  const handleUpdatesAccept = async () => {
    trackFunnelEvent(FUNNEL_EVENT_TYPES.JODY_UPDATES_ACCEPT, {}, { source: 'jody-verify' });
    await submitJodyUpdatesConsent(true);
    goToSavedLocation();
  };

  const handleUpdatesDecline = () => {
    trackFunnelEvent(FUNNEL_EVENT_TYPES.JODY_UPDATES_DECLINE, {}, { source: 'jody-verify' });
    submitJodyUpdatesConsent(false).catch(() => {});
    goToSavedLocation();
  };

  return (
    <div
      style={{
        maxWidth: 420,
        margin: '0 auto',
        padding: '24px 20px',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        color: '#e6fffb',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
        <img
          src="/jody-icons/jody-em2.png"
          alt=""
          width={48}
          height={48}
          style={{ borderRadius: '50%', objectFit: 'cover' }}
        />
        <div>
          {beat.lines.map((line, i) => (
            <p key={i} style={{ margin: '0 0 8px 0', lineHeight: 1.55 }}>
              {resolveCopyLine(line, vars)}
            </p>
          ))}
          {beat.bulletItems && (
            <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
              {beat.bulletItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {beatId === 'verified-success' && (
          <>
            <button type="button" style={equalActionBtn} onClick={handleContinueReading}>
              Continue Reading
            </button>
            <Link href={catalogHref} style={equalActionBtn}>
              Buy the Book
            </Link>
          </>
        )}
        {beatId === 'updates-offer' && (
          <>
            <button type="button" style={primaryBtn} onClick={handleUpdatesAccept}>
              Yes
            </button>
            <button type="button" style={secondaryBtn} onClick={handleUpdatesDecline}>
              No Thanks
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export {
  isRememberDismissed,
  dismissRememberOffer,
};
