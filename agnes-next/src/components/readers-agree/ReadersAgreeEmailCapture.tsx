'use client';

import { useRef, useState, type FormEvent, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { writeContestEmail } from '@/lib/identity';
import {
  submitReadersAgreeLead,
  type ReadersAgreeCaptureSurface,
} from '@/lib/readersAgreeLead';
import './readers-agree-email.css';

type ReadersAgreeEmailCaptureProps = {
  searchParams: { get: (key: string) => string | null } | null;
  formRef?: RefObject<HTMLFormElement | null>;
  captureSurface?: ReadersAgreeCaptureSurface;
  variant?: 'landing' | 'bridge';
  inputId?: string;
};

export default function ReadersAgreeEmailCapture({
  searchParams,
  formRef,
  captureSurface = 'landing',
  variant = 'landing',
  inputId,
}: ReadersAgreeEmailCaptureProps) {
  const router = useRouter();
  const internalRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fieldId = inputId ?? (variant === 'bridge' ? 'ra-email-bridge' : 'ra-email-landing');
  const isBridge = variant === 'bridge';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    const result = await submitReadersAgreeLead({
      email,
      searchParams,
      captureSurface: captureSurface === 'bridge' ? 'bridge' : 'landing',
    });

    if (!result.ok) {
      setError(
        result.error === 'invalid_email'
          ? 'Please enter a valid email address.'
          : 'Something went wrong. Please try again.',
      );
      setSubmitting(false);
      return;
    }

    writeContestEmail(email.trim().toLowerCase());
    router.push(result.redirectPath);
  };

  return (
    <div className={isBridge ? 'ra-email-capture ra-email-capture--bridge' : 'ra-email-capture'}>
      {isBridge ? (
        <p className="ra-email-capture-lead ra-email-capture-lead--bridge">
          Enter your email address to read free chapters
        </p>
      ) : (
        <>
          <p className="ra-email-capture-kicker">Not ready to buy? Start reading.</p>
          <p className="ra-email-capture-lead">
            Enter your email to read the sample chapters.
          </p>
        </>
      )}

      <form
        ref={formRef ?? internalRef}
        className="ra-email-capture-form"
        onSubmit={handleSubmit}
        noValidate
      >
        <label className="ra-email-capture-label" htmlFor={fieldId}>
          Email address
        </label>
        <div className="ra-email-capture-row">
          <input
            id={fieldId}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            className="ra-email-capture-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={submitting}
          />
          <button type="submit" className="ra-email-capture-submit" disabled={submitting}>
            {submitting ? '…' : isBridge ? 'START READING' : 'Start Reading →'}
          </button>
        </div>
        {error ? <p className="ra-email-capture-error">{error}</p> : null}
      </form>
    </div>
  );
}
