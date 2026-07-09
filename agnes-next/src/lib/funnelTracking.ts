'use client';

import { useEffect, useRef } from 'react';

export const FUNNEL_EVENT_TYPES = {
  READERS_AGREE_PAGE_VIEW: 'READERS_AGREE_PAGE_VIEW',
  READERS_AGREE_TIME_ON_PAGE: 'READERS_AGREE_TIME_ON_PAGE',
  READERS_AGREE_SCROLL_DEPTH: 'READERS_AGREE_SCROLL_DEPTH',
  READERS_AGREE_AMAZON_CLICK: 'READERS_AGREE_AMAZON_CLICK',
  READERS_AGREE_BN_CLICK: 'READERS_AGREE_BN_CLICK',
  READERS_AGREE_SAMPLE_CHAPTERS_CLICK: 'READERS_AGREE_SAMPLE_CHAPTERS_CLICK',

  SAMPLE_CHAPTERS_PAGE_VIEW: 'SAMPLE_CHAPTERS_PAGE_VIEW',
  SAMPLE_CHAPTER_OPEN: 'SAMPLE_CHAPTER_OPEN',
  SAMPLE_CHAPTER_TIME_ON_PAGE: 'SAMPLE_CHAPTER_TIME_ON_PAGE',
  SAMPLE_CHAPTERS_BUY_CLICK: 'SAMPLE_CHAPTERS_BUY_CLICK',
  SAMPLE_CHAPTERS_HUB_CLICK: 'SAMPLE_CHAPTERS_HUB_CLICK',

  CHECKOUT_STARTED: 'CHECKOUT_STARTED',
  PURCHASE_COMPLETED: 'PURCHASE_COMPLETED',
} as const;

export type FunnelEventType = (typeof FUNNEL_EVENT_TYPES)[keyof typeof FUNNEL_EVENT_TYPES];

const VISITOR_COOKIE = 'ap_funnel_vid';
const VISITOR_STORAGE = 'ap_funnel_vid';

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `fv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function getOrCreateVisitorId(): string {
  if (typeof window === 'undefined') return '';

  try {
    const fromStorage = window.localStorage.getItem(VISITOR_STORAGE);
    if (fromStorage) return fromStorage;
  } catch {
    /* ignore */
  }

  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${VISITOR_COOKIE}=([^;]*)`));
    if (match?.[1]) {
      const id = decodeURIComponent(match[1]);
      try {
        window.localStorage.setItem(VISITOR_STORAGE, id);
      } catch {
        /* ignore */
      }
      return id;
    }
  } catch {
    /* ignore */
  }

  const id = randomId();
  try {
    window.localStorage.setItem(VISITOR_STORAGE, id);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${VISITOR_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  } catch {
    /* ignore */
  }
  return id;
}

export function getAttributionFromPage(searchParams?: URLSearchParams | null) {
  if (typeof window === 'undefined') {
    return { ref: null as string | null, utm: {} as Record<string, string> };
  }

  const params = searchParams ?? new URLSearchParams(window.location.search);
  const keys = ['ref', 'utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'src', 'origin'] as const;
  const utm: Record<string, string> = {};

  for (const key of keys) {
    const value = params.get(key);
    if (value) utm[key] = value;
  }

  let ref = params.get('ref') || params.get('code') || null;
  if (!ref) {
    try {
      const cookies = document.cookie.split(';');
      for (const c of cookies) {
        const trimmed = c.trim();
        if (trimmed.startsWith('ap_ref=') || trimmed.startsWith('ref=')) {
          ref = decodeURIComponent(trimmed.split('=').slice(1).join('='));
          break;
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { ref, utm };
}

type TrackMeta = Record<string, string | number | boolean | null | undefined>;

export function trackFunnelEvent(
  type: FunnelEventType,
  meta: TrackMeta = {},
  opts?: { source?: string; searchParams?: URLSearchParams | null },
) {
  if (typeof window === 'undefined') return;

  const visitorId = getOrCreateVisitorId();
  const { ref, utm } = getAttributionFromPage(opts?.searchParams);
  const path = window.location.pathname + window.location.search;

  const payload = {
    type,
    visitorId,
    ref,
    path,
    source: opts?.source || null,
    meta: { ...utm, ...meta },
  };

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/funnel/event', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
      return;
    }
  } catch {
    /* fall through */
  }

  fetch('/api/funnel/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

const SCROLL_MILESTONES = [25, 50, 75, 100] as const;

export function useFunnelPageEngagement(options: {
  pageViewType: FunnelEventType;
  timeOnPageType?: FunnelEventType;
  scrollDepthType?: FunnelEventType;
  source?: string;
  searchParams?: URLSearchParams | null;
  extraPageViewMeta?: TrackMeta;
  extraEngagementMeta?: TrackMeta;
}) {
  const {
    pageViewType,
    timeOnPageType,
    scrollDepthType,
    source,
    searchParams,
    extraPageViewMeta = {},
    extraEngagementMeta = {},
  } = options;

  const startRef = useRef(Date.now());
  const viewFiredRef = useRef(false);
  const scrollFiredRef = useRef<Set<number>>(new Set());
  const metaKey = JSON.stringify(extraPageViewMeta);
  const engagementKey = JSON.stringify(extraEngagementMeta);

  useEffect(() => {
    if (viewFiredRef.current) return;
    viewFiredRef.current = true;
    trackFunnelEvent(pageViewType, extraPageViewMeta, { source, searchParams });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount
  }, [pageViewType, source, searchParams, metaKey]);

  useEffect(() => {
    if (!scrollDepthType) return;
    const depthEventType = scrollDepthType;

    function onScroll() {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop;
      const height = Math.max(doc.scrollHeight - window.innerHeight, 1);
      const pct = Math.min(100, Math.round((scrollTop / height) * 100));

      for (const milestone of SCROLL_MILESTONES) {
        if (depthEventType && pct >= milestone && !scrollFiredRef.current.has(milestone)) {
          scrollFiredRef.current.add(milestone);
          trackFunnelEvent(
            depthEventType,
            { depthPercent: milestone, ...extraEngagementMeta },
            { source, searchParams },
          );
        }
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [scrollDepthType, source, searchParams, engagementKey]);

  useEffect(() => {
    if (!timeOnPageType) return;
    const timeEventType = timeOnPageType;

    function flushTime() {
      const seconds = Math.round((Date.now() - startRef.current) / 1000);
      if (seconds < 1) return;
      trackFunnelEvent(
        timeEventType,
        { secondsOnPage: seconds, ...extraEngagementMeta },
        { source, searchParams },
      );
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') flushTime();
    }

    window.addEventListener('pagehide', flushTime);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      flushTime();
      window.removeEventListener('pagehide', flushTime);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [timeOnPageType, source, searchParams, engagementKey]);
}
