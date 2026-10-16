'use client';

import { useEffect, useState } from 'react';
import { HUB_THEME } from '@/lib/hubTheme';

type ConsentState = {
  active: boolean;
  consentAt: string | null;
  consentSource: string | null;
  optOutAt: string | null;
};

const EXPLANATION = [
  'Occasional notes about The Agnes Protocol.',
  'An invitation to recommend the book to a friend.',
  'A later invitation to leave an honest review.',
  'Purchase receipts stay separate. Leaving this unchecked does not change sample-chapter access.',
];

export default function PreferencesClient() {
  const [status, setStatus] = useState<'loading' | 'signed_out' | 'ready' | 'saved' | 'error'>('loading');
  const [state, setState] = useState<ConsentState | null>(null);
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/promotional-email/consent');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 401) {
          setStatus('signed_out');
          return;
        }
        if (!res.ok || !data?.ok) {
          setStatus('error');
          setMessage('Email preferences could not be loaded.');
          return;
        }
        setState(data.state);
        setChecked(false);
        setStatus('ready');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('Email preferences could not be loaded.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(action: 'opt_in' | 'opt_out') {
    setMessage('');
    const res = await fetch('/api/promotional-email/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, explicit: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setStatus('error');
      setMessage('That preference was not saved.');
      return;
    }
    setState(data.state);
    setChecked(false);
    setStatus('saved');
    setMessage(
      action === 'opt_in'
        ? 'Promotional email is on. Sample-chapter access is unchanged.'
        : 'Promotional email is off. Sample-chapter access is unchanged.',
    );
  }

  return (
    <section style={{ maxWidth: 640 }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: HUB_THEME.textMuted }}>Email preferences</p>
      <h1 style={{ margin: '0 0 12px', fontSize: '2rem', lineHeight: 1.2 }}>Promotional email</h1>
      <p style={{ fontSize: 16, lineHeight: 1.6, marginTop: 0 }}>
        This choice is separate from the email used to keep reading. It is optional, and it starts unchecked.
      </p>
      <ul style={{ paddingLeft: 20, lineHeight: 1.6 }}>
        {EXPLANATION.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      {status === 'loading' ? <p>Loading your preference…</p> : null}
      {status === 'signed_out' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setMessage('Sign in with your reader email before saving. This page has not turned promotional email on.');
          }}
        >
          <p>
            Sign in with the email you use as a reader, then return here to save this choice. Opening this page
            does not change reading access or turn promotional email on.
          </p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '12px 0' }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
            <span>Yes, send me these promotional emails.</span>
          </label>
          <button type="submit">Save email preference</button>
          {message ? <p>{message}</p> : null}
        </form>
      ) : null}
      {status === 'error' ? <p>{message}</p> : null}

      {state?.active ? (
        <div>
          <p>Promotional email is on{state.consentAt ? ` as of ${state.consentAt}` : ''}.</p>
          <button type="button" onClick={() => save('opt_out')}>
            Unsubscribe from promotional email
          </button>
        </div>
      ) : null}

      {state && !state.active && (status === 'ready' || status === 'saved') ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (checked) save('opt_in');
            else {
              setMessage('Promotional email stays off. Sample-chapter access is unchanged.');
              setStatus('saved');
            }
          }}
        >
          {state.optOutAt ? (
            <p>Promotional email is off. Checking the box and saving is a new request. A visit by itself leaves it off.</p>
          ) : (
            <p>Promotional email is off.</p>
          )}
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '12px 0' }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
            <span>Yes, send me these promotional emails.</span>
          </label>
          <button type="submit">Save email preference</button>
        </form>
      ) : null}
      {message && status === 'saved' ? <p>{message}</p> : null}
    </section>
  );
}
