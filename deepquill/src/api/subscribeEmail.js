// deepquill/src/api/subscribeEmail.js
export async function subscribeEmail(email, { apiBase } = {}) {
  const base = apiBase || 'http://localhost:5055'; // temporary DEV server
// 👇 instrumentation: shows which base is actually used in the browser
if (typeof window !== 'undefined') {
  window.__API_BASE__ = base;
  console.log('%c[deepquill] subscribeEmail base =>', 'color:#0f0', base);
}    

  try {
    const response = await fetch(`${base}/api/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const msg = typeof payload === 'string' ? payload : payload?.error || 'Unknown error';
      throw new Error(`Fetch error: ${response.status} – ${msg}`);
    }

    // Expecting { ok: true, status: 'new'|'existing'|'soft-fail', ... }
    return payload;
  } catch (error) {
    console.error('❌ Fetch error:', error);
    return { ok: false, error: error.message || 'Unknown error' };
  }
}
 