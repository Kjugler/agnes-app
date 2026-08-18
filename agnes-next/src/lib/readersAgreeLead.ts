'use client';

import {
  getAttributionFromPage,
  getOrCreateVisitorId,
} from '@/lib/funnelTracking';
import { markReadersAgreeLeadSession } from '@/lib/readersAgreeLeadSession';

export type ReadersAgreeLeadCaptureSurface = 'landing' | 'bridge';
export type ReadersAgreeRetailerOrigin = 'amazon' | 'bn' | null;

export type SubmitReadersAgreeLeadInput = {
  email: string;
  captureSurface: ReadersAgreeLeadCaptureSurface;
  retailerOrigin?: ReadersAgreeRetailerOrigin;
  searchParams?: URLSearchParams | null;
};

export type SubmitReadersAgreeLeadResult =
  | { ok: true; redirectPath: string }
  | { ok: false; error: string };

function buildUtmPayload(searchParams?: URLSearchParams | null) {
  const { ref, utm } = getAttributionFromPage(searchParams);
  const params = searchParams ?? (typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null);
  const code = params?.get('code') || null;
  return { ref, code, utm };
}

export async function submitReadersAgreeLead(
  input: SubmitReadersAgreeLeadInput,
): Promise<SubmitReadersAgreeLeadResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'invalid_email' };
  }

  const { ref, code, utm } = buildUtmPayload(input.searchParams);
  const visitorId = getOrCreateVisitorId();

  const res = await fetch('/api/readers-agree/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      visitorId,
      ref,
      code,
      utm,
      consentAccepted: true,
      captureSurface: input.captureSurface,
      retailerOrigin: input.retailerOrigin ?? null,
    }),
  });

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
