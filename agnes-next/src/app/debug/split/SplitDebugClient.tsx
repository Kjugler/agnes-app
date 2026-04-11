'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function SplitDebugClient() {
  const searchParams = useSearchParams();
  const [cookies, setCookies] = useState<string>('');
  const [origin, setOrigin] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCookies(document.cookie);
      setOrigin(window.location.origin);
    }
  }, []);

  const urlParams: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    urlParams[key] = value;
  });

  return (
    <div
      style={{
        padding: '2rem',
        fontFamily: 'monospace',
        backgroundColor: '#0a0a0a',
        color: '#00ff00',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ color: '#ffff00', marginBottom: '1.5rem' }}>
        🔧 Split Debug Info
      </h1>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: '#00ffff', marginBottom: '0.75rem' }}>Current URL</h2>
        <div style={{ backgroundColor: '#1a1a1a', padding: '1rem', borderRadius: '4px' }}>
          <div>
            <strong>Path:</strong> {typeof window !== 'undefined' ? window.location.pathname : 'N/A'}
          </div>
          <div>
            <strong>Origin:</strong> {origin || 'N/A'}
          </div>
          <div>
            <strong>Full URL:</strong>{' '}
            {typeof window !== 'undefined' ? window.location.href : 'N/A'}
          </div>
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: '#00ffff', marginBottom: '0.75rem' }}>Query Parameters</h2>
        <div style={{ backgroundColor: '#1a1a1a', padding: '1rem', borderRadius: '4px' }}>
          {Object.keys(urlParams).length === 0 ? (
            <div style={{ color: '#888' }}>No query parameters</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
              {Object.entries(urlParams).map(([key, value]) => (
                <li key={key}>
                  <strong>{key}:</strong> {value}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: '#00ffff', marginBottom: '0.75rem' }}>Cookies</h2>
        <div style={{ backgroundColor: '#1a1a1a', padding: '1rem', borderRadius: '4px' }}>
          {cookies ? (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {cookies}
            </pre>
          ) : (
            <div style={{ color: '#888' }}>No cookies</div>
          )}
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: '#00ffff', marginBottom: '0.75rem' }}>Entry Variant Detection</h2>
        <div style={{ backgroundColor: '#1a1a1a', padding: '1rem', borderRadius: '4px' }}>
          <div>
            <strong>From query (?v=):</strong>{' '}
            {urlParams.v || <span style={{ color: '#888' }}>not set</span>}
          </div>
          <div>
            <strong>From cookie (entry_variant):</strong>{' '}
            {cookies.includes('entry_variant=')
              ? cookies
                  .split(';')
                  .find((c) => c.trim().startsWith('entry_variant='))
                  ?.split('=')[1] || 'not found'
              : <span style={{ color: '#888' }}>not set</span>}
          </div>
          <div>
            <strong>From localStorage:</strong>{' '}
            {typeof window !== 'undefined' && localStorage.getItem('entry_variant')
              ? localStorage.getItem('entry_variant')
              : <span style={{ color: '#888' }}>not set</span>}
          </div>
        </div>
      </section>

      <section>
        <h2 style={{ color: '#00ffff', marginBottom: '0.75rem' }}>Test Links</h2>
        <div style={{ backgroundColor: '#1a1a1a', padding: '1rem', borderRadius: '4px' }}>
          <div style={{ marginBottom: '0.5rem' }}>
            <a
              href="/start?v=terminal"
              style={{ color: '#00ff00', textDecoration: 'underline' }}
            >
              /start?v=terminal
            </a>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <a
              href="/start?v=protocol"
              style={{ color: '#00ff00', textDecoration: 'underline' }}
            >
              /start?v=protocol
            </a>
          </div>
          <div>
            <a href="/start" style={{ color: '#00ff00', textDecoration: 'underline' }}>
              /start → lightening (protocol/contest only; not terminal)
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
