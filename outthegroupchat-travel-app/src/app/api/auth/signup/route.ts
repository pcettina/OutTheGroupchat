import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    // Validate input
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // If user exists but has no password (beta signup), allow setting password
      if (!existingUser.password) {
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Update user with password
        const updatedUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            password: hashedPassword,
            name: name || existingUser.name,
            passwordInitialized: true,
          },
        });

        // Process any pending invitations for this email
        try {
          const pendingInvitations = await prisma.pendingInvitation.findMany({
            where: { 
              email,
              expiresAt: { gt: new Date() }, // Only non-expired invitations
            },
            include: {
              trip: { select: { title: true } },
            },
          });

          if (pendingInvitations.length > 0) {
            // Convert pending invitations to real trip invitations
            for (const pending of pendingInvitations) {
              // Create real trip invitation
              await prisma.tripInvitation.create({
                data: {
                  tripId: pending.tripId,
                  userId: updatedUser.id,
                  status: 'PENDING',
                  expiresAt: pending.expiresAt,
                },
              });

              // Create notification
              await prisma.notification.create({
                data: {
                  userId: updatedUser.id,
                  type: 'TRIP_INVITATION',
                  title: 'Trip Invitation',
                  message: `You've been invited to join "${pending.trip.title}"!`,
                  data: { tripId: pending.tripId },
                },
              });
            }

            // Delete processed pending invitations
            await prisma.pendingInvitation.deleteMany({
              where: { email },
            });

            logger.info({ userId: updatedUser.id, invitationsProcessed: pendingInvitations.length }, 
              'Processed pending invitations for beta user setting password');
          }
        } catch (inviteError) {
          // Log but don't fail signup if invitation processing fails
          logger.error({ err: inviteError, userId: updatedUser.id }, 
            'Failed to process pending invitations');
        }

        return NextResponse.json({
          success: true,
          user: {
            id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
          },
        });
      }
      
      // User exists and already has password
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    // Process any pending invitations for this email
    try {
      const pendingInvitations = await prisma.pendingInvitation.findMany({
        where: { 
          email,
          expiresAt: { gt: new Date() }, // Only non-expired invitations
        },
        include: {
          trip: { select: { title: true } },
        },
      });

      if (pendingInvitations.length > 0) {
        // Convert pending invitations to real trip invitations
        for (const pending of pendingInvitations) {
          // Create real trip invitation
          await prisma.tripInvitation.create({
            data: {
              tripId: pending.tripId,
              userId: user.id,
              status: 'PENDING',
              expiresAt: pending.expiresAt,
            },
          });

          // Create notification
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'TRIP_INVITATION',
              title: 'Trip Invitation',
              message: `You've been invited to join "${pending.trip.title}"!`,
              data: { tripId: pending.tripId },
            },
          });
        }

        // Delete processed pending invitations
        await prisma.pendingInvitation.deleteMany({
          where: { email },
        });

        logger.info({ userId: user.id, invitationsProcessed: pendingInvitations.length }, 
          'Processed pending invitations for new user');
      }
    } catch (inviteError) {
      // Log but don't fail signup if invitation processing fails
      logger.error({ err: inviteError, userId: user.id }, 
        'Failed to process pending invitations');
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    logger.error({ err: error, context: 'SIGNUP' }, 'Error during signup');
    
    // Handle specific Prisma errors
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 400 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Unable to create account. Please try again.' },
      { status: 500 }
    );
  }
} 