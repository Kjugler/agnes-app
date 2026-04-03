import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { proxyJson } from '@/lib/deepquillProxy';
import { rateLimitByIP } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const trackerDisabled =
  process.env.NODE_ENV !== 'production' &&
  process.env.TRACKER_ENABLED !== 'true';

// --- CORS allowlist (Next 3002, Vite 5181, ngrok dev domain)
const ALLOW_ORIGINS = new Set([
  'http://localhost:3002',
  'http://localhost:5181',
  process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002',
].filter(Boolean));
function cors(origin?: string | null) {
  const defaultOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002';
  const o = origin && ALLOW_ORIGINS.has(origin) ? origin : defaultOrigin;
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
  TEXT_FRIEND_SHARED: [],
};

// Events allowed without an email (thank-you page only has session_id)
const EVENTS_WITHOUT_EMAIL = new Set(['CHECKOUT_STARTED', 'PURCHASE_COMPLETED']);

// Mailchimp operations are proxied to deepquill
// Canonical User/Purchase/Event: deepquill Stripe webhook is source of truth (no local writes)
const EMAIL_ENABLED = process.env.NEXT_PUBLIC_EMAIL_ENABLED === 'true';

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

    // Canonical Purchase/User: deepquill Stripe webhook is source of truth
    // No local User/Purchase/Event writes - agnes-next reads via /api/points/me, /api/contest/score

    return NextResponse.json({ ok: true }, { headers });
  } catch (e: any) {
    console.error('TRACK_ERR', e);
    const body = DEV
      ? { error: e?.message || 'TRACK_FAILED', stack: e?.stack || String(e) }
      : { error: 'TRACK_FAILED' };
    return NextResponse.json(body, { status: 500, headers });
  }
}
