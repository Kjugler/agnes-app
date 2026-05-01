import { NextRequest, NextResponse } from 'next/server';

/**
 * Same pattern as /api/admin/sales-ledger: staff fulfillment cookie OR matching ADMIN_KEY.
 * Server injects ADMIN_KEY to DeepQuill so the browser never needs sessionStorage in production.
 */
export function authorizeAdminSignalsProxy(req: NextRequest):
  | { ok: true; adminKey: string }
  | { ok: false; response: NextResponse } {
  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'admin_not_configured' }, { status: 500 }),
    };
  }

  const fulfillmentToken = req.cookies.get('fulfillment-token')?.value?.trim();
  const headerKey = req.headers.get('x-admin-key')?.trim();

  if (fulfillmentToken) {
    return { ok: true, adminKey };
  }
  if (headerKey && headerKey === adminKey) {
    return { ok: true, adminKey };
  }

  return {
    ok: false,
    response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
  };
}
