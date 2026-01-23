// agnes-next/src/lib/rateLimit.ts
// Track 2.4: Basic rate limiting for abuse prevention

import { NextRequest } from 'next/server';

// Simple in-memory rate limiter (for dev/testing)
// In production, use Redis or a proper rate limiting service
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60000, // 1 minute
};

/**
 * Rate limit by IP address
 * Returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function rateLimitByIP(
  req: NextRequest,
  config: Partial<RateLimitConfig> = {}
): { allowed: boolean; remaining: number; resetAt: number } {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const ip = getClientIP(req);
  const now = Date.now();
  
  const key = `rate_limit:${ip}`;
  const record = rateLimitStore.get(key);
  
  // Clean up expired records periodically
  if (rateLimitStore.size > 1000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetAt < now) {
        rateLimitStore.delete(k);
      }
    }
  }
  
  if (!record || record.resetAt < now) {
    // New window or expired - reset
    const resetAt = now + finalConfig.windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: finalConfig.maxRequests - 1, resetAt };
  }
  
  if (record.count >= finalConfig.maxRequests) {
    // Rate limit exceeded
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }
  
  // Increment count
  record.count++;
  rateLimitStore.set(key, record);
  
  return {
    allowed: true,
    remaining: finalConfig.maxRequests - record.count,
    resetAt: record.resetAt,
  };
}

function getClientIP(req: NextRequest): string {
  // Try various headers (Vercel, Cloudflare, etc.)
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = req.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  // Fallback (shouldn't happen in production)
  return 'unknown';
}

/**
 * Rate limit by email (for endpoints that require email)
 */
export function rateLimitByEmail(
  email: string,
  config: Partial<RateLimitConfig> = {}
): { allowed: boolean; remaining: number; resetAt: number } {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();
  
  const key = `rate_limit:email:${email.toLowerCase()}`;
  const record = rateLimitStore.get(key);
  
  if (!record || record.resetAt < now) {
    const resetAt = now + finalConfig.windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: finalConfig.maxRequests - 1, resetAt };
  }
  
  if (record.count >= finalConfig.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }
  
  record.count++;
  rateLimitStore.set(key, record);
  
  return {
    allowed: true,
    remaining: finalConfig.maxRequests - record.count,
    resetAt: record.resetAt,
  };
}
