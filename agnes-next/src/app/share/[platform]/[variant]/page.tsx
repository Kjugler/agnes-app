import { Suspense } from 'react';
import { cookies, headers } from 'next/headers';
import ShareLandingClient from './ShareLandingClient';
import { detectDevice } from '@/lib/device';
import type { DeviceType } from '@/lib/device';

type Props = {
  params: Promise<{ platform: string; variant: string }>;
  searchParams: Promise<{ device?: string; ref?: string; target?: string }>;
};

export default async function Page({ params, searchParams }: Props) {
  const { platform, variant } = await params;
  const search = await searchParams;
  const cookieStore = await cookies();
  const headersList = await headers();

  // Device: ?device= override > cookie > server detect
  const deviceOverride = search.device;
  let device: DeviceType = 'desktop';
  if (deviceOverride === 'ios' || deviceOverride === 'android' || deviceOverride === 'desktop') {
    device = deviceOverride;
  } else {
    const cookieDevice = cookieStore.get('dq_device')?.value;
    if (cookieDevice === 'ios' || cookieDevice === 'android' || cookieDevice === 'desktop') {
      device = cookieDevice;
    } else {
      device = detectDevice(headersList);
    }
  }

  return (
    <Suspense fallback={null}>
      <ShareLandingClient device={device} />
    </Suspense>
  );
}
