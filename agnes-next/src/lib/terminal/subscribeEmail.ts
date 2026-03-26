/**
 * Subscribe email via agnes-next /api/subscribe (proxies to deepquill).
 */

export async function subscribeEmail(
  email: string,
  options?: { apiBase?: string }
): Promise<{ ok?: boolean; message?: string; error?: string }> {
  const base = options?.apiBase ?? ''; // Empty = same-origin relative path
  const url = base ? `${base}/api/subscribe` : '/api/subscribe';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const msg =
        typeof payload === 'string'
          ? payload
          : (payload as { error?: string })?.error || 'Unknown error';
      throw new Error(`Fetch error: ${response.status} – ${msg}`);
    }

    return payload as { ok?: boolean; message?: string };
  } catch (error) {
    console.error('❌ subscribeEmail error:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
