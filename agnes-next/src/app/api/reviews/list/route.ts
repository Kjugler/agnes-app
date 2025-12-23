import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ReviewStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const takeParam = req.nextUrl.searchParams.get('take');
    const take = takeParam ? Math.min(parseInt(takeParam, 10), 100) : 50;

    const reviews = await prisma.review.findMany({
      where: {
        status: ReviewStatus.APPROVED,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take,
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
          },
        },
      },
    });

    const reviewsData = reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      text: review.text,
      tags: review.tags ? JSON.parse(review.tags) : null,
      createdAt: review.createdAt,
      userEmail: review.user.email,
      userFirstName: review.user.firstName,
    }));

    return NextResponse.json({
      ok: true,
      reviews: reviewsData,
    });
  } catch (err: any) {
    console.error('[reviews/list] Error', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

