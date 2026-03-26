import { NextRequest, NextResponse } from 'next/server';

const VITE_TERMINAL_URL = process.env.NEXT_PUBLIC_TERMINAL_URL || 'http://localhost:5173';

/**
 * Rewrite HTML paths to use /terminal-proxy/ prefix
 * Prevents 404s when Vite assets are requested
 */
function rewriteHtmlPaths(html: string): string {
  // Avoid double-prefixing: only rewrite paths that start with "/ and are NOT already "/terminal-proxy/
  const prefix = '/terminal-proxy';

  // Specific rewrites for Vite assets
  let rewritten = html
    .replace(/src="\/@vite\/client"/g, `src="${prefix}/@vite/client"`)
    .replace(/href="\/@vite\/client"/g, `href="${prefix}/@vite/client"`)
    .replace(/src="\/src\//g, `src="${prefix}/src/`)
    .replace(/href="\/src\//g, `href="${prefix}/src/`)
    .replace(/src="\/vite\.svg"/g, `src="${prefix}/vite.svg"`)
    .replace(/href="\/vite\.svg"/g, `href="${prefix}/vite.svg"`);

  // General rewrite for any src="/ or href="/ that isn't already prefixed
  // EXCEPT: Don't rewrite /api/*, /jody-icons/* paths (they should stay at root level)
  // Use negative lookahead to avoid double-prefixing and exclude api and jody-icons
  rewritten = rewritten
    .replace(/src="\/(?!terminal-proxy\/|jody-icons\/|api\/)/g, `src="${prefix}/`)
    .replace(/href="\/(?!terminal-proxy\/|jody-icons\/|api\/)/g, `href="${prefix}/`);

  return rewritten;
}

/**
 * Rewrite JS/CSS module paths to use /terminal-proxy/ prefix
 * Handles import statements, from clauses, and other absolute paths in JS/CSS
 * Preserves query strings and avoids double-prefixing
 */
function rewriteModulePaths(content: string): string {
  const prefix = '/terminal-proxy';

  let rewritten = content;

  // Specific Vite special paths (handle first for priority)
  rewritten = rewritten
    .replace(/["']\/@react-refresh(["']|\?)/g, `"${prefix}/@react-refresh$1`)
    .replace(/["']\/@vite\/client(["']|\?)/g, `"${prefix}/@vite/client$1`)
    .replace(/["']\/@id\//g, `"${prefix}/@id/`)
    .replace(/["']\/@fs\//g, `"${prefix}/@fs/`)
    .replace(/["']\/node_modules\//g, `"${prefix}/node_modules/`)
    .replace(/["']\/src\//g, `"${prefix}/src/`);

  // General rewrite for quoted absolute paths (preserves query strings)
  // Pattern: quote, /, path (not already prefixed), optional query, closing quote
  // EXCEPT: Don't rewrite /api/*, /jody-icons/* paths (they should stay at root level)
  rewritten = rewritten.replace(
    /(["'])\/(?!terminal-proxy\/|jody-icons\/|api\/)([^"'\s]+?)(\1)/g,
    (match, quote, path, closingQuote) => {
      // Skip if already prefixed (shouldn't happen due to negative lookahead, but safety check)
      if (path.startsWith('terminal-proxy/') || path.startsWith('jody-icons/') || path.startsWith('api/')) {
        return match;
      }
      // Preserve query string if present
      return `${quote}${prefix}/${path}${closingQuote}`;
    }
  );

  // Handle import/from statements without quotes (less common)
  // EXCEPT: Don't rewrite /api/* paths
  rewritten = rewritten.replace(
    /(import|from)\s+["']\/(?!terminal-proxy\/|api\/)([^"'\s]+)/g,
    `$1 "${prefix}/$2`
  );

  // Handle URL() patterns in CSS and JS (preserve query strings)
  // EXCEPT: Don't rewrite /api/* paths
  rewritten = rewritten.replace(
    /url\(["']?\/(?!terminal-proxy\/|api\/)([^"')]+)/g,
    (match, path) => {
      // Skip if already prefixed or is API path
      if (path.startsWith('terminal-proxy/') || path.startsWith('api/')) return match;
      return `url("${prefix}/${path}`;
    }
  );

  return rewritten;
}

/**
 * Proxy route for terminal Vite app
 * Preserves origin (ngrok stays ngrok, localhost stays localhost)
 * Proxies requests to the Vite dev server running on port 5173
 * Rewrites HTML paths to use /terminal-proxy/ prefix
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params;
  const pathSegments = Array.isArray(path) ? path : [path];
  const targetPath = pathSegments.length > 0 ? `/${pathSegments.join('/')}` : '/';

  // F1: Exclude /api/* paths - they should go to actual API routes, not terminal-proxy
  if (pathSegments.length > 0 && pathSegments[0] === 'api') {
    console.log('[Terminal Proxy] Excluding API path from proxy:', targetPath);
    return NextResponse.next();
  }

  // SAFETY NET: Redirect /terminal-proxy/jody-icons/* to /jody-icons/*
  // This makes the system resilient even if paths accidentally get rewritten
  if (pathSegments.length > 0 && pathSegments[0] === 'jody-icons') {
    const jodyPath = `/${pathSegments.join('/')}`;
    console.log('[Terminal Proxy] Redirecting jody-icons request:', targetPath, '→', jodyPath);
    return NextResponse.redirect(new URL(jodyPath, req.url), 301);
  }

  // Build target URL
  const targetUrl = new URL(targetPath, VITE_TERMINAL_URL);

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  try {
    // Fetch from Vite dev server
    const response = await fetch(targetUrl.toString(), {
      headers: {
        // Forward relevant headers
        'Accept': req.headers.get('Accept') || '*/*',
        'Accept-Language': req.headers.get('Accept-Language') || '',
      },
    });

    // Get response body
    const body = await response.text();

    // Check response content type
    const contentType = response.headers.get('Content-Type') || '';
    const isHtml = contentType.includes('text/html');
    const isJs =
      contentType.includes('application/javascript') ||
      contentType.includes('text/javascript') ||
      contentType.includes('application/x-javascript') ||
      contentType.includes('application/json');
    const isCss = contentType.includes('text/css');

    // Rewrite paths based on content type
    let finalBody = body;
    if (isHtml) {
      finalBody = rewriteHtmlPaths(body);
    } else if (isJs || isCss) {
      finalBody = rewriteModulePaths(body);
    }

    // Create response with same status and headers
    const proxyResponse = new NextResponse(finalBody, {
      status: response.status,
      headers: {
        'Content-Type': isHtml
          ? 'text/html; charset=utf-8'
          : isJs
          ? contentType || 'application/javascript; charset=utf-8'
          : isCss
          ? 'text/css; charset=utf-8'
          : contentType,
        // Allow iframe embedding
        'X-Frame-Options': 'SAMEORIGIN',
        // Prevent caching of proxied content
        'Cache-Control': 'no-store',
      },
    });

    // Forward CORS headers if present
    const corsHeaders = ['Access-Control-Allow-Origin', 'Access-Control-Allow-Methods'];
    corsHeaders.forEach((header) => {
      const value = response.headers.get(header);
      if (value) {
        proxyResponse.headers.set(header, value);
      }
    });

    return proxyResponse;
  } catch (error) {
    console.error('[Terminal Proxy] Error proxying to Vite:', error);
    return NextResponse.json(
      { error: 'Terminal service unavailable' },
      { status: 503 }
    );
  }
}

// F1: Handle POST requests - terminal-proxy doesn't handle POST (only GET for Vite assets)
// If API paths somehow reach here, they should have been excluded by path rewriting
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params;
  const pathSegments = Array.isArray(path) ? path : [path];
  
  // F1: Log if API paths reach here (shouldn't happen if path rewriting works correctly)
  if (pathSegments.length > 0 && pathSegments[0] === 'api') {
    console.error('[Terminal Proxy] ERROR: API path reached POST handler (path rewriting failed):', `/${pathSegments.join('/')}`);
    // Return 404 so Next.js can try other routes (though this shouldn't happen)
    return NextResponse.json(
      { error: 'API route not found in terminal-proxy' },
      { status: 404 }
    );
  }
  
  // For non-API POST requests, return 405 (terminal-proxy only handles GET for Vite assets)
  return NextResponse.json(
    { error: 'Method not allowed for terminal-proxy' },
    { status: 405 }
  );
}
