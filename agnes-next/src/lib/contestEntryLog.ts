import type { NextRequest } from 'next/server';

/** One-line JSON logs for contest entry debugging (upsert / join / explicit-enter). */
export function logContestEntry(event: {
  step: 'upsert' | 'join' | 'explicit-enter';
  endpoint: string;
  status: number;
  ok?: boolean;
  errorKey?: string | null;
  email?: string | null;
  userId?: string | null;
  proxyFailed?: boolean;
  deepquillStatus?: number;
  message?: string;
}) {
  let deepquillHost: string | null = null;
  try {
    const base = process.env.DEEPQUILL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || '';
    if (base) deepquillHost = new URL(base).host;
  } catch {
    deepquillHost = 'invalid_url';
  }

  console.log(
    '[contest-entry]',
    JSON.stringify({
      ...event,
      deepquillHost,
      ts: new Date().toISOString(),
    }),
  );
}

export function principalFromRequest(req: NextRequest): {
  email: string | null;
  userId: string | null;
} {
  const cookieHeader = req.headers.get('cookie') || '';
  const userIdMatch = cookieHeader.match(/(?:^|;\s*)contest_user_id=([^;]+)/);
  const emailMatch = cookieHeader.match(
    /(?:^|;\s*)(?:contest_email|user_email|associate_email)=([^;]+)/,
  );
  const headerEmail = req.headers.get('x-user-email');

  const userId = userIdMatch?.[1] ? decodeURIComponent(userIdMatch[1].trim()) : null;
  const cookieEmail = emailMatch?.[1] ? decodeURIComponent(emailMatch[1].trim()) : null;
  const email = (headerEmail || cookieEmail || '').trim().toLowerCase() || null;

  return { email, userId };
}
