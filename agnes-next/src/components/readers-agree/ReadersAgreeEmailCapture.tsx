'use client';

import { useEffect, useRef, useState, type Ref, type RefObject } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buildReadersAgreeContinuePath, type ReadersAgreeCaptureSurface, type ReadersAgreeRetailerOrigin } from '@/lib/readersAgreeLead';
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
}: ReadersAgreeEmailCaptureProps) {
  const router = useRouter();
  const internalRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [recognition, setRecognition] = useState<RecognitionState>({ status: 'checking' });
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

  const handleContinue = () => {
    const path = buildReadersAgreeContinuePath(searchParams);
    const url = new URL(path, 'http://local.invalid');
    if (retailerOrigin && !url.searchParams.get('origin')) {
      url.searchParams.set('origin', retailerOrigin);
    }
    if (captureSurface === 'bridge') url.searchParams.set('ra_surface', 'bridge');
    router.push(`${url.pathname}${url.search}`);
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
          Read the free chapters, then decide.
        </p>
      ) : (
        <>
          <p className="ra-email-capture-kicker">Not ready to buy? Start reading.</p>
          <p className="ra-email-capture-lead">Choose a chapter first. No email needed to begin.</p>
        </>
      )}
      <button type="button" className="ra-email-capture-submit" onClick={handleContinue}>
        {isBridge ? 'START READING' : 'Start Reading →'}
      </button>
      {error ? <p className="ra-email-capture-error">{error}</p> : null}
      <p className="ra-email-capture-privacy">
        <Link href="/privacy">Privacy Policy</Link>
      </p>
    </div>
  );
}
