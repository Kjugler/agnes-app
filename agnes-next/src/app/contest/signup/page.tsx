'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ContestEntryForm } from '@/components/ContestEntryForm';

export default function ContestSignupPage() {
  const router = useRouter();
  const qp = useSearchParams();
  const from = qp.get('from') || '/contest';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #1e293b, #020617)',
        color: 'white',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '3rem 1.5rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: 520 }}>
        <ContestEntryForm />
        <button
          type="button"
          onClick={() => router.push(from)}
          style={{
            marginTop: '1rem',
            width: '100%',
            padding: '0.85rem 1.25rem',
            borderRadius: 999,
            fontWeight: 600,
            fontSize: '0.95rem',
            letterSpacing: '0.02em',
            border: '1px solid rgba(148, 163, 184, 0.45)',
            color: '#cbd5f5',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          Go Back
        </button>
      </div>
    </div>
  );
}
