'use client';

import {
  AD_CHOICE_COOKIE,
  ADVERTISING_COOKIE_NAMES,
  PRIVACY_CHANGE_EVENT,
  PRIVACY_CHOICES_EVENT,
  PRIVACY_COOKIE_MAX_AGE_SECONDS,
  PRIVACY_REGION_COOKIE,
  buildAdvertisingConsentSnapshot,
  parseAdChoice,
  parsePrivacyRegion,
  type AdChoice,
  type AdvertisingConsentSnapshot,
  type PrivacyRegion,
} from './advertisingConsent';
import { applyGoogleConsentUpdate } from './googleConsentModeClient';

type ConsentListener = (snapshot: AdvertisingConsentSnapshot) => void;

let hydratedRegion: PrivacyRegion = 'US';
let hydratedChoice: AdChoice = 'unset';
const listeners = new Set<ConsentListener>();

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${PRIVACY_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function readGpc(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function hydrateAdvertisingConsent(snapshot: AdvertisingConsentSnapshot): void {
  hydratedRegion = snapshot.region;
  hydratedChoice = snapshot.choice;
}

export function getAdvertisingConsentSnapshot(): AdvertisingConsentSnapshot {
  const region = parsePrivacyRegion(readCookie(PRIVACY_REGION_COOKIE)) || hydratedRegion;
  const choice = parseAdChoice(readCookie(AD_CHOICE_COOKIE) || hydratedChoice);
  hydratedRegion = region;
  hydratedChoice = choice;
  return buildAdvertisingConsentSnapshot({
    region,
    choice,
    gpc: readGpc(),
  });
}

/** Authoritative Stage 2 gate for Pixel/CAPI/Events API/retailer ad events. */
export function mayUseAdvertisingMeasurement(): boolean {
  return getAdvertisingConsentSnapshot().allowed;
}

export function subscribeAdvertisingConsent(listener: ConsentListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  const snapshot = getAdvertisingConsentSnapshot();
  listeners.forEach((listener) => listener(snapshot));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRIVACY_CHANGE_EVENT, { detail: snapshot }));
  }
}

export function clearAdvertisingCookies(): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const expire = `Path=/; Max-Age=0; SameSite=Lax${secure}`;
  for (const name of ADVERTISING_COOKIE_NAMES) {
    document.cookie = `${name}=; ${expire}`;
  }
}

function disableLoadedAdvertisingTags(): void {
  if (typeof window === 'undefined') return;
  try {
    window.fbq?.('consent', 'revoke');
  } catch {
    /* swallow */
  }
  try {
    const ttq = window.ttq as
      | { disableCookie?: () => void; revokeConsent?: () => void }
      | undefined;
    ttq?.disableCookie?.();
    ttq?.revokeConsent?.();
  } catch {
    /* swallow */
  }
  try {
    if (!window.uetq) window.uetq = [];
    const q = window.uetq as { push?: (...args: unknown[]) => void };
    q.push?.('consent', 'update', { ad_storage: 'denied' });
  } catch {
    /* swallow */
  }
  try {
    applyGoogleConsentUpdate(false);
  } catch {
    /* swallow */
  }
}

export function persistAdvertisingChoice(choice: AdChoice): AdvertisingConsentSnapshot {
  hydratedChoice = choice;
  if (choice === 'unset') {
    if (typeof document !== 'undefined') {
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${AD_CHOICE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    }
  } else {
    writeCookie(AD_CHOICE_COOKIE, choice);
  }
  const snapshot = getAdvertisingConsentSnapshot();
  try {
    applyGoogleConsentUpdate(snapshot.allowed);
  } catch {
    /* swallow */
  }
  if (!snapshot.allowed) {
    clearAdvertisingCookies();
    disableLoadedAdvertisingTags();
  }
  notify();
  return snapshot;
}

/** GPC is a live override. Persist deny so ads do not resume when GPC is later turned off. */
export function honorGpcIfPresent(): AdvertisingConsentSnapshot {
  const snapshot = getAdvertisingConsentSnapshot();
  if (snapshot.gpc && snapshot.choice !== 'deny') {
    return persistAdvertisingChoice('deny');
  }
  return snapshot;
}

export function openPrivacyChoices(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PRIVACY_CHOICES_EVENT));
}

export function ensureRegionCookie(region: PrivacyRegion): void {
  hydratedRegion = region;
  const existing = parsePrivacyRegion(readCookie(PRIVACY_REGION_COOKIE));
  if (existing !== region) {
    writeCookie(PRIVACY_REGION_COOKIE, region);
  }
}
