/**
 * Proxy helper for forwarding requests to deepquill backend
 * 
 * This allows agnes-next to delegate Stripe/Mailchimp operations to deepquill
 * without maintaining SDK clients or secrets in agnes-next.
 */

const API_BASE_URL = process.env.DEEPQUILL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5055';

export interface ProxyOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
}

/**
 * Proxy a JSON request to deepquill
 * 
 * @param path - API path (e.g., '/api/create-checkout-session')
 * @param req - Next.js request object (for reading body/headers)
 * @param options - Optional overrides for method, headers, body
 * @returns Response JSON and status code
 */
export async function proxyJson(
  path: string,
  req: Request,
  options: ProxyOptions = {}
): Promise<{ data: any; status: number }> {
  const method = options.method || (req.method as 'GET' | 'POST' | 'PUT' | 'DELETE');
  
  // Build URL: if path already includes query string, use it; otherwise append from req.url
  let url = `${API_BASE_URL}${path}`;
  
  // Only append query params from req.url if path doesn't already have them
  if (!path.includes('?')) {
    try {
      const reqUrl = new URL(req.url);
      if (reqUrl.search) {
        // Append query params to the path
        url = `${API_BASE_URL}${path}${reqUrl.search}`;
      }
    } catch (urlErr) {
      // If URL parsing fails, use path as-is
      console.warn('[deepquill-proxy] Failed to parse request URL for query params', { error: urlErr });
    }
  }

  // Read body from request if not provided in options
  let body: string | undefined;
  if (options.body !== undefined) {
    body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  } else if (method !== 'GET' && req.body) {
    // Try to read body from request
    try {
      const cloned = req.clone();
      body = await cloned.text();
    } catch {
      // If body already consumed, try JSON
      try {
        const cloned = req.clone();
        body = JSON.stringify(await cloned.json());
      } catch {
        body = undefined;
      }
    }
  }

  // Merge headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Forward relevant headers from original request
  const forwardHeaders = ['x-user-email', 'x-admin-key', 'x-vercel-ip-country', 'x-vercel-ip-country-region', 'authorization', 'cookie'];
  forwardHeaders.forEach((key) => {
    const value = req.headers.get(key);
    if (value) {
      headers[key] = value;
    }
  });

  // Add internal proxy secret if provided in options (for agnes-next → deepquill calls)
  if (options.headers?.['x-internal-proxy']) {
    headers['x-internal-proxy'] = options.headers['x-internal-proxy'];
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    const data = await response.json().catch(() => ({}));
    return { data, status: response.status };
  } catch (error: any) {
    console.error(`[deepquill-proxy] Failed to proxy ${method} ${path}:`, error.message);
    throw new Error(`Proxy request failed: ${error.message}`);
  }
}

/**
 * Proxy a raw buffer request (for webhooks that need exact byte preservation)
 * 
 * CRITICAL: Stripe webhook signature verification requires the EXACT raw bytes
 * that Stripe sent. Any parsing, re-stringification, or transformation will break verification.
 * 
 * BULLETPROOF: This function forwards Buffer bytes directly without any conversion.
 * - Do NOT read as text
 * - Do NOT rebuild JSON
 * - Do NOT set Content-Length manually (fetch handles this)
 * - Forward Buffer as-is
 * 
 * @param path - API path
 * @param req - Next.js request object
 * @param options - Optional headers and pre-read body Buffer
 * @returns Response JSON and status code
 */
export async function proxyRaw(
  path: string,
  req: Request,
  options: { headers?: Record<string, string>; body?: Buffer } = {}
): Promise<{ data: any; status: number }> {
  const url = `${API_BASE_URL}${path}`;

  // Use provided Buffer if available, otherwise read from request
  // CRITICAL: Never convert to string - use Buffer directly
  let body: Buffer;
  if (options.body && Buffer.isBuffer(options.body)) {
    body = options.body;
    console.log('[proxyRaw] Using provided Buffer', {
      path,
      bodyLength: body.length,
    });
  } else {
    // Fallback: read as ArrayBuffer and convert to Buffer (no string conversion)
    const ab = await req.arrayBuffer();
    body = Buffer.from(ab);
    console.log('[proxyRaw] Read ArrayBuffer and converted to Buffer', {
      path,
      arrayBufferLength: ab.byteLength,
      bufferLength: body.length,
    });
  }

  // Log for debugging (but don't log the actual body content)
  console.log('[proxyRaw] Forwarding webhook', {
    path,
    bodyLength: body.length,
    contentType: req.headers.get('content-type'),
    hasStripeSignature: !!req.headers.get('stripe-signature'),
  });

  // Merge headers - ONLY copy stripe-signature and content-type
  // Do NOT set Content-Length manually - fetch/undici handles this correctly
  const headers: Record<string, string> = {
    // Preserve exact Content-Type from Stripe
    'Content-Type': req.headers.get('content-type') || 'application/json',
    ...options.headers,
  };

  // Forward stripe-signature header (critical for webhook verification)
  // This header MUST be forwarded exactly as Stripe sent it
  const stripeSignature = req.headers.get('stripe-signature');
  if (stripeSignature) {
    headers['stripe-signature'] = stripeSignature;
  } else {
    console.warn('[proxyRaw] Missing stripe-signature header - webhook verification will fail');
  }

  // Forward other relevant headers
  const forwardHeaders = ['authorization', 'cookie'];
  forwardHeaders.forEach((key) => {
    const value = req.headers.get(key);
    if (value) {
      headers[key] = value;
    }
  });

  try {
    // Convert Buffer to Uint8Array for fetch (BodyInit compatibility)
    const bodyInit: BodyInit = new Uint8Array(body);
    const response = await fetch(url, {
      method: req.method,
      headers,
      body: bodyInit,
    });

    const data = await response.json().catch(() => ({}));
    return { data, status: response.status };
  } catch (error: any) {
    console.error(`[deepquill-proxy] Failed to proxy raw ${req.method} ${path}:`, error.message);
    throw new Error(`Proxy request failed: ${error.message}`);
  }
}

