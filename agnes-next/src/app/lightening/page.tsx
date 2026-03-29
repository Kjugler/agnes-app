import { Suspense } from 'react';
import { cookies } from 'next/headers';
import LighteningClient from './LighteningClient';

export default async function Page() {
  if (process.env.NEXT_PUBLIC_ENTRY_FUNNEL_DEBUG === '1') {
    try {
      const c = await cookies();
      console.log('[ENTRY_FUNNEL:ssr]', {
        path: '/lightening',
        entry_variant: c.get('entry_variant')?.value ?? null,
        seen_terminal: c.get('seen_terminal')?.value ?? null,
        seen_protocol: c.get('seen_protocol')?.value ?? null,
        seen_contest: c.get('seen_contest')?.value ?? null,
        terminal_discovery_complete: c.get('terminal_discovery_complete')?.value ?? null,
      });
    } catch {
      /* ignore */
    }
  }

  return (
    <Suspense fallback={null}>
      <LighteningClient />
    </Suspense>
  );
}
