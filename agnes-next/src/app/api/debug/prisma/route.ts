// agnes-next/src/app/api/debug/prisma/route.ts
// DEV-ONLY: Debug endpoint to report Prisma DB path and status
// ⚠️ DO NOT EXPOSE IN PRODUCTION

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import * as path from 'path';
import * as fs from 'fs';

export const runtime = 'nodejs';

export async function GET() {
  // Track 2.1: Debug endpoints must return 404/403 in production
  const isProd = process.env.NODE_ENV === 'production';
  
  if (isProd) {
    // Production: Return 404 (not 403) to hide existence of endpoint
    return NextResponse.json(
      { error: 'Not Found' },
      { status: 404 }
    );
  }

  try {
    const dbUrl = process.env.DATABASE_URL || 'not set';
    
    // Resolve SQLite file path if applicable
    let resolvedPath: string | null = null;
    let dbExists = false;
    
    if (dbUrl.startsWith('file:')) {
      resolvedPath = dbUrl.replace('file:', '');
      // Handle relative paths
      if (!path.isAbsolute(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      dbExists = fs.existsSync(resolvedPath);
    }

    // Try to list tables (safe query) - always report success/error
    let tables: any[] = [];
    let tablesQueryOk = false;
    let tablesQueryError: string | null = null;

    try {
      const result = (await prisma.$queryRawUnsafe(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
      )) as { name: string }[];
      tables = result;
      tablesQueryOk = true;
    } catch (e: any) {
      tablesQueryError = e?.message ?? String(e);
    }

    // Fallback verification using Prisma model counts
    let signalCount: number | null = null;
    let userCount: number | null = null;

    try {
      signalCount = await prisma.signal.count();
    } catch (e) {
      // Ignore - signalCount stays null
    }

    try {
      userCount = await prisma.user.count();
    } catch (e) {
      // Ignore - userCount stays null
    }

    // Compute signal_table_exists: either from query OR from count check
    const signalTableExistsFromQuery = tables.some((t: any) => t.name === 'Signal');
    const signalTableExistsFromCount = signalCount !== null;
    const signalTableExists = signalTableExistsFromQuery || signalTableExistsFromCount;

    return NextResponse.json({
      dev_only: true,
      message: 'This is a development-only endpoint',
      database: {
        url: dbUrl,
        resolved_path: resolvedPath,
        exists: dbExists,
        tables: tables.map((t: any) => t.name),
        tables_query_ok: tablesQueryOk,
        tables_query_error: tablesQueryError,
        signal_table_exists: signalTableExists,
        signal_count: signalCount,
        user_count: userCount,
      },
      environment: {
        node_env: process.env.NODE_ENV,
        cwd: process.cwd(),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || String(err),
        dev_only: true,
      },
      { status: 500 }
    );
  }
}
