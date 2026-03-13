'use client';

import Link from 'next/link';
import { BETA_RULES_PAGE_SECTIONS } from '@/lib/betaContestRules';

/**
 * SPEC 4 — Beta Rules page
 * Clear plain English for public stress test.
 */
export default function BetaRulesPage() {
  return (
    <main style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#f5f5f5',
      padding: '48px 24px',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <Link
          href="/contest"
          style={{
            display: 'inline-block',
            marginBottom: '24px',
            color: '#00ff7f',
            textDecoration: 'underline',
            fontSize: '14px',
          }}
        >
          ← Back to Contest Hub
        </Link>

        <div style={{
          background: 'rgba(0, 255, 127, 0.08)',
          border: '1px solid rgba(0, 255, 127, 0.25)',
          borderRadius: '8px',
          padding: '24px 28px',
          fontSize: '15px',
          lineHeight: 1.7,
        }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'inherit' }}>
            {BETA_RULES_PAGE_SECTIONS.opening}
          </pre>

          <h3 style={{ margin: '28px 0 12px 0', fontSize: '16px', fontWeight: 700, color: '#00ff7f' }}>
            Purchase points rule
          </h3>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'inherit' }}>
            {BETA_RULES_PAGE_SECTIONS.personalPurchase}
          </pre>

          <h3 style={{ margin: '28px 0 12px 0', fontSize: '16px', fontWeight: 700, color: '#00ff7f' }}>
            Referral points rule
          </h3>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'inherit' }}>
            {BETA_RULES_PAGE_SECTIONS.referral}
          </pre>

          <h3 style={{ margin: '28px 0 12px 0', fontSize: '16px', fontWeight: 700, color: '#00ff7f' }}>
            Simulation disclaimer
          </h3>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'inherit' }}>
            {BETA_RULES_PAGE_SECTIONS.simulation}
          </pre>

          <h3 style={{ margin: '28px 0 12px 0', fontSize: '16px', fontWeight: 700, color: '#00ff7f' }}>
            Bug reporting
          </h3>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'inherit' }}>
            {BETA_RULES_PAGE_SECTIONS.bugReport}
          </pre>

          {/* Easter egg — viral hook */}
          <p style={{
            marginTop: '32px',
            marginBottom: 0,
            fontSize: '14px',
            color: 'rgba(245, 245, 245, 0.6)',
            fontStyle: 'italic',
          }}>
            {BETA_RULES_PAGE_SECTIONS.easterEgg}
          </p>
        </div>
      </div>
    </main>
  );
}
