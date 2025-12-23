import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { prisma } from '@/lib/db';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';

const trackerDisabled =
  process.env.NODE_ENV !== 'production' &&
  process.env.TRACKER_ENABLED !== 'true';

// --- CORS allowlist (Next 3002, Vite 5181, ngrok dev domain)
const ALLOW_ORIGINS = new Set([
  'http://localhost:3002',
  'http://localhost:5181',
  'https://agnes-dev.ngrok-free.app',
]);
function cors(origin?: string | null) {
  const o = origin && ALLOW_ORIGINS.has(origin) ? origin : 'https://agnes-dev.ngrok-free.app';
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  };
}
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get('origin')) });
}

// Map event types -> Mailchimp tags
const EVENT_TAGS: Record<string, string[]> = {
  CONTEST_ENTERED: ['Contest Entrant'],
  BOOK_VIEWED: ['Book Browser'],
  CHECKOUT_STARTED: [],
  PURCHASE_COMPLETED: ['Buyer'],
  ASSOCIATE_JOINED: ['Associate'],
  DAILY_DIGEST_OPT_IN: ['Digest'],
};

// Events allowed without an email (thank-you page only has session_id)
const EVENTS_WITHOUT_EMAIL = new Set(['CHECKOUT_STARTED', 'PURCHASE_COMPLETED']);

// Mailchimp operations are proxied to deepquill
// Frontend should check backend readiness via: GET http://localhost:5055/api/debug/env
const EMAIL_ENABLED = process.env.NEXT_PUBLIC_EMAIL_ENABLED === 'true';

// ---- helpers --------------------------------------------------------------

async function getOrCreateUserId(email?: string, merge?: Record<string, any>) {
  if (!email) return null;
  const code = nanoid(8).toUpperCase();
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fname: merge?.FNAME ?? undefined,
      lname: merge?.LNAME ?? undefined,
      lastUrl: merge?.LASTURL ?? undefined,
    },
    create: {
      email,
      code,
      fname: merge?.FNAME ?? undefined,
      lname: merge?.LNAME ?? undefined,
      lastUrl: merge?.LASTURL ?? undefined,
    },
    select: { id: true },
  });
  return user.id;
}

async function recordPurchase(email?: string, source?: string | null, meta?: any) {
  const sessionId: string | undefined = meta?.session_id || meta?.sessionId;
  if (!sessionId) return; // nothing to do

  const userId =
    (await getOrCreateUserId(email, {
      FNAME: meta?.fname,
      LNAME: meta?.lname,
      LASTURL: meta?.path,
    })) ??
    (await getOrCreateUserId(`unknown+${nanoid(6)}@example.org`));

  // Prisma path (explicit id to satisfy DB that lacks default on Purchase.id)
  await prisma.purchase.upsert({
    where: { sessionId },
    update: {
      amount: Number.isFinite(meta?.amount_total) ? Number(meta.amount_total) : undefined,
      currency: typeof meta?.currency === 'string' ? meta.currency : undefined,
      source: source ?? undefined,
    },
    create: {
      id: nanoid(24), // <-- ensure id is present
      sessionId,
      userId: userId!,
      amount: Number.isFinite(meta?.amount_total) ? Number(meta.amount_total) : null,
      currency: typeof meta?.currency === 'string' ? meta.currency : null,
      source: source ?? null,
    },
  });

  // Lightweight event record
  await prisma.event.create({
    data: { userId: userId!, type: 'PURCHASE_COMPLETED', meta: meta ?? {} },
  });
}

// ---- main ----------------------------------------------------------------

export async function POST(req: NextRequest) {
  if (trackerDisabled) {
    return NextResponse.json({ ok: true });
  }

  const headers = cors(req.headers.get('origin'));
  const DEV = process.env.NODE_ENV !== 'production';

  try {
    const { type, email, fname, lname, source, ref, meta } = await req.json();
    if (DEV) console.log('[track] payload', { type, email, source, meta });

    if (!type) return NextResponse.json({ error: 'type required' }, { status: 400, headers });
    if (!email && !EVENTS_WITHOUT_EMAIL.has(type)) {
      return NextResponse.json({ error: 'email required' }, { status: 400, headers });
    }

    // 1) Mailchimp operations (proxied to deepquill)
    if (email && EMAIL_ENABLED) {
      try {
        const merge: Record<string, any> = {
          FNAME: fname,
          LNAME: lname,
          SRC: source,
          REF: ref,
          LASTURL: meta?.path,
          JOINED: new Date().toISOString().slice(0, 10),
        };
        if (type === 'CONTEST_ENTERED' || type === 'ASSOCIATE_JOINED') {
          merge.CODE = nanoid(6).toUpperCase();
        }
        
        // Proxy Mailchimp operations to deepquill
        await proxyJson('/api/track', req, {
          method: 'POST',
          body: {
            type,
            email,
            fname,
            lname,
            source,
            ref,
            meta: {
              ...meta,
              merge,
              tags: EVENT_TAGS[type] ?? [],
            },
          },
        }).catch((err) => {
          console.warn('[track] Mailchimp proxy failed (non-blocking):', err?.message);
        });
      } catch (mcErr: any) {
        console.warn('[track] Mailchimp proxy error (non-blocking):', mcErr?.message || mcErr);
      }
    }

    // 2) Local persistence for purchases (so the site remembers)
    if (type === 'PURCHASE_COMPLETED') {
      const src = (meta?.source ?? source ?? 'unknown') as string | null;
      await recordPurchase(email, src, meta);
    }

    return NextResponse.json({ ok: true }, { headers });
  } catch (e: any) {
    console.error('TRACK_ERR', e);
    const body = DEV
      ? { error: e?.message || 'TRACK_FAILED', stack: e?.stack || String(e) }
      : { error: 'TRACK_FAILED' };
    return NextResponse.json(body, { status: 500, headers });
  }
}
