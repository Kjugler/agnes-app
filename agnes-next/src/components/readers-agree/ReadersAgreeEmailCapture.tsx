'use client';

import { useEffect, useRef, useState, type FormEvent, type Ref, type RefObject } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { writeContestEmail } from '@/lib/identity';
import {
  buildReadersAgreeContinuePath,
  submitReadersAgreeLead,
  type ReadersAgreeCaptureSurface,
  type ReadersAgreeRetailerOrigin,
} from '@/lib/readersAgreeLead';
import {
  clearReadersAgreeRecognition,
  fetchReadersAgreeRecognition,
} from '@/lib/readersAgreeSession';
import './readers-agree-email.css';

type ReadersAgreeEmailCaptureProps = {
  searchParams: { get: (key: string) => string | null } | null;
  formRef?: RefObject<HTMLElement | null>;
  captureSurface?: ReadersAgreeCaptureSurface;
  retailerOrigin?: ReadersAgreeRetailerOrigin | null;
  variant?: 'landing' | 'bridge';
  inputId?: string;
};

type RecognitionState =
  | { status: 'checking' }
  | { status: 'anonymous' }
  | { status: 'recognized'; emailHint: string };

export default function ReadersAgreeEmailCapture({
  searchParams,
  formRef,
  captureSurface = 'landing',
  retailerOrigin = null,
  variant = 'landing',
  inputId,
}: ReadersAgreeEmailCaptureProps) {
  const router = useRouter();
  const internalRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [recognition, setRecognition] = useState<RecognitionState>({ status: 'checking' });
  const fieldId = inputId ?? (variant === 'bridge' ? 'ra-email-bridge' : 'ra-email-landing');
  const isBridge = variant === 'bridge';
  const boxRef = (formRef ?? internalRef) as Ref<HTMLDivElement>;

  useEffect(() => {
    let cancelled = false;
    fetchReadersAgreeRecognition().then((result) => {
      if (cancelled) return;
      setRecognition(
        result.recognized
          ? { status: 'recognized', emailHint: result.emailHint }
          : { status: 'anonymous' },
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const result = await submitReadersAgreeLead({
        email,
        searchParams,
        captureSurface: captureSurface === 'bridge' ? 'bridge' : 'landing',
        retailerOrigin,
      });

      if (!result.ok) {
        setError(
          result.error === 'invalid_email'
            ? 'Please enter a valid email address.'
            : 'Something went wrong. Please try again.',
        );
        return;
      }

      writeContestEmail(email.trim().toLowerCase());
      router.push(result.redirectPath);
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinue = () => {
    router.push(buildReadersAgreeContinuePath(searchParams));
  };

  const handleNotYou = async () => {
    if (switching) return;
    setSwitching(true);
    setError(null);
    const cleared = await clearReadersAgreeRecognition();
    setSwitching(false);
    if (!cleared) {
      setError('Something went wrong. Please try again.');
      return;
    }
    setEmail('');
    setRecognition({ status: 'anonymous' });
  };

  if (recognition.status === 'checking') {
    return (
      <div ref={boxRef} className={isBridge ? 'ra-email-capture ra-email-capture--bridge' : 'ra-email-capture'}>
        <p className="ra-email-capture-lead">Checking this browser…</p>
      </div>
    );
  }

  if (recognition.status === 'recognized') {
    return (
      <div ref={boxRef} className={isBridge ? 'ra-email-capture ra-email-capture--bridge' : 'ra-email-capture'}>
        <p className="ra-email-capture-kicker">Welcome back.</p>
        <p className="ra-email-capture-hint">Continuing as {recognition.emailHint}</p>
        <button type="button" className="ra-email-capture-submit" onClick={handleContinue}>
          {isBridge ? 'START READING' : 'Continue reading →'}
        </button>
        <button
          type="button"
          className="ra-email-capture-not-you"
          onClick={handleNotYou}
          disabled={switching}
        >
          {switching ? '…' : 'Not you?'}
        </button>
        {error ? <p className="ra-email-capture-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div ref={boxRef} className={isBridge ? 'ra-email-capture ra-email-capture--bridge' : 'ra-email-capture'}>
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
        <p className="ra-email-capture-privacy">
          By continuing, you&apos;ll receive access to the sample chapters.{' '}
          <Link href="/privacy">Privacy Policy</Link>
        </p>
      </form>
    </div>
  );
}
