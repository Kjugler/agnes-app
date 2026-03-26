'use client';

/**
 * SPEC 4 — Beta Contest Rules (Public Stress Test)
 * Display component for Contest Entry, Contest Hub footer, Beta Rules page.
 */
import {
  BETA_RULES_HEADLINE,
  BETA_RULES_BUG_LINE,
  BETA_RULES_PAGE_SECTIONS,
} from '@/lib/betaContestRules';

type Variant = 'compact' | 'full' | 'inline';

type BetaContestRulesProps = {
  variant?: Variant;
  className?: string;
  style?: React.CSSProperties;
};

export default function BetaContestRules({ variant = 'full', className, style }: BetaContestRulesProps) {
  const baseStyle: React.CSSProperties = {
    background: 'rgba(0, 255, 127, 0.08)',
    border: '1px solid rgba(0, 255, 127, 0.25)',
    borderRadius: '8px',
    padding: variant === 'compact' ? '12px 16px' : '20px 24px',
    fontSize: variant === 'compact' ? '13px' : '14px',
    lineHeight: 1.6,
    color: 'rgba(245, 245, 245, 0.95)',
    textAlign: 'left',
  };

  if (variant === 'compact') {
    return (
      <div className={className} style={{ ...baseStyle, ...style }}>
        <div style={{ fontWeight: 600, color: '#00ff7f', marginBottom: '6px' }}>
          {BETA_RULES_HEADLINE}
        </div>
        <p style={{ margin: '0 0 6px 0' }}>
          One purchase point per day. Referral: 5,000 pts each, max 25,000/day (5 referrals).
        </p>
        <p style={{ margin: '0 0 6px 0' }}>
          <a href="/contest/beta-rules" style={{ color: '#00ff7f', textDecoration: 'underline' }}>
            View full rules
          </a>
          {' · '}
          <a href="mailto:hello@theagnesprotocol.com" style={{ color: '#00ff7f', textDecoration: 'underline' }}>
            {BETA_RULES_BUG_LINE}
          </a>
        </p>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={className} style={{ ...baseStyle, ...style }}>
        <div style={{ fontWeight: 700, color: '#00ff7f', marginBottom: '8px', fontSize: '15px' }}>
          PUBLIC STRESS TEST
        </div>
        <pre style={{
          margin: 0,
          whiteSpace: 'pre-wrap',
          fontFamily: 'inherit',
          fontSize: 'inherit',
        }}>
          {BETA_RULES_PAGE_SECTIONS.opening}
        </pre>
        <p style={{ marginTop: '12px', marginBottom: 0 }}>
          <a href="mailto:hello@theagnesprotocol.com" style={{ color: '#00ff7f', textDecoration: 'underline' }}>
            {BETA_RULES_BUG_LINE}
          </a>
        </p>
      </div>
    );
  }

  // full — redirect to dedicated page; this variant kept for backwards compat
  return (
    <div className={className} style={{ ...baseStyle, ...style }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 700, color: '#00ff7f' }}>
        {BETA_RULES_HEADLINE}
      </h3>
      <p style={{ margin: 0 }}>
        <a href="/contest/beta-rules" style={{ color: '#00ff7f', textDecoration: 'underline' }}>
          View full Beta Test Rules
        </a>
      </p>
      <p style={{ marginTop: '12px', marginBottom: 0 }}>
        <a href="mailto:hello@theagnesprotocol.com" style={{ color: '#00ff7f', textDecoration: 'underline' }}>
          {BETA_RULES_BUG_LINE}
        </a>
      </p>
    </div>
  );
}
