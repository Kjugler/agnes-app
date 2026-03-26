'use client';

import TerminalClient from '@/components/terminal/TerminalClient';

export default function TerminalPage() {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        background: '#000',
      }}
    >
      <TerminalClient />
    </div>
  );
}
