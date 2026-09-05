'use client';

import {
  getAttributionFromPage,
  getOrCreateVisitorId,
} from '@/lib/funnelTracking';
import { markReadersAgreeLeadSession } from '@/lib/readersAgreeLeadSession';

export type SubmitReadersAgreeLeadResult =
  | { ok: true; redirectPath: string }
  | { ok: false; error: string };

type SearchParamsLike = { get: (key: string) => string | null } | null | undefined;

export async function submitReadersAgreeLead(input: {
  email: string;
  searchParams?: SearchParamsLike;
}): Promise<SubmitReadersAgreeLeadResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'invalid_email' };
  }

  const { ref, utm } = getAttributionFromPage(input.searchParams);
  const params =
    input.searchParams ??
    (typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null);
  const code = params?.get('code') || null;
  const visitorId = getOrCreateVisitorId();

  let res: Response;
  try {
    res = await fetch('/api/readers-agree/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        visitorId,
        ref,
        code,
        utm,
        captureSurface: 'landing',
      }),
      credentials: 'include',
    });
  } catch {
    return { ok: false, error: 'submit_failed' };
  }

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    redirectPath?: string;
    error?: string;
  };

  if (!res.ok || !data.ok || !data.redirectPath) {
    return { ok: false, error: data.error || 'submit_failed' };
  }

  markReadersAgreeLeadSession();
  return { ok: true, redirectPath: data.redirectPath };
}
