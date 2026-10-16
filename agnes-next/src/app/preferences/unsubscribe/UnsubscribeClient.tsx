'use client';

import { useState } from 'react';
import { HUB_THEME } from '@/lib/hubTheme';

export default function UnsubscribeClient({ token }: { token: string }) {
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  async function unsubscribe() {
    setMessage('');
    const res = await fetch('/api/promotional-email/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setMessage('This unsubscribe link could not be confirmed.');
      return;
    }
    setDone(true);
    setMessage('Promotional email is off. Purchase receipts are unchanged, and sample chapters stay available.');
  }

  return (
    <section style={{ maxWidth: 640 }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: HUB_THEME.textMuted }}>Email preferences</p>
      <h1 style={{ margin: '0 0 12px', fontSize: '2rem' }}>Unsubscribe</h1>
      {!token ? <p>This unsubscribe link is missing its reader token.</p> : null}
      {token && !done ? (
        <>
          <p>This stops promotional email for the reader named in the link. It does not require a login.</p>
          <button type="button" onClick={unsubscribe}>
            Unsubscribe from promotional email
          </button>
        </>
      ) : null}
      {message ? <p>{message}</p> : null}
    </section>
  );
}
