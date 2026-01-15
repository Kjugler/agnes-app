import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { normalizeEmail } from '@/lib/email';
import { ensureAssociateMinimal } from '@/lib/associate';
import { prisma } from '@/lib/db';
import { proxyJson } from '@/lib/deepquillProxy';

/**
 * POST /api/checkout/finalize?session_id=...
 * 
 * Retrieves Stripe checkout session, extracts customer email,
 * logs user in, and returns redirect path (new → /contest/ascension, existing → /contest/score)
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'session_id required' },
        { status: 400 }
      );
    }

    console.log('[checkout/finalize] Processing session', { sessionId });

    // Retrieve Stripe session via deepquill proxy
    let session: any;
    try {
      const { data, status } = await proxyJson('/api/stripe/session', req, {
        method: 'POST',
        body: { sessionId },
      });
      
      if (status !== 200 || !data) {
        throw new Error(data?.error || 'Failed to retrieve session');
      }
      
      session = data.session;
    } catch (err: any) {
      console.error('[checkout/finalize] Failed to retrieve Stripe session', {
        sessionId,
        error: err?.message,
      });
      return NextResponse.json(
        { error: 'Failed to retrieve checkout session' },
        { status: 500 }
      );
    }

    // Extract customer email (multiple fallbacks)
    let customerEmail: string | null = null;
    if (session?.customer_details?.email) {
      customerEmail = session.customer_details.email;
    } else if (session?.customer_email) {
      customerEmail = session.customer_email;
    } else if (session?.customer && typeof session.customer === 'object' && 'email' in session.customer) {
      customerEmail = (session.customer as any).email;
    }

    if (!customerEmail) {
      console.warn('[checkout/finalize] No email found in Stripe session', {
        sessionId,
        sessionKeys: session ? Object.keys(session) : 'no session',
      });
      return NextResponse.json(
        { error: 'No email found in checkout session' },
        { status: 400 }
      );
    }

    const email = normalizeEmail(customerEmail);
    console.log('[checkout/finalize] Extracted email from session', { email, sessionId });

    // Ensure user exists and mark contest joined
    const user = await ensureAssociateMinimal(email);
    
    // RETROACTIVE PURCHASE ATTRIBUTION: 
    // 1) Check if this session's Purchase record has userId: null
    // 2) Also check for OTHER unattributed purchases with the same email
    // This handles cases where webhook ran before user account existed
    try {
      const PURCHASE_POINTS = 500;
      let totalPointsAwarded = 0;
      
      // Step 1: Attribute current session's purchase
      const currentPurchase = await prisma.purchase.findUnique({
        where: { stripeSessionId: sessionId },
        select: { userId: true, pointsAwarded: true },
      });
      
      if (currentPurchase && (!currentPurchase.userId || currentPurchase.pointsAwarded === 0)) {
        // Award purchase points using guardrails helper
        const purchaseAwardResult = await awardPurchaseDailyPoints({
          userId: user.id,
          purchaseId: currentPurchase.id,
          now: currentPurchase.createdAt,
        });
        
        await prisma.purchase.update({
          where: { stripeSessionId: sessionId },
          data: {
            userId: user.id,
            userCode: user.code || null,
            pointsAwarded: purchaseAwardResult.awarded,
          },
        });
        
        totalPointsAwarded += purchaseAwardResult.awarded;
        console.log('[checkout/finalize] Retroactively attributed current purchase', {
          sessionId,
          userId: user.id,
          email,
          pointsAwarded: purchaseAwardResult.awarded,
          reason: purchaseAwardResult.reason,
        });
      }
      
      // Step 2: Find OTHER unattributed purchases and check if they match this user's email
      // We'll fetch Stripe sessions for unattributed purchases and match by customer email
      const unattributedPurchases = await prisma.purchase.findMany({
        where: {
          OR: [
            { userId: null },
            { pointsAwarded: 0 },
          ],
        },
        select: {
          id: true,
          stripeSessionId: true,
          userId: true,
          pointsAwarded: true,
          createdAt: true,
        },
        take: 10, // Limit to avoid too many Stripe API calls
      });
      
      for (const unattributed of unattributedPurchases) {
        // Skip if already attributed to this user
        if (unattributed.userId === user.id) continue;
        // Skip current session (already handled above)
        if (unattributed.stripeSessionId === sessionId) continue;
        
        try {
          // Fetch Stripe session to get customer email
          const { data: sessionData } = await proxyJson('/api/stripe/session', req, {
            method: 'POST',
            body: { sessionId: unattributed.stripeSessionId },
          });
          
          if (sessionData?.session) {
            const sessionEmail = sessionData.session.customer_details?.email || 
                                sessionData.session.customer_email ||
                                (sessionData.session.customer && typeof sessionData.session.customer === 'object' && 'email' in sessionData.session.customer 
                                  ? (sessionData.session.customer as any).email : null);
            
            if (sessionEmail && normalizeEmail(sessionEmail) === email) {
              // This purchase belongs to this user!
              // Award purchase points using guardrails helper
              const purchaseAwardResult2 = await awardPurchaseDailyPoints({
                userId: user.id,
                purchaseId: unattributed.id,
                now: unattributed.createdAt,
              });
              
              await prisma.purchase.update({
                where: { stripeSessionId: unattributed.stripeSessionId },
                data: {
                  userId: user.id,
                  userCode: user.code || null,
                  pointsAwarded: purchaseAwardResult2.awarded,
                },
              });
              
              totalPointsAwarded += purchaseAwardResult2.awarded;
              console.log('[checkout/finalize] Retroactively attributed other purchase', {
                sessionId: unattributed.stripeSessionId,
                userId: user.id,
                email,
                pointsAwarded: purchaseAwardResult2.awarded,
                reason: purchaseAwardResult2.reason,
              });
            }
          }
        } catch (sessionErr: any) {
          // Skip if we can't fetch the session (might be rate limited or session doesn't exist)
          console.warn('[checkout/finalize] Could not fetch session for unattributed purchase', {
            sessionId: unattributed.stripeSessionId,
            error: sessionErr?.message,
          });
        }
      }
      
      if (totalPointsAwarded > 0) {
        console.log('[checkout/finalize] Total retroactive points awarded', {
          userId: user.id,
          email,
          totalPointsAwarded,
        });
      }
    } catch (retroErr: any) {
      // Don't fail checkout finalization if retroactive attribution fails
      console.warn('[checkout/finalize] Failed to retroactively attribute purchases', {
        error: retroErr?.message,
        sessionId,
        email,
      });
    }
    
    // Mark contest joined if not already set
    if (!user.contestJoinedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { contestJoinedAt: new Date() },
      });
      console.log('[checkout/finalize] Marked user as contest joined', { email, userId: user.id });
    }

    // Set session cookies (same as contest/login route)
    const cookieStore = await cookies();
    const origin = req.headers.get('origin');
    const host = req.headers.get('host') || '';
    const isLocalhost = origin?.includes('localhost') || origin?.includes('127.0.0.1') || host.includes('localhost');
    const isNgrok = host.includes('ngrok-free.dev') || host.includes('ngrok.io');
    const needsSecureCookies = isNgrok || process.env.NODE_ENV === 'production';
    
    // For ngrok and production: use sameSite='none' and secure=true (required for cross-site cookies)
    // For localhost: use sameSite='lax' and secure=false
    cookieStore.set('contest_email', email, {
      httpOnly: true,
      secure: needsSecureCookies,
      sameSite: needsSecureCookies ? 'none' : 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    cookieStore.set('user_email', email, {
      httpOnly: false,
      secure: needsSecureCookies,
      sameSite: needsSecureCookies ? 'none' : 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    console.log('[checkout/finalize] Cookies set', { email, userId: user.id });

    // Determine redirect path: new users → /contest/ascension, existing → /contest/score
    const wasNewUser = !user.contestJoinedAt || 
      (user.contestJoinedAt && new Date(user.contestJoinedAt).getTime() > Date.now() - 5000); // Joined within last 5 seconds
    
    const redirectPath = wasNewUser ? '/contest/ascension' : '/contest/score';

    console.log('[checkout/finalize] Finalizing', {
      email,
      userId: user.id,
      redirectPath,
      wasNewUser,
    });

    return NextResponse.json({
      ok: true,
      email,
      userId: user.id,
      redirectPath,
      wasNewUser,
    });
  } catch (err: any) {
    console.error('[checkout/finalize] Error', {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { error: 'Failed to finalize checkout' },
      { status: 500 }
    );
  }
}

