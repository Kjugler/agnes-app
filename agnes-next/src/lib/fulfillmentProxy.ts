/**
 * Fulfillment proxy — forwards to DeepQuill with the same auth pattern as /api/admin/sales-ledger:
 * - Browser must have fulfillment-token cookie (set via /admin/fulfillment/auth)
 * - Server injects x-admin-key from ADMIN_KEY (DeepQuill accepts this for all fulfillment routes)
 * - Also forwards cookie value as x-fulfillment-token when present (FULFILLMENT_ACCESS_TOKEN path)
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { proxyJson } from '@/lib/deepquillProxy';

const FULFILLMENT_TOKEN_COOKIE = 'fulfillment-token';

/**
 * Headers for DeepQuill /api/fulfillment/* (requireFulfillmentAuth).
 * Returns null if the caller should respond 401/500.
 */
export async function getFulfillmentAuthHeaders(): Promise<Record<string, string> | null> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(FULFILLMENT_TOKEN_COOKIE)?.value?.trim();
  if (!cookieToken) {
    return null;
  }

  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey) {
    return null;
  }

  const headers: Record<string, string> = {
    'x-admin-key': adminKey,
    'x-fulfillment-token': cookieToken,
  };
  return headers;
}

/**
 * Proxy a fulfillment request to deepquill.
 * Returns 401 if fulfillment cookie missing; 500 if ADMIN_KEY not configured on agnes-next.
 */
export async function fulfillmentProxy(
  path: string,
  req: NextRequest,
  options: { method?: 'GET' | 'POST' | 'PATCH'; headers?: Record<string, string> } = {}
) {
  const authHeaders = await getFulfillmentAuthHeaders();
  if (!authHeaders) {
    const cookieStore = await cookies();
    const hasCookie = !!cookieStore.get(FULFILLMENT_TOKEN_COOKIE)?.value?.trim();
    if (!hasCookie) {
      return {
        response: NextResponse.json(
          { error: 'Unauthorized. Sign in at /admin/fulfillment/auth' },
          { status: 401 }
        ),
        data: null,
        status: 401,
      };
    }
    return {
      response: NextResponse.json(
        { ok: false, error: 'admin_not_configured' },
        { status: 500 }
      ),
      data: null,
      status: 500,
    };
  }

  const { data, status } = await proxyJson(path, req, {
    ...options,
    headers: { ...authHeaders, ...options.headers },
    omitForwardHeaders: ['x-admin-key', 'x-fulfillment-token'],
  });

  return {
    response: NextResponse.json(data, { status }),
    data,
    status,
  };
}
