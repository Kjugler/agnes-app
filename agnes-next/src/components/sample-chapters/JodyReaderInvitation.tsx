'use client';

import { useState, type FormEvent } from 'react';
import { writeContestEmail } from '@/lib/identity';
import { submitReadersAgreeLead } from '@/lib/readersAgreeLead';
import { jodyEm2PortraitCropStyle } from '@/config/jodyPortraitStyle';

const JODY_ICON = '/jody-icons/jody-em2.png';

type JodyReaderInvitationProps = {
  searchParams: { get: (key: string) => string | null } | null;
  onAccessEstablished: () => void;
  onDecline: () => void;
};

export function JodyReaderInvitation({
  searchParams,
  onAccessEstablished,
  onDecline,
}: JodyReaderInvitationProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      const origin = searchParams?.get('origin');
      const result = await submitReadersAgreeLead({
        email: trimmed,
        searchParams,
        captureSurface: 'landing',
        retailerOrigin: origin === 'amazon' || origin === 'bn' ? origin : null,
      });
      if (!result.ok) {
        setError(
          result.error === 'invalid_email'
            ? 'Please enter a valid email address.'
            : 'Something went wrong. Please try again.',
        );
        return;
      }
      writeContestEmail(trimmed);
      onAccessEstablished();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="chapter-one-invite" data-testid="jody-reader-invitation">
      <div
        className="chapter-one-invite-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby="jody-reader-invite-title"
      >
        <img
          src={JODY_ICON}
          alt=""
          width={64}
          height={64}
          style={{
            ...jodyEm2PortraitCropStyle,
            borderRadius: '50%',
            border: '2px solid rgba(0, 255, 229, 0.45)',
          }}
        />
        <div>
          <p id="jody-reader-invite-title" className="chapter-one-invite-title">
            Hi. I&apos;m Jody.
          </p>
          <p>You&apos;ve been with this chapter for a little while.</p>
          <p>Leave your email and I&apos;ll keep it open for you — on this page, and when you come back.</p>
          <p className="chapter-one-invite-note">This is only so I know it&apos;s you. It is not a mailing list.</p>
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              required
              placeholder="Email address"
              value={email}
              data-testid="jody-reader-email"
              onChange={(event) => setEmail(event.target.value)}
            />
            {error ? (
              <p className="chapter-one-invite-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="chapter-one-invite-actions">
              <button type="submit" disabled={submitting}>
                {submitting ? 'One moment…' : 'Continue reading'}
              </button>
              <button type="button" data-testid="jody-reader-decline" onClick={onDecline}>
                Not now — I&apos;ll finish this page
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
