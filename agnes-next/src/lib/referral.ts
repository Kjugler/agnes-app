import { cookies } from 'next/headers';

export async function getReferralCodeFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const ref = cookieStore.get('ref');
  return ref?.value || null;
}

export async function getMockEmailFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const mockEmail = cookieStore.get('mockEmail');
  return mockEmail?.value || null;
}