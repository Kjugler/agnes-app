// Force Node runtime
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  // P0 guardrail: do not expose or rely on agnes-next local DB diagnostics in production.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  try {
    const tables = (await prisma.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    )) as { name: string }[];
    return NextResponse.json({
      ok: true,
      db_url: process.env.DATABASE_URL || null,
      tables: tables.map(t => t.name),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e), db_url: process.env.DATABASE_URL || null },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
