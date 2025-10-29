import { PrismaClient } from '@prisma/client';

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
