export async function requestChapterDelivery(
  email: string,
  chapterId: string,
): Promise<{ ok: boolean; error?: string; emailSent?: boolean }> {
  try {
    const res = await fetch('/api/jody/chapter/deliver', {
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

export type ChapterContinuePayload = {
  email: string;
  chapterId: string;
  greetingName: string | null;
};

export async function resolveChapterContinueToken(
  token: string,
): Promise<{ ok: boolean; error?: string; data?: ChapterContinuePayload }> {
  try {
    const res = await fetch(
      `/api/jody/chapter/continue?token=${encodeURIComponent(token)}`,
      { credentials: 'include' },
    );
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || 'invalid_token' };
    }
    return {
      ok: true,
      data: {
        email: data.email,
        chapterId: data.chapterId,
        greetingName: data.greetingName ?? null,
      },
    };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}
