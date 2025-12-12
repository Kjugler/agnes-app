import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { normalizeEmail } from '@/lib/email';
import { ensureAssociateMinimal } from '@/lib/associate';
import { prisma } from '@/lib/db';

// CORS helper for cross-origin requests
function corsHeaders(origin: string | null) {
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174', // Vite might use different port if 5173 is busy
    'http://localhost:3000',
    'http://localhost:3002',
    'https://agnes-dev.ngrok-free.app',
  ];
  
  // Allow any localhost port for development
  const isLocalhost = origin && origin.startsWith('http://localhost:');
  const isAllowed = origin && (isLocalhost || allowedOrigins.some(allowed => origin.startsWith(allowed)));
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export async function OPTIONS(req: NextRequest) {
  try {
    const origin = req.headers.get('origin');
    console.log('[contest/login] OPTIONS preflight request', { origin });
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  } catch (err: any) {
    console.error('[contest/login] OPTIONS error', err);
    const origin = req.headers.get('origin');
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = body?.email;

    console.log('[contest/login] Received request', {
      emailRaw,
      bodyKeys: Object.keys(body || {}),
    });

    if (!emailRaw || typeof emailRaw !== 'string') {
      console.error('[contest/login] Missing or invalid email in request');
      const origin = req.headers.get('origin');
      return NextResponse.json(
        { ok: false, error: 'email required' },
        {
          status: 400,
          headers: corsHeaders(origin),
        }
      );
    }

    // Normalize email (trim, lowercase)
    const email = normalizeEmail(emailRaw);
    console.log('[contest/login] Normalized email:', email);

    // Upsert contest player (User record) - always use the email from request
    const user = await ensureAssociateMinimal(email);

    // Mark that user has joined the contest (if not already set)
    if (!user.contestJoinedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { contestJoinedAt: new Date() },
      });
    }

    // Set HTTP-only cookie for contest session - ALWAYS overwrite any previous value
    const cookieStore = await cookies();
    const origin = req.headers.get('origin');
    const isLocalhost = origin?.includes('localhost') || origin?.includes('127.0.0.1');
    
    // For cross-origin requests (like from localhost:5173), we need to be more permissive
    cookieStore.set('contest_email', email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: isLocalhost ? 'lax' : 'lax', // 'lax' allows cross-site cookies
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // Also set a non-HTTP-only cookie for client-side access (for backward compatibility)
    cookieStore.set('user_email', email, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: isLocalhost ? 'lax' : 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    
    console.log('[contest/login] Cookies set', {
      email,
      origin,
      isLocalhost,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
    });

    console.log('[contest/login] User logged in successfully', {
      email,
      userId: user.id,
      contestJoinedAt: user.contestJoinedAt,
      previousContestJoinedAt: user.contestJoinedAt ? 'already set' : 'now set',
    });

    return NextResponse.json(
      {
        ok: true,
        email,
        userId: user.id,
      },
      {
        headers: corsHeaders(origin),
      }
    );
  } catch (err: any) {
    console.error('[contest/login] Error', {
      error: err?.message,
      stack: err?.stack,
    });
    const origin = req.headers.get('origin');
    return NextResponse.json(
      { ok: false, error: 'server_error' },
      {
        status: 500,
        headers: corsHeaders(origin),
      }
    );
  }
}

