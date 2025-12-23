import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ReviewStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const reviews = await prisma.review.findMany({
      where: {
        status: ReviewStatus.APPROVED,
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

    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const average = isStable ? sum / count : null;

    const distribution = {
      1: reviews.filter((r) => r.rating === 1).length,
      2: reviews.filter((r) => r.rating === 2).length,
      3: reviews.filter((r) => r.rating === 3).length,
      4: reviews.filter((r) => r.rating === 4).length,
      5: reviews.filter((r) => r.rating === 5).length,
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

