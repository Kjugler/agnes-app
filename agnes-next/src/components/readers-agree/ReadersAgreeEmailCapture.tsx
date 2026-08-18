'use client';

import { useRef, useState, type FormEvent, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { submitReadersAgreeLead,
  type ReadersAgreeLeadCaptureSurface,
  type ReadersAgreeRetailerOrigin,
} from '@/lib/readersAgreeLead';
import './readers-agree-email.css';

type ReadersAgreeEmailCaptureProps = {
  variant: 'landing' | 'bridge';
  captureSurface: ReadersAgreeLeadCaptureSurface;
  retailerOrigin?: ReadersAgreeRetailerOrigin;
  searchParams: URLSearchParams | null;
  formRef?: RefObject<HTMLFormElement | null>;
  className?: string;
};

export default function ReadersAgreeEmailCapture({
  variant,
  captureSurface,
  retailerOrigin = null,
  searchParams,
  formRef,
  className = '',
}: ReadersAgreeEmailCaptureProps) {
  const router = useRouter();
  const internalRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isLanding = variant === 'landing';
  const submitLabel = isLanding ? 'Start Reading →' : 'Keep Exploring →';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    const result = await submitReadersAgreeLead({
      email,
      captureSurface,
      retailerOrigin,
      searchParams,
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

    router.push(result.redirectPath);
  };

  return (
    <div className={`ra-email-capture ${className}`.trim()}>
      {isLanding ? (
        <p className="ra-email-capture-lead">
          Get the free chapters — plus updates, extras, and other cool stuff.
        </p>
      ) : (
        <>
          <p className="ra-email-capture-bridge-kicker">Not ready yet? Stay in the loop.</p>
          <p className="ra-email-capture-lead">
            Get the free chapters, updates, extras, and other cool stuff.
          </p>
        </>
      )}

      <form
        ref={formRef ?? internalRef}
        className="ra-email-capture-form"
        onSubmit={handleSubmit}
        noValidate
      >
        <label className="ra-email-capture-label" htmlFor={`ra-email-${variant}`}>
          Email address
        </label>
        <div className="ra-email-capture-row">
          <input
            id={`ra-email-${variant}`}
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
            {submitting ? '…' : submitLabel}
          </button>
        </div>
        {error ? <p className="ra-email-capture-error">{error}</p> : null}
      </form>
    </div>
  );
}
