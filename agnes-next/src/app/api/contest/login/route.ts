import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { normalizeEmail } from '@/lib/email';
import { ensureAssociateMinimal } from '@/lib/associate';
import { prisma } from '@/lib/db';
import { proxyJson } from '@/lib/deepquillProxy';
import { awardPurchaseDailyPoints } from '@/lib/points/awardPoints';

// CORS helper for cross-origin requests
function corsHeaders(origin: string | null) {
  const allowedOrigins = [
    'http://localhost:5173', // deepquill (Vite)
    'http://localhost:5174', // Vite might use different port if 5173 is busy
    'http://localhost:3000', // Next.js default
    'http://localhost:3002', // agnes-next (Next.js)
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
    const skipAttribution = body?.skipAttribution === true; // Allow skipping heavy attribution

    console.log('[contest/login] Received request', {
      emailRaw,
      skipAttribution,
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

    // RETROACTIVE PURCHASE ATTRIBUTION (skip if requested for performance):
    // 1) Find unattributed purchases (userId: null) and attribute them
    // 2) Find purchases linked to this user but missing points in user.points field
    if (!skipAttribution) {
      try {
      const PURCHASE_POINTS = 500;
      let totalPointsAwarded = 0;
      
      console.log('[contest/login] Starting retroactive purchase attribution', {
        userId: user.id,
        email,
        currentUserPoints: user.points,
      });
      
      // Step 1: Find Purchase records with userId: null or pointsAwarded: 0 (unattributed)
      const unattributedPurchases = await prisma.purchase.findMany({
        where: {
          OR: [
            { userId: null },
            { pointsAwarded: 0 },
          ],
        },
        select: {
          stripeSessionId: true,
          userId: true,
          pointsAwarded: true,
        },
        take: 10, // Limit to avoid too many Stripe API calls
      });
      
      console.log('[contest/login] Found unattributed purchases', {
        count: unattributedPurchases.length,
        sessionIds: unattributedPurchases.map(p => p.stripeSessionId),
      });
      
      // Step 2: Find ALL Purchase records (even if linked to different userId) and check by email
      // CRITICAL: This handles cases where purchases are linked to a DIFFERENT user account
      // (e.g., user account was recreated but purchases exist under old userId)
      // PERFORMANCE: Limit to 10 purchases max to prevent timeout (was 50)
      const allPurchases = await prisma.purchase.findMany({
        select: {
          stripeSessionId: true,
          userId: true,
          pointsAwarded: true,
        },
        take: 10, // Reduced from 50 to prevent timeout on ngrok
        orderBy: { createdAt: 'desc' }, // Check most recent purchases first
      });
      
      console.log('[contest/login] Checking all purchases for email match', {
        totalPurchasesFound: allPurchases.length,
        currentUserId: user.id,
      });
      
      let purchasesToAttribute: Array<{ sessionId: string; pointsAwarded: number }> = [];
      
      for (const purchase of allPurchases) {
        // Skip if already attributed to this user
        if (purchase.userId === user.id) {
          console.log('[contest/login] Skipping purchase already attributed to current user', {
            sessionId: purchase.stripeSessionId,
            userId: purchase.userId,
          });
          continue;
        }
        
        try {
          console.log('[contest/login] Checking purchase for email match', {
            sessionId: purchase.stripeSessionId,
            currentUserId: purchase.userId,
            pointsAwarded: purchase.pointsAwarded,
          });
          
          // Fetch Stripe session to get metadata and customer email
          const { data: sessionData } = await proxyJson('/api/stripe/session', req, {
            method: 'POST',
            body: { sessionId: purchase.stripeSessionId },
          });
          
          if (sessionData?.session) {
            const session = sessionData.session;
            const metadata = session.metadata || {};
            
            // PRIMARY: Check contest_user_id from metadata (most reliable)
            const sessionContestUserId = metadata.contest_user_id || null;
            const userIdMatch = sessionContestUserId && sessionContestUserId === user.id;
            
            // FALLBACK: Check contest_user_code from metadata
            const sessionContestUserCode = metadata.contest_user_code || metadata.code || null;
            const normalizeCode = (code: string | null) => code ? code.trim().toUpperCase() : null;
            const userCodeMatch = sessionContestUserCode && user.code && 
                                  normalizeCode(sessionContestUserCode) === normalizeCode(user.code);
            
            // LAST RESORT: Check email (may be wrong if referral code was used)
            const sessionEmail = session.customer_details?.email || 
                                session.customer_email ||
                                (session.customer && typeof session.customer === 'object' && 'email' in session.customer 
                                  ? (session.customer as any).email : null);
            const normalizedSessionEmail = sessionEmail ? normalizeEmail(sessionEmail) : null;
            const emailMatch = normalizedSessionEmail === email;
            
            console.log('[contest/login] Stripe session attribution check', {
              sessionId: purchase.stripeSessionId,
              sessionContestUserId,
              currentUserId: user.id,
              userIdMatch,
              sessionContestUserCode,
              currentUserCode: user.code,
              userCodeMatch,
              sessionEmail,
              normalizedSessionEmail,
              userEmail: email,
              emailMatch,
            });
            
            // Attribute if ANY identifier matches (prioritize userId > userCode > email)
            if (userIdMatch || userCodeMatch || emailMatch) {
              // This purchase belongs to this user!
              const matchMethod = userIdMatch ? 'contest_user_id' : 
                                  userCodeMatch ? 'contest_user_code' : 
                                  'email';
              purchasesToAttribute.push({
                sessionId: purchase.stripeSessionId,
                pointsAwarded: purchase.pointsAwarded || PURCHASE_POINTS,
              });
              console.log('[contest/login] Purchase matched, adding to attribution list', {
                sessionId: purchase.stripeSessionId,
                pointsAwarded: purchase.pointsAwarded || PURCHASE_POINTS,
                matchMethod,
              });
            } else {
              console.log('[contest/login] Purchase does not match current user', {
                sessionId: purchase.stripeSessionId,
                sessionContestUserId,
                currentUserId: user.id,
                sessionContestUserCode,
                currentUserCode: user.code,
                sessionEmail,
                userEmail: email,
              });
            }
          } else {
            console.warn('[contest/login] No session data returned from Stripe', {
              sessionId: purchase.stripeSessionId,
            });
          }
        } catch (sessionErr: any) {
          console.warn('[contest/login] Could not fetch session for purchase', {
            sessionId: purchase.stripeSessionId,
            error: sessionErr?.message,
          });
        }
      }
      
      console.log('[contest/login] Purchases to attribute summary', {
        totalFound: purchasesToAttribute.length,
        purchases: purchasesToAttribute.map(p => ({
          sessionId: p.sessionId,
          pointsAwarded: p.pointsAwarded,
        })),
      });
      
      // Step 3: Attribute all matching purchases to this user and award points
      if (purchasesToAttribute.length > 0) {
        const totalPointsToAward = purchasesToAttribute.reduce((sum, p) => sum + p.pointsAwarded, 0);
        
        // Update all Purchase records in a transaction
        await prisma.$transaction([
          ...purchasesToAttribute.map(p => 
            prisma.purchase.update({
              where: { stripeSessionId: p.sessionId },
              data: {
                userId: user.id,
                userCode: user.code || null,
                pointsAwarded: p.pointsAwarded,
              },
            })
          ),
          prisma.user.update({
            where: { id: user.id },
            data: {
              points: { increment: totalPointsToAward },
              earnedPurchaseBook: true,
            },
          }),
        ]);
        
        totalPointsAwarded += totalPointsToAward;
        console.log('[contest/login] Retroactively attributed purchases by email', {
          userId: user.id,
          email,
          purchasesAttributed: purchasesToAttribute.length,
          totalPointsAwarded,
          sessionIds: purchasesToAttribute.map(p => p.sessionId),
        });
      }
      
      // Step 4: Also check purchases already linked to this user for missing points
      const userPurchases = await prisma.purchase.findMany({
        where: { userId: user.id },
        select: {
          stripeSessionId: true,
          pointsAwarded: true,
        },
      });
      
      const expectedPointsFromPurchases = userPurchases.reduce((sum, p) => sum + (p.pointsAwarded || 0), 0);
      const pointsMissing = expectedPointsFromPurchases - (user.points || 0);
      
      console.log('[contest/login] Purchase points check after attribution', {
        userPurchasesCount: userPurchases.length,
        expectedPointsFromPurchases,
        currentUserPoints: user.points,
        pointsMissing,
      });
      
      // If points are still missing, award them retroactively
      if (pointsMissing > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            points: { increment: pointsMissing },
            earnedPurchaseBook: true,
          },
        });
        totalPointsAwarded += pointsMissing;
        console.log('[contest/login] Retroactively awarded missing purchase points', {
          userId: user.id,
          email,
          pointsAwarded: pointsMissing,
        });
      }
      
      for (const unattributed of unattributedPurchases) {
        // Skip if already attributed to this user
        if (unattributed.userId === user.id) {
          console.log('[contest/login] Skipping purchase already attributed to user', {
            sessionId: unattributed.stripeSessionId,
            userId: unattributed.userId,
          });
          continue;
        }
        
        try {
          console.log('[contest/login] Fetching Stripe session for unattributed purchase', {
            sessionId: unattributed.stripeSessionId,
          });
          
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
            
            console.log('[contest/login] Stripe session email check', {
              sessionId: unattributed.stripeSessionId,
              sessionEmail,
              userEmail: email,
              match: sessionEmail && normalizeEmail(sessionEmail) === email,
            });
            
            if (sessionEmail && normalizeEmail(sessionEmail) === email) {
              // This purchase belongs to this user!
              // Award purchase points using guardrails helper
              const { awardPurchaseDailyPoints } = await import('@/lib/points/awardPoints');
              const purchaseAwardResult = await awardPurchaseDailyPoints({
                userId: user.id,
                purchaseId: unattributed.id,
                now: unattributed.createdAt,
              });
              
              await prisma.purchase.update({
                where: { stripeSessionId: unattributed.stripeSessionId },
                data: {
                  userId: user.id,
                  userCode: user.code || null,
                  pointsAwarded: purchaseAwardResult.awarded,
                },
              });
              
              totalPointsAwarded += purchaseAwardResult.awarded;
              console.log('[contest/login] Retroactively attributed purchase', {
                sessionId: unattributed.stripeSessionId,
                userId: user.id,
                email,
                pointsAwarded: purchaseAwardResult.awarded,
                reason: purchaseAwardResult.reason,
                pointsAwarded: PURCHASE_POINTS,
              });
            }
          }
        } catch (sessionErr: any) {
          // Skip if we can't fetch the session (might be rate limited or session doesn't exist)
          console.warn('[contest/login] Could not fetch session for unattributed purchase', {
            sessionId: unattributed.stripeSessionId,
            error: sessionErr?.message,
          });
        }
      }
      
      if (totalPointsAwarded > 0) {
        console.log('[contest/login] Total retroactive points awarded', {
          userId: user.id,
          email,
          totalPointsAwarded,
        });
      }
      } catch (retroErr: any) {
        // Don't fail login if retroactive attribution fails
        console.warn('[contest/login] Failed to retroactively attribute purchases', {
          error: retroErr?.message,
          email,
        });
      }
    } else {
      console.log('[contest/login] Skipping retroactive attribution (skipAttribution=true)');
    }

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

    // Also set a non-HTTP-only cookie for client-side access (for backward compatibility)
    cookieStore.set('user_email', email, {
      httpOnly: false,
      secure: needsSecureCookies,
      sameSite: needsSecureCookies ? 'none' : 'lax',
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

