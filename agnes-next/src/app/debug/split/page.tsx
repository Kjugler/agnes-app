import { Suspense } from 'react';
import SplitDebugClient from './SplitDebugClient';

export default function SplitDebugPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: '#00ff00' }}>Loading...</div>}>
      <SplitDebugClient />
    </Suspense>
  );
}
