import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { generateCode } from '@/lib/referral';
import type { Associate, SignupPayload } from '@/types/contest';
import { promises as fs } from 'fs';
import path from 'path';

// In-memory store (singleton)
const associates = new Map<string, Associate>();

// Persistence file path
const STORE_PATH = path.join(process.cwd(), 'tmp', 'associates.json');

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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SignupPayload;

    // Validate required fields
    if (!body.firstName || !body.email) {
      return NextResponse.json(
        { error: 'firstName and email are required' },
        { status: 400 }
      );
    }

    const emailKey = body.email.toLowerCase();

    // Check if associate already exists
    if (associates.has(emailKey)) {
      const existing = associates.get(emailKey)!;
      return NextResponse.json({ ok: true, associate: existing });
    }

    // Create new associate
    const associate: Associate = {
      id: nanoid(),
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      social: {
        x: body.x,
        instagram: body.instagram,
        tiktok: body.tiktok,
      },
      code: generateCode(body.firstName),
      createdAt: new Date().toISOString(),
    };

    // Store in memory
    associates.set(emailKey, associate);

    // Persist to file (best-effort, non-blocking)
    saveStore().catch(() => {});

    return NextResponse.json({ ok: true, associate });
  } catch (error) {
    console.error('[signup] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

