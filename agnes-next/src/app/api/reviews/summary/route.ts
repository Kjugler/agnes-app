import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const reviews: Array<{ rating: number }> = await prisma.review.findMany({
      where: {
        status: 'APPROVED',
      },
      select: {
        rating: true,
      },
    });

    const count = reviews.length;
    const isStable = count >= 5;

    if (count === 0) {
      return NextResponse.json({
        ok: true,
        count: 0,
        isStable: false,
        average: null,
        distribution: {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
        },
      });
    }

    const sum = reviews.reduce(
      (acc: number, r: { rating: number }) => acc + r.rating,
      0
    );
    const average = isStable ? sum / count : null;

    const distribution = {
      1: reviews.filter((r: { rating: number }) => r.rating === 1).length,
      2: reviews.filter((r: { rating: number }) => r.rating === 2).length,
      3: reviews.filter((r: { rating: number }) => r.rating === 3).length,
      4: reviews.filter((r: { rating: number }) => r.rating === 4).length,
      5: reviews.filter((r: { rating: number }) => r.rating === 5).length,
    };

    return NextResponse.json({
      ok: true,
      count,
      isStable,
      average: average ? Math.round(average * 10) / 10 : null, // Round to 1 decimal
      distribution,
    });
  } catch (err: any) {
    console.error('[reviews/summary] Error', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

