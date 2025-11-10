import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { upsertContact, addTags, sendEvent } from '@/lib/mailchimp';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

const trackerDisabled =
  process.env.NODE_ENV !== 'production' &&
  process.env.TRACKER_ENABLED !== 'true';

// --- CORS allowlist (Next 3002, Vite 5181)
const ALLOW_ORIGINS = new Set(['http://localhost:3002', 'http://localhost:5181']);
function cors(origin?: string | null) {
  const o = origin && ALLOW_ORIGINS.has(origin) ? origin : 'http://localhost:3002';
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

// Only talk to Mailchimp when env is present (fail-open otherwise)
const MC_READY = Boolean(
  process.env.MAILCHIMP_API_KEY &&
  process.env.MAILCHIMP_SERVER_PREFIX &&
  (process.env.MAILCHIMP_AUDIENCE_ID || process.env.MAILCHIMP_LIST_ID)
);

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

    // 1) Mailchimp (skip if not configured or no email)
    if (email && MC_READY) {
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
        await upsertContact(email, merge);
        const tags = EVENT_TAGS[type] ?? [];
        if (tags.length) await addTags(email, tags);
        await sendEvent(email, type, meta ?? {});
      } catch (mcErr: any) {
        console.warn('MC_SKIP_ERR', mcErr?.message || mcErr);
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
