'use client';

import '@/styles/button-glow.css';

export default function OrderConfirmationButtons() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginTop: '32px',
      }}
    >
      <a
        href="/sample-chapters"
        className="button-glow button-glow--green bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-base rounded-lg text-center transition-colors duration-200 w-full box-border focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-[#111111]"
        style={{
          display: 'block',
          padding: '14px 24px',
          minHeight: '48px',
          textDecoration: 'none',
        }}
      >
        Read Sample Chapters
      </a>

      <a
        href="/catalog"
        className="button-glow button-glow--neutral"
        style={{
          display: 'block',
          padding: '14px 24px',
          minHeight: '48px',
          background: 'transparent',
          color: '#f5f5f5',
          textDecoration: 'none',
          borderRadius: '8px',
          fontWeight: '600',
          fontSize: '16px',
          textAlign: 'center',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          width: '100%',
          boxSizing: 'border-box',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }}
      >
        Back to Catalog
      </a>
    </div>
  );
}
