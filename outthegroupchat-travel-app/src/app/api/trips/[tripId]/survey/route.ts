import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';

const questionSchema = z.object({
  id: z.string(),
  type: z.enum(['single_choice', 'multiple_choice', 'ranking', 'scale', 'text', 'date_range', 'budget']),
  question: z.string(),
  description: z.string().optional(),
  required: z.boolean().default(true),
  options: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
});

const createSurveySchema = z.object({
  title: z.string().min(1),
  questions: z.array(questionSchema),
  expirationHours: z.number().min(1).max(168).default(48),
});

const submitResponseSchema = z.object({
  answers: z.record(z.string(), z.union([
    z.string(),
    z.array(z.string()),
    z.number(),
    z.array(z.number()),
    z.object({ start: z.string(), end: z.string() }),
  ])),
});

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

    const survey = await prisma.tripSurvey.findUnique({
      where: { tripId },
      include: {
        responses: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
        _count: {
          select: { responses: true },
        },
      },
    });

    if (!survey) {
      return NextResponse.json(
        { success: false, error: 'No survey found for this trip' },
        { status: 404 }
      );
    }

    // Check if user has responded
    const userResponse = survey.responses.find(r => r.userId === session.user.id);

    return NextResponse.json({
      success: true,
      data: {
        ...survey,
        hasResponded: !!userResponse,
        userResponse: userResponse?.answers,
      },
    });
  } catch (error) {
    console.error('[SURVEY_GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch survey' },
      { status: 500 }
    );
  }
}

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
        { success: false, error: 'Not authorized to create survey' },
        { status: 403 }
      );
    }

    // Check if survey already exists
    const existingSurvey = await prisma.tripSurvey.findUnique({
      where: { tripId },
    });

    if (existingSurvey) {
      return NextResponse.json(
        { success: false, error: 'Survey already exists for this trip' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const validationResult = createSurveySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { title, questions, expirationHours } = validationResult.data;
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

    const survey = await prisma.tripSurvey.create({
      data: {
        tripId,
        title,
        questions: questions as any,
        status: 'ACTIVE',
        expiresAt,
      },
    });

    // Update trip status
    await prisma.trip.update({
      where: { id: tripId },
      data: { status: 'SURVEYING' },
    });

    // Notify all members
    const members = await prisma.tripMember.findMany({
      where: { tripId, userId: { not: session.user.id } },
    });

    await prisma.notification.createMany({
      data: members.map(m => ({
        userId: m.userId,
        type: 'SURVEY_REMINDER' as const,
        title: 'New Survey',
        message: 'A new survey has been created for your trip. Please respond!',
        data: { tripId, surveyId: survey.id },
      })),
    });

    return NextResponse.json({ success: true, data: survey }, { status: 201 });
  } catch (error) {
    console.error('[SURVEY_POST]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create survey' },
      { status: 500 }
    );
  }
}

export async function PUT(
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

    const survey = await prisma.tripSurvey.findUnique({
      where: { tripId },
    });

    if (!survey) {
      return NextResponse.json(
        { success: false, error: 'No survey found' },
        { status: 404 }
      );
    }

    if (survey.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, error: 'Survey is not active' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const validationResult = submitResponseSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { answers } = validationResult.data;

    // Upsert the response
    const response = await prisma.surveyResponse.upsert({
      where: {
        surveyId_userId: {
          surveyId: survey.id,
          userId: session.user.id,
        },
      },
      update: {
        answers: answers as any,
      },
      create: {
        surveyId: survey.id,
        userId: session.user.id,
        answers: answers as any,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    // Check if all members have responded
    const memberCount = await prisma.tripMember.count({ where: { tripId } });
    const responseCount = await prisma.surveyResponse.count({ where: { surveyId: survey.id } });

    if (responseCount >= memberCount) {
      // All members have responded - close the survey
      await prisma.tripSurvey.update({
        where: { id: survey.id },
        data: { status: 'CLOSED' },
      });
    }

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    console.error('[SURVEY_PUT]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit response' },
      { status: 500 }
    );
  }
}

