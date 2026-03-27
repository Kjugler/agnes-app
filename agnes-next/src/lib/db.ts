import { PrismaClient } from '@prisma/client';

// IMPORTANT STORAGE GUARDRAIL:
// deepquill (Railway) is the canonical mutable datastore in production.
// Avoid introducing production-critical business state reads/writes in agnes-next.
// This client is retained for local/dev utilities and legacy non-canonical endpoints only.

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Reuse the client across hot-reloads in dev. New in prod.
export const prisma =
  global.prisma ??
  new PrismaClient({
    // you can comment out "query" if too chatty
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;
