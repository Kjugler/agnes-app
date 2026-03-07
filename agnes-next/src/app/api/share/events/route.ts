import { NextRequest, NextResponse } from 'next/server';

/**
 * Log share flow events (tt_share_attempted, tt_share_success, tt_download_clicked, etc.)
 * for instrumentation and debugging. Accepts POST with { event, ...data }.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event, ...data } = body;
    if (event) {
      console.log('[share/events]', event, data);
      // TODO: persist to DB or analytics service
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
