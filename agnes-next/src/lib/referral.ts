import { cookies } from 'next/headers';

export function getReferralCodeFromCookie(): string | null {
  const cookieStore = cookies();
  const ref = cookieStore.get('ref');
  return ref?.value || null;
}

export function getMockEmailFromCookie(): string | null {
  const cookieStore = cookies();
  const mockEmail = cookieStore.get('mockEmail');
  return mockEmail?.value || null;
}