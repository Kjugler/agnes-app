'use client';

import { useState, type FormEvent } from 'react';
import { writeContestEmail } from '@/lib/identity';
import { submitReadersAgreeLead } from '@/lib/readersAgreeLead';
import { jodyEm2PortraitCropStyle } from '@/config/jodyPortraitStyle';

const JODY_ICON = '/jody-icons/jody-em2.png';

type JodyReaderInvitationProps = {
  searchParams: { get: (key: string) => string | null } | null;
  onAccessEstablished: () => void;
  onDecline: () => Promise<void>;
};

export function JodyReaderInvitation({
  searchParams,
  onAccessEstablished,
  onDecline,
}: JodyReaderInvitationProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || declining) return;
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
        captureSurface: searchParams?.get('ra_surface') === 'bridge' ? 'bridge' : 'landing',
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

  const handleNotNow = async () => {
    if (submitting || declining) return;
    setError(null);
    setDeclining(true);
    try {
      await onDecline();
    } catch {
      setError('Something went wrong. Please try again.');
      setDeclining(false);
    }
  };

  return (
    <div className="chapter-one-invite chapter-one-invite--blocking" data-testid="jody-reader-invitation">
      <div
        className="chapter-one-invite-card"
        role="dialog"
        aria-modal="true"
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
          <p>Enjoying the story? I&apos;d love to let you keep reading.</p>
          <p>Just tell me where to send your reading access.</p>
          <p>Your email unlocks all four sample chapters. No purchase necessary.</p>
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
              <button type="submit" disabled={submitting || declining}>
                {submitting ? 'One moment…' : 'Continue Reading — Enter Email'}
              </button>
              <button
                type="button"
                data-testid="jody-reader-decline"
                disabled={submitting || declining}
                onClick={handleNotNow}
              >
                {declining ? 'One moment…' : 'Not Now — Back to Website'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
