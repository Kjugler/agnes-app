'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { HUB_THEME } from '@/lib/hubTheme';
import {
  DEPARTURE_MEMORY_KEY,
  DEPARTURE_SESSION_KEY,
  JODY_ACCESS_SETTLED_KEY,
  MOBILE_INVITE_SEEN_KEY,
  SAMPLE_READING_ENGAGED_KEY,
  isTopEdgeExit,
  readStoredDepartureMemory,
  shouldOfferDeparture,
} from '@/lib/departureBridge';

type Audience = {
  known: boolean;
  emailHint: string | null;
  decided: boolean;
};

export default function DepartureBridge({ jodyActive = false }: { jodyActive?: boolean }) {
  const pathname = usePathname() || '';
  const [audience, setAudience] = useState<Audience>({ known: false, emailHint: null, decided: false });
  const [audienceChecked, setAudienceChecked] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [engaged, setEngaged] = useState({ scrolled: false, interacted: false, elapsedMs: 0 });
  const [exitIntent, setExitIntent] = useState(false);
  const [memory, setMemory] = useState(readStoredDepartureMemory(null, null));
  const [subsequentToJody, setSubsequentToJody] = useState(true);
  const [readingEngaged, setReadingEngaged] = useState(false);
  const [mobileInviteSeen, setMobileInviteSeen] = useState(false);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMemory(
      readStoredDepartureMemory(
        window.localStorage.getItem(DEPARTURE_MEMORY_KEY),
        window.sessionStorage.getItem(DEPARTURE_SESSION_KEY),
      ),
    );
    if (window.sessionStorage.getItem(JODY_ACCESS_SETTLED_KEY) === '1') setSubsequentToJody(false);
    setReadingEngaged(window.sessionStorage.getItem(SAMPLE_READING_ENGAGED_KEY) === '1');
    setMobileInviteSeen(window.sessionStorage.getItem(MOBILE_INVITE_SEEN_KEY) === '1');
    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const apply = () => setDesktop(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/promotional-email/departure', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data?.ok) {
          setAudience({ known: false, emailHint: null, decided: true });
          setAudienceChecked(true);
          return;
        }
        setAudience({
          known: data.audience === 'known',
          emailHint: typeof data.emailHint === 'string' ? data.emailHint : null,
          decided: data.decided === true,
        });
        setAudienceChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setAudience({ known: false, emailHint: null, decided: true });
        setAudienceChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const started = Date.now();
    const noteSubsequent = () => {
      setSubsequentToJody(true);
      window.sessionStorage.removeItem(JODY_ACCESS_SETTLED_KEY);
    };
    const tick = window.setInterval(() => {
      const elapsedMs = Date.now() - started;
      if (elapsedMs >= 15_000) noteSubsequent();
      setEngaged((current) => ({ ...current, elapsedMs }));
    }, 1000);
    const onScroll = () => {
      if (window.scrollY > 80) {
        noteSubsequent();
        setEngaged((current) => ({ ...current, scrolled: true }));
      }
    };
    const onClick = () => {
      noteSubsequent();
      setEngaged((current) => ({ ...current, interacted: true }));
    };
    const onMouseOut = (event: MouseEvent) => {
      if (isTopEdgeExit({ clientY: event.clientY, relatedTarget: event.relatedTarget })) {
        setExitIntent(true);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick);
    document.addEventListener('mouseout', onMouseOut);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick);
      document.removeEventListener('mouseout', onMouseOut);
    };
  }, []);

  const decision = shouldOfferDeparture({
    pathname,
    desktop,
    elapsedMs: engaged.elapsedMs,
    scrolled: engaged.scrolled,
    interacted: engaged.interacted,
    exitIntent,
    memory,
    decided: audience.decided,
    jodyActive,
    audienceChecked,
    subsequentToJody,
    readingEngaged,
    mobileInviteSeen,
  });

  useEffect(() => {
    if (decision.offer) setOpen(true);
  }, [decision.offer]);

  useEffect(() => {
    if (!decision.offer || decision.presentation !== 'inline') return;
    const markSeen = window.setTimeout(() => {
      window.sessionStorage.setItem(MOBILE_INVITE_SEEN_KEY, '1');
    }, 0);
    return () => window.clearTimeout(markSeen);
  }, [decision.offer, decision.presentation]);

  function remember(value: 'dismissed' | 'accepted') {
    if (value === 'accepted') {
      window.localStorage.setItem(DEPARTURE_MEMORY_KEY, value);
    }
    window.sessionStorage.setItem(DEPARTURE_SESSION_KEY, value);
    setMemory(value);
    setOpen(false);
    setExitIntent(false);
  }

  async function accept() {
    setMessage('');
    if (!checked) {
      setMessage('Check the box to accept. Reading access stays the same.');
      return;
    }
    const body: { explicit: true; accept: true; email?: string } = { explicit: true, accept: true };
    if (!audience.known) body.email = email.trim();
    const res = await fetch('/api/promotional-email/departure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setMessage('That preference was not saved. Reading access is unchanged.');
      return;
    }
    window.localStorage.setItem(DEPARTURE_MEMORY_KEY, 'accepted');
    window.sessionStorage.setItem(DEPARTURE_SESSION_KEY, 'accepted');
    setSaved(true);
    setMessage('You are signed up for occasional notes. Reading access is unchanged.');
  }

  if (!open || jodyActive || memory || audience.decided) return null;
  const inline = decision.presentation === 'inline';

  return (
    <aside
      aria-label="Before you go"
      style={{
        position: inline ? 'relative' : 'fixed',
        top: inline ? undefined : 16,
        left: inline ? undefined : '50%',
        transform: inline ? undefined : 'translateX(-50%)',
        width: inline ? 'min(440px, 100%)' : 'min(440px, calc(100% - 32px))',
        margin: inline ? '28px auto 0' : undefined,
        background: HUB_THEME.surface,
        color: HUB_THEME.text,
        border: `1px solid ${HUB_THEME.border}`,
        borderRadius: 12,
        padding: '18px 18px 16px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        zIndex: 40,
        fontFamily: HUB_THEME.fontFamily,
      }}
    >
      <p style={{ margin: '0 0 4px', fontSize: 13, letterSpacing: '0.04em' }}>Before You Go...</p>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, lineHeight: 1.25 }}>The story doesn&apos;t have to end here.</h2>
      <p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
        Occasional author updates, special offers, and opportunities to share The Agnes Protocol with friends.
      </p>
      {audience.known ? (
        <p style={{ margin: '0 0 12px' }}>
          We&apos;ll use the email you already use here{audience.emailHint ? ` (${audience.emailHint})` : ''}.
        </p>
      ) : (
        <label style={{ display: 'block', marginBottom: 12 }}>
          Email address
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 6,
              padding: '10px 12px',
              border: `1px solid ${HUB_THEME.border}`,
              borderRadius: 8,
              font: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </label>
      )}
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
        <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
        <span>Yes, send me these occasional notes.</span>
      </label>
      {saved ? null : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={accept} style={primaryButtonStyle}>
            Send me notes
          </button>
          <button type="button" onClick={() => remember('dismissed')} style={quietButtonStyle}>
            Continue
          </button>
        </div>
      )}
      {message ? <p style={{ margin: '12px 0 0' }}>{message}</p> : null}
      {saved ? (
        <button type="button" onClick={() => remember('accepted')} style={quietButtonStyle}>
          Continue
        </button>
      ) : (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: HUB_THEME.textMuted }}>
          Leaving this unchecked does not change reading access.
        </p>
      )}
    </aside>
  );
}

const primaryButtonStyle = {
  background: HUB_THEME.primaryGreen,
  color: '#111111',
  border: 'none',
  borderRadius: 8,
  padding: '10px 14px',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
} as const;

const quietButtonStyle = {
  background: 'transparent',
  color: HUB_THEME.text,
  border: `1px solid ${HUB_THEME.border}`,
  borderRadius: 8,
  padding: '10px 14px',
  font: 'inherit',
  cursor: 'pointer',
} as const;
