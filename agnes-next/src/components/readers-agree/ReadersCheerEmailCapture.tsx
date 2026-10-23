'use client';

import { useEffect, useRef, useState, type FormEvent, type Ref, type RefObject } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { markJodyAccessSettled } from '@/lib/departureBridge';
import { writeContestEmail } from '@/lib/identity';
import {
  buildReadersAgreeContinuePath,
  submitReadersAgreeLead,
} from '@/lib/readersAgreeLead';
import {
  clearReadersAgreeRecognition,
  fetchReadersAgreeRecognition,
} from '@/lib/readersAgreeSession';
import { sampleChaptersDestination } from '@/lib/sampleChapterNav';
import './readers-agree-email.css';

type ReadersCheerEmailCaptureProps = {
  searchParams: { get: (key: string) => string | null } | null;
  formRef?: RefObject<HTMLElement | null>;
};

type RecognitionState =
  | { status: 'checking' }
  | { status: 'anonymous' }
  | { status: 'recognized'; emailHint: string };

function hubDestination(redirectPath: string): string | null {
  const destination = sampleChaptersDestination(redirectPath);
  if (!destination.startsWith('/sample-chapters') || destination.includes('/read/')) return null;
  return destination;
}

export default function ReadersCheerEmailCapture({
  searchParams,
  formRef,
}: ReadersCheerEmailCaptureProps) {
  const router = useRouter();
  const internalRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [promotionalOptIn, setPromotionalOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [recognition, setRecognition] = useState<RecognitionState>({ status: 'checking' });
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

  const handleContinue = () => {
    const destination = hubDestination(buildReadersAgreeContinuePath(searchParams));
    if (!destination) {
      setError('Something went wrong. Please try again.');
      return;
    }
    router.push(destination);
  };

  const handleNotYou = async () => {
    if (switching || submitting) return;
    setSwitching(true);
    setError(null);
    const cleared = await clearReadersAgreeRecognition();
    setSwitching(false);
    if (!cleared) {
      setError('Something went wrong. Please try again.');
      return;
    }
    setRecognition({ status: 'anonymous' });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || switching) return;
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitReadersAgreeLead({
        email: trimmed,
        searchParams,
        captureSurface: 'cheer',
        promotionalOptIn,
      });
      if (!result.ok) {
        setError(
          result.error === 'invalid_email'
            ? 'Please enter a valid email address.'
            : 'Something went wrong. Please try again.',
        );
        return;
      }
      const destination = hubDestination(result.redirectPath);
      if (!destination) {
        setError('Something went wrong. Please try again.');
        return;
      }
      writeContestEmail(trimmed);
      markJodyAccessSettled();
      router.push(destination);
    } finally {
      setSubmitting(false);
    }
  };

  if (recognition.status === 'checking') {
    return (
      <div ref={boxRef} className="ra-email-capture" data-testid="readers-cheer-capture">
        <p className="ra-email-capture-lead">Checking this browser…</p>
      </div>
    );
  }

  if (recognition.status === 'recognized') {
    return (
      <div ref={boxRef} className="ra-email-capture" data-testid="readers-cheer-capture">
        <p className="ra-email-capture-kicker">Welcome back.</p>
        <p className="ra-email-capture-hint">Continuing as {recognition.emailHint}</p>
        <button type="button" className="ra-email-capture-submit" onClick={handleContinue}>
          Read Sample Chapters
        </button>
        <button
          type="button"
          className="ra-email-capture-not-you"
          onClick={handleNotYou}
          disabled={switching}
        >
          {switching ? '…' : 'Not you?'}
        </button>
        {error ? (
          <p className="ra-email-capture-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="ra-email-capture" data-testid="readers-cheer-capture">
      <p className="ra-email-capture-kicker">Read the sample chapters.</p>
      <p className="ra-email-capture-lead">Enter your email to continue. No purchase necessary.</p>
      <form className="ra-email-capture-form" onSubmit={handleSubmit}>
        <label className="ra-email-capture-label" htmlFor="readers-cheer-email">
          Email address
        </label>
        <div className="ra-email-capture-row">
          <input
            id="readers-cheer-email"
            className="ra-email-capture-input"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder="Email address"
            value={email}
            data-testid="readers-cheer-email"
            aria-invalid={error ? true : undefined}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button
            type="submit"
            className="ra-email-capture-submit"
            data-testid="readers-cheer-submit"
            disabled={submitting}
          >
            {submitting ? 'One moment…' : 'Read Sample Chapters'}
          </button>
        </div>
        <label className="ra-email-capture-consent">
          <input
            type="checkbox"
            name="promotionalOptIn"
            data-testid="readers-cheer-consent"
            checked={promotionalOptIn}
            onChange={(event) => setPromotionalOptIn(event.target.checked)}
          />
          <span>
            Yes, I&apos;d like occasional emails from Jody about the story, book updates, and ways to
            continue reading. I can unsubscribe anytime.
          </span>
        </label>
        <p className="ra-email-capture-privacy">Leaving this unchecked does not change reading access.</p>
        {error ? (
          <p className="ra-email-capture-error" role="alert" data-testid="readers-cheer-error">
            {error}
          </p>
        ) : null}
      </form>
      <p className="ra-email-capture-privacy">
        <Link href="/privacy">Privacy Policy</Link>
      </p>
    </div>
  );
}
