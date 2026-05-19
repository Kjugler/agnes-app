'use client';

import TerminalPassThrough from '@/components/terminal/TerminalPassThrough';

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
      <TerminalPassThrough />
    </div>
  );
}
