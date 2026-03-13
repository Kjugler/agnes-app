import React from 'react';
import SignalAdminClient from './SignalAdminClient';

export default function SignalAdminPage() {
  return (
    <div
      style={{
        backgroundColor: '#0a0e27',
        color: '#e0e0e0',
        fontFamily: '"Courier New", monospace',
        minHeight: '100vh',
        padding: '2rem',
      }}
    >
      <SignalAdminClient />
    </div>
  );
}
