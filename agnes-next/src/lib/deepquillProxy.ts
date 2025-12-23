/**
 * Proxy helper for forwarding requests to deepquill backend
 * 
 * This allows agnes-next to delegate Stripe/Mailchimp operations to deepquill
 * without maintaining SDK clients or secrets in agnes-next.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5055';

export interface ProxyOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
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
  const url = `${API_BASE_URL}${path}`;

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
  const forwardHeaders = ['x-user-email', 'authorization', 'cookie'];
  forwardHeaders.forEach((key) => {
    const value = req.headers.get(key);
    if (value) {
      headers[key] = value;
    }
  });

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
 * @param path - API path
 * @param req - Next.js request object
 * @param options - Optional headers
 * @returns Response JSON and status code
 */
export async function proxyRaw(
  path: string,
  req: Request,
  options: { headers?: Record<string, string> } = {}
): Promise<{ data: any; status: number }> {
  const url = `${API_BASE_URL}${path}`;

  // Read raw body as ArrayBuffer
  const rawBody = await req.arrayBuffer();
  const body = Buffer.from(rawBody);

  // Merge headers, preserving stripe-signature
  const headers: Record<string, string> = {
    'Content-Type': req.headers.get('content-type') || 'application/json',
    ...options.headers,
  };

  // Forward stripe-signature header (critical for webhook verification)
  const stripeSignature = req.headers.get('stripe-signature');
  if (stripeSignature) {
    headers['stripe-signature'] = stripeSignature;
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
    const response = await fetch(url, {
      method: req.method,
      headers,
      body,
    });

    const data = await response.json().catch(() => ({}));
    return { data, status: response.status };
  } catch (error: any) {
    console.error(`[deepquill-proxy] Failed to proxy raw ${req.method} ${path}:`, error.message);
    throw new Error(`Proxy request failed: ${error.message}`);
  }
}

