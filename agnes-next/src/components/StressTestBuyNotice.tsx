'use client';

/**
 * Single lightweight simulation line for the catalog + checkout buy path only.
 */
export default function StressTestBuyNotice() {
  if (process.env.NEXT_PUBLIC_STRESS_TEST_MODE !== '1') return null;
  return (
    <p
      style={{
        margin: '0 0 16px 0',
        fontSize: 13,
        lineHeight: 1.5,
        color: 'rgba(167, 243, 208, 0.95)',
        textAlign: 'center',
        maxWidth: 440,
      }}
    >
      Test simulation only — no real charges. Use card number{' '}
      <span style={{ fontFamily: 'ui-monospace, monospace', color: '#e2e8f0' }}>4242 4242 4242 4242</span>
    </p>
  );
}
