export type JodyReaderState = {
  userId: string;
  email: string;
  greetingName: string | null;
  lastCompletedChapterId: string | null;
  lastCompletedAt: string | null;
  emailUpdatesConsent: boolean;
  emailUpdatesConsentAt: string | null;
  jodyVerifiedAt: string | null;
  isVerified: boolean;
  hasPurchased: boolean;
  readerStatus: string;
};

export async function fetchJodyReaderState(): Promise<JodyReaderState | null> {
  try {
    const res = await fetch('/api/jody/state', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ok ? data.state : null;
  } catch {
    return null;
  }
}

export async function requestRememberPlaceEmail(
  email: string,
  chapterId: string,
): Promise<{ ok: boolean; error?: string; emailSent?: boolean }> {
  try {
    const res = await fetch('/api/jody/remember/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, chapterId }),
      credentials: 'include',
    });
    const data = await res.json();
    return { ok: Boolean(data?.ok), error: data?.error, emailSent: data?.emailSent };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

export async function submitJodyUpdatesConsent(accept: boolean): Promise<boolean> {
  try {
    const res = await fetch('/api/jody/updates-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accept }),
      credentials: 'include',
    });
    const data = await res.json();
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

export async function contestLoginWithEmail(email: string): Promise<{
  ok: boolean;
  greetingName?: string;
  isReturning?: boolean;
}> {
  try {
    const res = await fetch('/api/contest/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      credentials: 'include',
    });
    const data = await res.json();
    return {
      ok: Boolean(data?.ok),
      greetingName: data?.greetingName,
      isReturning: data?.isReturning,
    };
  } catch {
    return { ok: false };
  }
}
