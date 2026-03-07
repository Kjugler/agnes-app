'use client';

import '@/styles/button-glow.css';

export default function ThankYouButtons() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginTop: '32px',
      }}
    >
      {/* Primary: Back to Contest - Full-width, largest visual weight, h-12 */}
      <a
        href="/contest"
        className="button-glow button-glow--green bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-base rounded-lg text-center transition-colors duration-200 w-full box-border focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-[#111111]"
        style={{
          display: 'block',
          padding: '14px 24px',
          minHeight: '48px', // h-12 equivalent
          textDecoration: 'none',
        }}
      >
        Back to Contest
      </a>

      {/* Secondary: View Scoreboard - Full-width, same height, outline only */}
      <a
        href="/contest/score"
        className="button-glow button-glow--neutral"
        style={{
          display: 'block',
          padding: '14px 24px',
          minHeight: '48px', // Same height as primary
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
        onFocus={(e) => {
          e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.4)';
          e.currentTarget.style.outlineOffset = '2px';
        }}
        onBlur={(e) => {
          e.currentTarget.style.outline = 'none';
        }}
      >
        View Scoreboard
      </a>

      {/* Tertiary: Refer a Friend - Text-only, smaller font, reduced opacity, extra margin */}
      <div style={{ marginTop: '12px' }}> {/* mt-3 equivalent */}
        <a
          href="/contest?action=refer"
          className="button-glow button-glow--neutral"
          style={{
            display: 'block',
            padding: '12px 24px',
            background: 'transparent',
            color: 'rgba(245, 245, 245, 0.6)', // opacity-80 equivalent
            textDecoration: 'none',
            borderRadius: '8px',
            fontWeight: '500',
            fontSize: '14px', // text-sm
            textAlign: 'center',
            width: '100%',
            boxSizing: 'border-box',
            border: 'none', // No border for text-only
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'rgba(245, 245, 245, 1)'; // opacity-100 on hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(245, 245, 245, 0.6)'; // opacity-80 idle
          }}
          onFocus={(e) => {
            e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.3)';
            e.currentTarget.style.outlineOffset = '2px';
            e.currentTarget.style.color = 'rgba(245, 245, 245, 1)'; // Full opacity on focus
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = 'none';
            e.currentTarget.style.color = 'rgba(245, 245, 245, 0.6)';
          }}
        >
          Refer a Friend
        </a>
      </div>
    </div>
  );
}
