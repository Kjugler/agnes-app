import { NextRequest, NextResponse } from 'next/server';
import { normalizeEmail } from '@/lib/email';
import { proxyJson } from '@/lib/deepquillProxy';
import { logContestEntry, principalFromRequest } from '@/lib/contestEntryLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENDPOINT = '/api/associate/upsert';

function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.startsWith('1') && digits.length === 11) {
    return `+${digits}`;
  }
  if (digits.startsWith('0')) {
    return null;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}

function cleanHandle(handle: string | null | undefined) {
  if (!handle) return null;
  const trimmed = handle.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

type Payload = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  handles?: {
    x?: string | null;
    instagram?: string | null;
    tiktok?: string | null;
    truth?: string | null;
  };
  source?: string | null;
};

export async function POST(req: NextRequest) {
  const principal = principalFromRequest(req);

  try {
    const headerEmailRaw = req.headers.get('x-user-email');
    if (!headerEmailRaw) {
      logContestEntry({
        step: 'upsert',
        endpoint: ENDPOINT,
        status: 400,
        ok: false,
        errorKey: 'missing_user_email',
        email: principal.email,
        userId: principal.userId,
      });
      return NextResponse.json({ ok: false, error: 'missing_user_email' }, { status: 400 });
    }

    let body: Partial<Payload>;
    try {
      body = (await req.json()) as Partial<Payload>;
    } catch {
      logContestEntry({
        step: 'upsert',
        endpoint: ENDPOINT,
        status: 400,
        ok: false,
        errorKey: 'invalid_request_body',
        email: principal.email,
        userId: principal.userId,
      });
      return NextResponse.json({ ok: false, error: 'invalid_request_body' }, { status: 400 });
    }

    const firstName = (body.firstName || '').trim();
    const lastName = (body.lastName || '').trim();
    const emailRaw = body.email || headerEmailRaw;
    const email = normalizeEmail(emailRaw);
    const headerEmail = normalizeEmail(headerEmailRaw);

    if (!firstName || !lastName || !email) {
      logContestEntry({
        step: 'upsert',
        endpoint: ENDPOINT,
        status: 400,
        ok: false,
        errorKey: 'missing_fields',
        email: email || principal.email,
        userId: principal.userId,
      });
      return NextResponse.json(
        { ok: false, error: 'missing_fields' },
        { status: 400 },
      );
    }

    if (email !== headerEmail) {
      logContestEntry({
        step: 'upsert',
        endpoint: ENDPOINT,
        status: 400,
        ok: false,
        errorKey: 'email_mismatch',
        email,
        userId: principal.userId,
      });
      return NextResponse.json(
        { ok: false, error: 'email_mismatch' },
        { status: 400 },
      );
    }

    const phone = normalizePhone(body.phone ?? null);
    const handles = body.handles ?? {};
    const handleX = cleanHandle(handles.x);
    const handleInstagram = cleanHandle(handles.instagram);
    const handleTiktok = cleanHandle(handles.tiktok);
    const handleTruth = cleanHandle(handles.truth);

    try {
      const { data, status } = await proxyJson('/api/associate/upsert', req, {
        method: 'POST',
        body: {
          firstName,
          lastName,
          email,
          phone,
          handles: {
            x: handleX,
            instagram: handleInstagram,
            tiktok: handleTiktok,
            truth: handleTruth,
          },
        },
        headers: {
          'x-user-email': email,
        },
      });

      if (status === 200 && data?.ok) {
        logContestEntry({
          step: 'upsert',
          endpoint: ENDPOINT,
          status: 200,
          ok: true,
          email: data.email ?? email,
          userId: data.id ?? principal.userId,
          deepquillStatus: status,
        });

        const res = NextResponse.json({
          ok: true,
          id: data.id,
          email: data.email,
          name: data.name,
          code: data.code,
        });

        res.cookies.set('mockEmail', email, { httpOnly: false, path: '/', maxAge: 60 * 60 * 24 * 365 });
        res.cookies.set('ref', data.code, { httpOnly: false, path: '/', maxAge: 60 * 60 * 24 * 365 });

        return res;
      }

      const errorKey = data?.error || 'associate_service_unavailable';
      logContestEntry({
        step: 'upsert',
        endpoint: ENDPOINT,
        status: 503,
        ok: false,
        errorKey,
        email,
        userId: principal.userId,
        deepquillStatus: status,
      });
      return NextResponse.json(
        { ok: false, error: errorKey },
        { status: 503 },
      );
    } catch (proxyErr) {
      const message = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
      logContestEntry({
        step: 'upsert',
        endpoint: ENDPOINT,
        status: 503,
        ok: false,
        errorKey: 'associate_service_unavailable',
        email,
        userId: principal.userId,
        proxyFailed: true,
        message,
      });
      return NextResponse.json(
        { ok: false, error: 'associate_service_unavailable' },
        { status: 503 },
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logContestEntry({
      step: 'upsert',
      endpoint: ENDPOINT,
      status: 500,
      ok: false,
      errorKey: 'server_error',
      email: principal.email,
      userId: principal.userId,
      message,
    });

    return NextResponse.json(
      {
        ok: false,
        error: 'server_error',
        message:
          process.env.NODE_ENV === 'development' ? message : 'An unexpected error occurred. Please try again.',
      },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-User-Email',
        },
      },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-User-Email',
    },
  });
}
