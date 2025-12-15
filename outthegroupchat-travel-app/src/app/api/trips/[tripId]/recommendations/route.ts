import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { RecommendationService } from '@/services/recommendation.service';
import { z } from 'zod';

const applyRecommendationSchema = z.object({
  recommendationId: z.string(),
});

// Generate trip recommendations based on survey
export async function GET(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is a member
    const isMember = await prisma.tripMember.findFirst({
      where: { tripId, userId: session.user.id },
    });

    if (!isMember) {
      return NextResponse.json(
        { success: false, error: 'Not a member of this trip' },
        { status: 403 }
      );
    }

    // Get trip survey
    const survey = await prisma.tripSurvey.findUnique({
      where: { tripId },
      include: {
        _count: { select: { responses: true } },
      },
    });

    if (!survey) {
      return NextResponse.json(
        { success: false, error: 'No survey found. Create a survey first.' },
        { status: 400 }
      );
    }

    if (survey._count.responses === 0) {
      return NextResponse.json(
        { success: false, error: 'No survey responses yet. Wait for members to respond.' },
        { status: 400 }
      );
    }

    // Generate recommendations
    const recommendations = await RecommendationService.generateRecommendations(
      tripId,
      survey.id,
      5
    );

    return NextResponse.json({ success: true, data: recommendations });
  } catch (error) {
    console.error('[RECOMMENDATIONS_GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate recommendations' },
      { status: 500 }
    );
  }
}

// Apply a selected recommendation to the trip
export async function POST(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is owner or admin
    const membership = await prisma.tripMember.findFirst({
      where: {
        tripId,
        userId: session.user.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to apply recommendations' },
        { status: 403 }
      );
    }

    const body = await req.json();
    
    // If the body contains a full recommendation object
    if (body.destination && body.estimatedBudget) {
      await RecommendationService.applyRecommendation(tripId, body);

      // Notify members
      const members = await prisma.tripMember.findMany({
        where: { tripId, userId: { not: session.user.id } },
      });

      await prisma.notification.createMany({
        data: members.map(m => ({
          userId: m.userId,
          type: 'TRIP_UPDATE' as const,
          title: 'Trip Details Updated',
          message: 'The trip itinerary has been finalized!',
          data: { tripId },
        })),
      });

      const updatedTrip = await prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          itinerary: {
            include: { items: true },
          },
        },
      });

      return NextResponse.json({ success: true, data: updatedTrip });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid recommendation data' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[RECOMMENDATIONS_POST]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to apply recommendation' },
      { status: 500 }
    );
  }
}

