import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * POST /api/mc/purchased
 * Upserts user to Mailchimp and tags them as "Purchased – Book"
 */
export async function POST(req: NextRequest) {
  try {
    const { email, code, source } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'missing email' }, { status: 400 });
    }

    const apiKey = process.env.MAILCHIMP_API_KEY;
    const dc = process.env.MAILCHIMP_SERVER_PREFIX;
    const listId = process.env.MAILCHIMP_AUDIENCE_ID || process.env.MAILCHIMP_LIST_ID;
    const tagName = process.env.MAILCHIMP_TAG_PURCHASED_BOOK || 'Purchased – Book';

    if (!apiKey || !dc || !listId) {
      console.warn('[mc/purchased] Missing Mailchimp env vars');
      return NextResponse.json(
        { error: 'Mailchimp configuration missing' },
        { status: 500 }
      );
    }

    // Create MD5 hash of email (Mailchimp requirement)
    const hash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex');

    // Upsert member
    const upsertRes = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members/${hash}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `apikey ${apiKey}`,
        },
        body: JSON.stringify({
          email_address: email.toLowerCase(),
          status_if_new: 'subscribed',
          merge_fields: {
            CODE: code || '',
          },
        }),
      }
    );

    if (!upsertRes.ok) {
      const errorData = await upsertRes.json().catch(() => ({}));
      console.error('[mc/purchased] Upsert failed:', errorData);
    }

    // Tag member
    const tagRes = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members/${hash}/tags`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `apikey ${apiKey}`,
        },
        body: JSON.stringify({
          tags: [{ name: tagName, status: 'active' }],
        }),
      }
    );

    if (!tagRes.ok) {
      const errorData = await tagRes.json().catch(() => ({}));
      console.error('[mc/purchased] Tag failed:', errorData);
    }

    // Return success if at least upsert worked
    const success = upsertRes.ok;
    return NextResponse.json(
      { ok: success, upserted: upsertRes.ok, tagged: tagRes.ok },
      { status: success ? 200 : 500 }
    );
  } catch (err: any) {
    console.error('[mc/purchased] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

