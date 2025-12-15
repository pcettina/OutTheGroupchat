import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';

const createVotingSchema = z.object({
  type: z.enum(['DESTINATION', 'ACTIVITY', 'DATE', 'ACCOMMODATION', 'CUSTOM']),
  title: z.string().min(1),
  options: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    imageUrl: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  })),
  expirationHours: z.number().min(1).max(168).default(24),
});

const submitVoteSchema = z.object({
  sessionId: z.string(),
  optionId: z.string(),
  rank: z.number().optional(),
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

    const votingSessions = await prisma.votingSession.findMany({
      where: { tripId },
      include: {
        votes: true,
        _count: {
          select: { votes: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate results for each session
    const sessionsWithResults = votingSessions.map(vs => {
      const options = vs.options as any[];
      const voteCounts: Record<string, number> = {};
      
      options.forEach(opt => {
        voteCounts[opt.id] = 0;
      });

      vs.votes.forEach(vote => {
        voteCounts[vote.optionId] = (voteCounts[vote.optionId] || 0) + 1;
      });

      const totalVotes = vs.votes.length;
      const results = options.map(opt => ({
        optionId: opt.id,
        title: opt.title,
        votes: voteCounts[opt.id] || 0,
        percentage: totalVotes > 0 ? Math.round((voteCounts[opt.id] / totalVotes) * 100) : 0,
      })).sort((a, b) => b.votes - a.votes);

      // Check if user has voted
      const userVote = vs.votes.find(v => v.orderId === session.user.id);

      return {
        ...vs,
        results,
        userVote: userVote?.optionId,
        totalVotes,
      };
    });

    return NextResponse.json({ success: true, data: sessionsWithResults });
  } catch (error) {
    console.error('[VOTING_GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch voting sessions' },
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
        { success: false, error: 'Not authorized to create voting sessions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validationResult = createVotingSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { type, title, options, expirationHours } = validationResult.data;
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

    const votingSession = await prisma.votingSession.create({
      data: {
        tripId,
        type,
        title,
        options: options as any,
        status: 'ACTIVE',
        expiresAt,
      },
    });

    // Update trip status if not already voting
    await prisma.trip.update({
      where: { id: tripId },
      data: { status: 'VOTING' },
    }).catch(() => {});

    // Notify members
    const members = await prisma.tripMember.findMany({
      where: { tripId, userId: { not: session.user.id } },
    });

    await prisma.notification.createMany({
      data: members.map(m => ({
        userId: m.userId,
        type: 'VOTE_REMINDER' as const,
        title: 'New Vote',
        message: `A new voting session "${title}" has been created. Cast your vote!`,
        data: { tripId, votingSessionId: votingSession.id },
      })),
    });

    return NextResponse.json({ success: true, data: votingSession }, { status: 201 });
  } catch (error) {
    console.error('[VOTING_POST]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create voting session' },
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

    const body = await req.json();
    const validationResult = submitVoteSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionId, optionId, rank } = validationResult.data;

    // Check if voting session is active
    const votingSession = await prisma.votingSession.findUnique({
      where: { id: sessionId },
    });

    if (!votingSession) {
      return NextResponse.json(
        { success: false, error: 'Voting session not found' },
        { status: 404 }
      );
    }

    if (votingSession.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, error: 'Voting session is not active' },
        { status: 400 }
      );
    }

    if (new Date() > votingSession.expiresAt) {
      // Close the session
      await prisma.votingSession.update({
        where: { id: sessionId },
        data: { status: 'CLOSED' },
      });
      return NextResponse.json(
        { success: false, error: 'Voting session has expired' },
        { status: 400 }
      );
    }

    // Validate option exists
    const options = votingSession.options as any[];
    if (!options.find(o => o.id === optionId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid option' },
        { status: 400 }
      );
    }

    // Upsert vote (using orderId as voter ID for anonymous support)
    const vote = await prisma.vote.upsert({
      where: {
        sessionId_orderId_optionId: {
          sessionId,
          orderId: session.user.id,
          optionId,
        },
      },
      update: {
        rank,
      },
      create: {
        sessionId,
        orderId: session.user.id,
        optionId,
        rank,
      },
    });

    // Check if all members have voted
    const memberCount = await prisma.tripMember.count({ where: { tripId } });
    const uniqueVoters = await prisma.vote.groupBy({
      by: ['orderId'],
      where: { sessionId },
    });

    if (uniqueVoters.length >= memberCount) {
      // All members have voted - close the session
      await prisma.votingSession.update({
        where: { id: sessionId },
        data: { status: 'CLOSED' },
      });
    }

    return NextResponse.json({ success: true, data: vote });
  } catch (error) {
    console.error('[VOTING_PUT]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit vote' },
      { status: 500 }
    );
  }
}

