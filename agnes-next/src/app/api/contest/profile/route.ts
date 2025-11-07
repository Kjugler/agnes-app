import { NextRequest, NextResponse } from 'next/server';
import type { Associate } from '@/types/contest';
import { promises as fs } from 'fs';
import path from 'path';

// Reuse the same store path as signup
const STORE_PATH = path.join(process.cwd(), 'tmp', 'associates.json');
const associates = new Map<string, Associate>();

// Load from file on startup (best-effort)
async function loadStore() {
  try {
    const data = await fs.readFile(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(data) as Associate[];
    parsed.forEach((assoc) => {
      associates.set(assoc.email.toLowerCase(), assoc);
    });
  } catch {
    // File doesn't exist or invalid - start fresh
  }
}

// Save to file (best-effort, non-blocking)
async function saveStore() {
  try {
    const data = Array.from(associates.values());
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Best-effort - if it fails, continue in-memory only
  }
}

// Load on module init
if (typeof window === 'undefined') {
  loadStore().catch(() => {});
}

// Get email from request (cookie or query param for dev)
function getEmail(req: NextRequest): string | null {
  // Try query param first (for dev)
  const emailFromQuery = req.nextUrl.searchParams.get('email');
  if (emailFromQuery) return emailFromQuery.toLowerCase();

  // Try cookie
  const emailFromCookie = req.cookies.get('email')?.value;
  if (emailFromCookie) return emailFromCookie.toLowerCase();

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const email = getEmail(req);
    if (!email) {
      return NextResponse.json(
        { error: 'Email required (set ?email=... or cookie)' },
        { status: 400 }
      );
    }

    const emailKey = email.toLowerCase();
    const associate = associates.get(emailKey);

    if (!associate) {
      return NextResponse.json(
        { error: 'Associate not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, associate });
  } catch (error) {
    console.error('[profile][GET] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const email = getEmail(req);
    if (!email) {
      return NextResponse.json(
        { error: 'Email required (set ?email=... or cookie)' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { x, instagram, tiktok, truth } = body;

    const emailKey = email.toLowerCase();
    const associate = associates.get(emailKey);

    if (!associate) {
      return NextResponse.json(
        { error: 'Associate not found' },
        { status: 404 }
      );
    }

    // Update handles
    const updated: Associate = {
      ...associate,
      social: {
        ...associate.social,
        ...(x !== undefined && { x }),
        ...(instagram !== undefined && { instagram }),
        ...(tiktok !== undefined && { tiktok }),
        ...(truth !== undefined && { truth }),
      },
    };

    // Store in memory
    associates.set(emailKey, updated);

    // Persist to file (best-effort, non-blocking)
    saveStore().catch(() => {});

    return NextResponse.json({ ok: true, associate: updated });
  } catch (error) {
    console.error('[profile][PUT] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

