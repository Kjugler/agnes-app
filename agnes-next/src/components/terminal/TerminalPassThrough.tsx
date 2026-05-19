'use client';

import { Suspense, useLayoutEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import GlitchIntro from '@/components/terminal/GlitchIntro';
import {
  buildContestTerminalPassUrl,
  completeTerminalPassThrough,
  hasTerminalDiscoveryComplete,
} from '@/lib/terminalPassThrough';

function TerminalPassThroughInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<'checking' | 'glitch' | 'redirect'>('checking');

  useLayoutEffect(() => {
    const params = new URLSearchParams(searchParams.toString());

    if (hasTerminalDiscoveryComplete()) {
      params.delete('embed');
      params.delete('skipLoad');
      router.replace(buildContestTerminalPassUrl(params));
      return;
    }

    const fromLightning = searchParams.get('fromLightning') === '1';
    if (fromLightning) {
      router.replace(completeTerminalPassThrough(params));
      return;
    }

    setPhase('glitch');
  }, [router, searchParams]);

  if (phase === 'checking' || phase === 'redirect') {
    return <div className="fixed inset-0 bg-black" aria-hidden />;
  }

  return (
    <GlitchIntro
      skipIfSeen={false}
      zIndex={200000}
      onComplete={() => {
        const params = new URLSearchParams(searchParams.toString());
        router.replace(completeTerminalPassThrough(params));
      }}
    />
  );
}

export default function TerminalPassThrough() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" aria-hidden />}>
      <TerminalPassThroughInner />
    </Suspense>
  );
}
