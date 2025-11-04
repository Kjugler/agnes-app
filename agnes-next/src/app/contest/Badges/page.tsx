'use client';

import { useEffect, useState } from 'react';

export default function BadgesPage() {
  const [mist, setMist] = useState(0.5); // calmer, fixed

  useEffect(() => {
    setMist(0.5);
  }, []);

  const Card = ({ title, earned }: { title: string; earned?: boolean }) => (
    <div
      style={{
        borderRadius: 12,
        background: 'rgba(255,255,255,0.9)',
        border: '1px solid rgba(0,0,0,0.08)',
        padding: 16,
        boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        {earned && (
          <span
            aria-hidden
            style={{
              fontSize: 12,
              padding: '2px 6px',
              borderRadius: 999,
              background: '#10b981',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            ✓
          </span>
        )}
      </div>
      <a
        href="/contest"
        style={{
          padding: '8px 12px',
          borderRadius: 10,
          background: '#111',
          color: '#fff',
          textDecoration: 'none',
          fontWeight: 700,
        }}
      >
        Do it
      </a>
    </div>
  );

  return (
    <main style={{ position: 'relative', minHeight: '100vh' }}>
      {/* backdrop (calmer) */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -10 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: "url('/images/score-bg.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backdropFilter: 'blur(4px)',
            background: `linear-gradient(to bottom, rgba(255,255,255,${mist}), rgba(255,255,255,${
              mist * 0.7
            }))`,
            transition: 'opacity .3s ease',
          }}
        />
      </div>

      <section style={{ maxWidth: 960, margin: '24px auto', padding: '0 12px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Badges</h1>
        <p style={{ opacity: 0.75, marginBottom: 18 }}>
          Earn badges by taking actions across the site. This page is a calmer catalog—jump in
          from here.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card title="Purchase the Book" earned />
          <Card title="Share to X" />
          <Card title="Share to Instagram" />
          <Card title="Join the Contest" />
          <Card title="Refer a Friend" />
          <Card title="Weekly Digest Opt-in" />
        </div>
      </section>
    </main>
  );
}