import { PrismaClient } from '@prisma/client';
import path from 'path';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Ensure DATABASE_URL is set (Next.js should load .env.local automatically, but ensure it's set)
if (!process.env.DATABASE_URL) {
  // Fallback: use shared deepquill database (both apps use the same DB)
  const dbPath = path.resolve(process.cwd(), '..', 'deepquill', 'dev.db');
  process.env.DATABASE_URL = `file:${dbPath}`;
  console.log('[DB] DATABASE_URL not found in env, using fallback:', process.env.DATABASE_URL);
}

// Reuse the client across hot-reloads in dev. New in prod.
export const prisma =
  global.prisma ??
  new PrismaClient({
    // you can comment out "query" if too chatty
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;
