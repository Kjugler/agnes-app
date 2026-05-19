import { setSeenVariantCookie } from '@/lib/entryVariant';

const DISCOVERY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function hasTerminalDiscoveryComplete(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .some((c) => c.trim().startsWith('terminal_discovery_complete=1'));
}

export function setTerminalDiscoveryCompleteCookie(): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie =
      'terminal_discovery_complete=1; path=/; max-age=' +
      DISCOVERY_COOKIE_MAX_AGE +
      '; SameSite=Lax';
  } catch {
    /* ignore */
  }
}

/** Fire-and-forget; never blocks navigation. */
export function tryAwardTerminalDiscovery(): void {
  if (typeof window === 'undefined') return;
  void fetch('/api/contest/terminal-discovery', {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {});
}

/**
 * Build contest hub URL after terminal branch (pass-through or legacy /terminal).
 * Preserves email, ref, fromLightning; strips embed/skipLoad.
 */
export function buildContestTerminalPassUrl(
  source?: URLSearchParams | string,
): string {
  const params =
    source instanceof URLSearchParams
      ? new URLSearchParams(source)
      : new URLSearchParams(source ?? '');

  params.delete('embed');
  params.delete('skipLoad');
  params.set('v', 'terminal');
  params.set('terminalPass', '1');

  const qs = params.toString();
  return qs ? `/contest?${qs}` : '/contest?v=terminal&terminalPass=1';
}

/** Anti-trap cookies + optional award before leaving /terminal. */
export function completeTerminalPassThrough(source?: URLSearchParams): string {
  setSeenVariantCookie('terminal');
  setTerminalDiscoveryCompleteCookie();
  tryAwardTerminalDiscovery();
  return buildContestTerminalPassUrl(source);
}
