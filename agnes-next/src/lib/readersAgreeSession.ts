'use client';

import { clearReadersAgreeLeadSession } from '@/lib/readersAgreeLeadSession';

export type ReadersAgreeRecognition =
  | { recognized: false }
  | { recognized: true; emailHint: string };

const HINT = /^.•••@\S+$/;

export async function fetchReadersAgreeRecognition(): Promise<ReadersAgreeRecognition> {
  try {
    const res = await fetch('/api/readers-agree/session', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as {
      recognized?: boolean;
      emailHint?: string;
    };
    if (
      res.ok &&
      data.recognized === true &&
      typeof data.emailHint === 'string' &&
      HINT.test(data.emailHint)
    ) {
      return { recognized: true, emailHint: data.emailHint };
    }
  } catch {
    /* treat as unrecognized; do not clear anything from the client */
  }
  return { recognized: false };
}

export async function clearReadersAgreeRecognition(): Promise<boolean> {
  clearReadersAgreeLeadSession();
  try {
    const res = await fetch('/api/readers-agree/session/clear', {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}
