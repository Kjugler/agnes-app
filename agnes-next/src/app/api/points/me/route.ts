import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    total: 0,
    firstName: null,
    earned: { purchase_book: false },
  });
}