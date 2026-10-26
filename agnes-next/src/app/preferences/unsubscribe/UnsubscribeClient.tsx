'use client';

import { useState, type FormEvent } from 'react';
import { HUB_THEME } from '@/lib/hubTheme';

export default function UnsubscribeClient({ token }: { token: string }) {
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState('');
  const [emailDone, setEmailDone] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');

  async function unsubscribe() {
    setMessage('');
    const res = await fetch('/api/promotional-email/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setMessage('This unsubscribe link could not be confirmed. Use the email form below. It does not need this link.');
      return;
    }
    setDone(true);
    setMessage('Promotional email is off. Purchase receipts are unchanged, and sample chapters stay available.');
  }

  async function unsubscribeByEmail(event: FormEvent) {
    event.preventDefault();
    setEmailMessage('');
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setEmailMessage('Enter the email address that received the note.');
      return;
    }
    const res = await fetch('/api/promotional-email/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmed, confirm: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setEmailMessage('That address could not be unsubscribed. Check the spelling and try again.');
      return;
    }
    setEmailDone(true);
    setEmailMessage('Promotional email is off for that address. Purchase receipts are unchanged, and sample chapters stay available.');
  }

  return (
    <section style={{ maxWidth: 640 }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: HUB_THEME.textMuted }}>Email preferences</p>
      <h1 style={{ margin: '0 0 12px', fontSize: '2rem' }}>Unsubscribe</h1>
      {token && !done ? (
        <>
          <p>This stops promotional email for the reader named in the link. It does not require a login.</p>
          <button type="button" onClick={unsubscribe}>
            Unsubscribe from promotional email
          </button>
        </>
      ) : null}
      {message ? <p>{message}</p> : null}
      <form onSubmit={unsubscribeByEmail} style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: '1.25rem', margin: '0 0 8px' }}>Unsubscribe without the link</h2>
        <p>
          A link in an older note stops working after 180 days. Enter the email address that received the note.
          This turns promotional email off. It does not need a link, a login, or a current token.
        </p>
        {emailDone ? null : (
          <>
            <label htmlFor="promotional-unsubscribe-email">Email address</label>
            <div>
              <input
                id="promotional-unsubscribe-email"
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <button type="submit">Unsubscribe this email address</button>
          </>
        )}
        {emailMessage ? <p>{emailMessage}</p> : null}
      </form>
    </section>
  );
}
