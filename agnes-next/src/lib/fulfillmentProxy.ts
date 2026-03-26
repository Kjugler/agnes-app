/**
 * Fulfillment proxy helper - forwards requests to deepquill with x-fulfillment-token from cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { proxyJson } from '@/lib/deepquillProxy';

const FULFILLMENT_TOKEN_COOKIE = 'fulfillment-token';

/**
 * Get x-fulfillment-token header from the fulfillment-token cookie.
 * Returns empty object if cookie is missing (caller should return 401).
 */
export async function getFulfillmentAuthHeaders(): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const token = cookieStore.get(FULFILLMENT_TOKEN_COOKIE)?.value;
  if (!token || !token.trim()) {
    return {};
  }
  return { 'x-fulfillment-token': token };
}

/**
 * Proxy a fulfillment request to deepquill with auth from cookie.
 * Returns 401 if fulfillment token is missing.
 */
export async function fulfillmentProxy(
  path: string,
  req: NextRequest,
  options: { method?: 'GET' | 'POST' | 'PATCH'; headers?: Record<string, string> } = {}
) {
  const authHeaders = await getFulfillmentAuthHeaders();
  if (Object.keys(authHeaders).length === 0) {
    return {
      response: NextResponse.json(
        { error: 'Unauthorized. Sign in at /admin/fulfillment/auth' },
        { status: 401 }
      ),
      data: null,
      status: 401,
    };
  }

  const { data, status } = await proxyJson(path, req, {
    ...options,
    headers: { ...authHeaders, ...options.headers },
  });

  return {
    response: NextResponse.json(data, { status }),
    data,
    status,
  };
}
