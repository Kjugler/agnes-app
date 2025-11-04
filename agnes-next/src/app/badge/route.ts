import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.search ? `${url.search}` : '';
  return NextResponse.redirect(new URL(`/contest/score${params}`, url.origin), 307);
}