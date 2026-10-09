'use client';

import Link from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  advertisingChoiceNeedsEuPrompt,
  PRIVACY_CHOICES_EVENT,
  type AdvertisingConsentSnapshot,
} from '@/lib/privacy/advertisingConsent';
import {
  ensureRegionCookie,
  getAdvertisingConsentSnapshot,
  honorGpcIfPresent,
  hydrateAdvertisingConsent,
  persistAdvertisingChoice,
  subscribeAdvertisingConsent,
} from '@/lib/privacy/advertisingConsentClient';

const ConsentContext = createContext<AdvertisingConsentSnapshot | null>(null);

export function useAdvertisingConsent(): AdvertisingConsentSnapshot {
  const fromContext = useContext(ConsentContext);
  return fromContext ?? getAdvertisingConsentSnapshot();
}

const panelStyle: CSSProperties = {
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
  background: '#111111',
  color: '#f5f5f5',
  border: '1px solid rgba(245,245,245,0.18)',
  borderRadius: 12,
  padding: '16px 18px',
  maxWidth: 520,
  width: '100%',
  boxSizing: 'border-box',
};

const buttonRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  marginTop: 14,
};

const buttonBase: CSSProperties = {
  flex: '1 1 180px',
  minHeight: 44,
  padding: '10px 14px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const allowButtonStyle: CSSProperties = {
  ...buttonBase,
  background: '#00ff7f',
  color: '#0a0a0a',
  border: 'none',
};

const denyButtonStyle: CSSProperties = {
  ...buttonBase,
  background: 'transparent',
  color: '#f5f5f5',
  border: '1px solid rgba(245,245,245,0.45)',
};

function ChoiceCopy({ snapshot }: { snapshot: AdvertisingConsentSnapshot }) {
  if (snapshot.gpc) {
    return (
      <p style={{ margin: '0 0 8px', lineHeight: 1.5, fontSize: 14 }}>
        Advertising measurement is off because your browser sent Global Privacy
        Control. You can browse, read samples, and purchase as usual.
      </p>
    );
  }

  return (
    <p style={{ margin: '0 0 8px', lineHeight: 1.5, fontSize: 14 }}>
      Advertising measurement helps DeepQuill understand whether advertising
      leads to visits and purchases. Opting out does not affect your ability to
      browse, read samples, or purchase The Agnes Protocol.
    </p>
  );
}

function ChoiceActions({
  snapshot,
  onAllow,
  onDeny,
}: {
  snapshot: AdvertisingConsentSnapshot;
  onAllow: () => void;
  onDeny: () => void;
}) {
  const allowDisabled = snapshot.gpc;
  return (
    <div style={buttonRowStyle}>
      <button
        type="button"
        onClick={onAllow}
        disabled={allowDisabled}
        style={{
          ...allowButtonStyle,
          opacity: allowDisabled ? 0.45 : 1,
          cursor: allowDisabled ? 'not-allowed' : 'pointer',
        }}
      >
        Allow advertising measurement
      </button>
      <button type="button" onClick={onDeny} style={denyButtonStyle}>
        Opt out of advertising measurement
      </button>
    </div>
  );
}

export default function PrivacyConsentRoot({
  initialSnapshot,
  children,
}: {
  initialSnapshot: AdvertisingConsentSnapshot;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [choicesOpen, setChoicesOpen] = useState(false);

  useEffect(() => {
    hydrateAdvertisingConsent(initialSnapshot);
    ensureRegionCookie(initialSnapshot.region);
    setSnapshot(honorGpcIfPresent());
    return subscribeAdvertisingConsent(setSnapshot);
  }, [initialSnapshot]);

  useEffect(() => {
    const open = () => setChoicesOpen(true);
    window.addEventListener(PRIVACY_CHOICES_EVENT, open);
    return () => window.removeEventListener(PRIVACY_CHOICES_EVENT, open);
  }, []);

  const onAllow = useCallback(() => {
    if (getAdvertisingConsentSnapshot().gpc) return;
    setSnapshot(persistAdvertisingChoice('allow'));
    setChoicesOpen(false);
  }, []);

  const onDeny = useCallback(() => {
    setSnapshot(persistAdvertisingChoice('deny'));
    setChoicesOpen(false);
  }, []);

  const showEuPrompt = advertisingChoiceNeedsEuPrompt(snapshot);
  const value = useMemo(() => snapshot, [snapshot]);

  useEffect(() => {
    if (!showEuPrompt) return;
    const previous = document.body.style.paddingBottom;
    document.body.style.paddingBottom = '240px';
    return () => {
      document.body.style.paddingBottom = previous;
    };
  }, [showEuPrompt]);

  return (
    <ConsentContext.Provider value={value}>
      {children}

      {showEuPrompt ? (
        <div
          role="dialog"
          aria-label="Advertising measurement choice"
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 40,
            padding: '12px 12px calc(12px + env(safe-area-inset-bottom))',
            pointerEvents: 'none',
          }}
        >
          <div style={{ ...panelStyle, margin: '0 auto', pointerEvents: 'auto' }}>
            <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700 }}>
              Advertising measurement
            </p>
            <ChoiceCopy snapshot={snapshot} />
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
              You can reject this and still use the site.{' '}
              <Link href="/privacy" style={{ color: '#00ffe5' }}>
                Privacy Policy
              </Link>
            </p>
            <ChoiceActions snapshot={snapshot} onAllow={onAllow} onDeny={onDeny} />
          </div>
        </div>
      ) : null}

      {choicesOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Privacy Choices"
          onClick={() => setChoicesOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={panelStyle}
          >
            <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>
              Privacy Choices
            </p>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'rgba(245,245,245,0.7)' }}>
              Advertising measurement is currently{' '}
              {snapshot.allowed ? 'on' : 'off'}
              {snapshot.gpc ? ' (browser Global Privacy Control)' : ''}.
            </p>
            <ChoiceCopy snapshot={snapshot} />
            <p style={{ margin: 0, fontSize: 13 }}>
              <Link href="/privacy" style={{ color: '#00ffe5' }}>
                Privacy Policy
              </Link>
            </p>
            <ChoiceActions snapshot={snapshot} onAllow={onAllow} onDeny={onDeny} />
            <button
              type="button"
              onClick={() => setChoicesOpen(false)}
              style={{
                marginTop: 12,
                background: 'none',
                border: 'none',
                color: 'rgba(245,245,245,0.75)',
                textDecoration: 'underline',
                cursor: 'pointer',
                font: 'inherit',
                padding: 0,
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </ConsentContext.Provider>
  );
}
