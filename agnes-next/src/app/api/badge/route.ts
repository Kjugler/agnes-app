import { NextResponse } from 'next/server';
import { ENTRY_FRONT_DOOR } from '@/lib/entryFrontDoor';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.search ? `${url.search}` : '';
  return NextResponse.redirect(new URL(`${ENTRY_FRONT_DOOR}${params}`, url.origin), 307);
}
