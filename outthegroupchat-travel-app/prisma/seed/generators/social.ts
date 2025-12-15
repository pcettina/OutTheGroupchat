import { PrismaClient, NotificationType } from '@prisma/client';

// Generate follows between users who share trips or interests
export async function seedFollows(
  prisma: PrismaClient,
  userIdMap: Map<string, string>
): Promise<void> {
  console.log('👥 Creating follow relationships...');
  
  const followPairs = [
    // Core friend groups
    ['alex@demo.com', 'jordan@demo.com'],
    ['alex@demo.com', 'casey@demo.com'],
    ['alex@demo.com', 'taylor@demo.com'],
    ['jordan@demo.com', 'alex@demo.com'],
    ['jordan@demo.com', 'riley@demo.com'],
    ['jordan@demo.com', 'cameron@demo.com'],
    ['taylor@demo.com', 'alex@demo.com'],
    ['taylor@demo.com', 'morgan@demo.com'],
    ['casey@demo.com', 'alex@demo.com'],
    ['casey@demo.com', 'drew@demo.com'],
    ['casey@demo.com', 'reese@demo.com'],
    
    // Mutual follows from trips
    ['sam@demo.com', 'jamie@demo.com'],
    ['sam@demo.com', 'emery@demo.com'],
    ['jamie@demo.com', 'sam@demo.com'],
    ['jamie@demo.com', 'quinn@demo.com'],
    ['quinn@demo.com', 'jamie@demo.com'],
    ['quinn@demo.com', 'emery@demo.com'],
    
    // Miami crew
    ['riley@demo.com', 'jordan@demo.com'],
    ['riley@demo.com', 'avery@demo.com'],
    ['avery@demo.com', 'riley@demo.com'],
    ['avery@demo.com', 'taylor@demo.com'],
    
    // NOLA/Southern crew
    ['skyler@demo.com', 'drew@demo.com'],
    ['skyler@demo.com', 'reese@demo.com'],
    ['drew@demo.com', 'skyler@demo.com'],
    ['drew@demo.com', 'casey@demo.com'],
    
    // Vegas/West coast
    ['dakota@demo.com', 'blake@demo.com'],
    ['dakota@demo.com', 'cameron@demo.com'],
    ['blake@demo.com', 'dakota@demo.com'],
    ['cameron@demo.com', 'dakota@demo.com'],
    
    // Random organic follows
    ['morgan@demo.com', 'frankie@demo.com'],
    ['frankie@demo.com', 'morgan@demo.com'],
    ['reese@demo.com', 'skyler@demo.com'],
    ['emery@demo.com', 'quinn@demo.com'],
  ];
  
  let created = 0;
  for (const [followerEmail, followingEmail] of followPairs) {
    const followerId = userIdMap.get(followerEmail);
    const followingId = userIdMap.get(followingEmail);
    
    if (followerId && followingId) {
      try {
        await prisma.follow.create({
          data: { followerId, followingId },
        });
        created++;
      } catch {
        // Skip duplicates
      }
    }
  }
  
  console.log(`   ✅ Created ${created} follow relationships`);
}

// Generate ratings and comments on activities
export async function seedActivityEngagement(
  prisma: PrismaClient,
  userIdMap: Map<string, string>
): Promise<void> {
  console.log('⭐ Creating activity engagement...');
  
  // Get all public activities
  const activities = await prisma.activity.findMany({
    where: { isPublic: true },
    select: { id: true, name: true, tripId: true },
  });
  
  const userIds = Array.from(userIdMap.values());
  
  const reviewTemplates = [
    { score: 5, review: 'Absolutely incredible! This was the highlight of our trip. 10/10 would recommend.' },
    { score: 5, review: 'Perfect experience. Everything exceeded expectations!' },
    { score: 4, review: 'Really enjoyed this! Great vibes and worth the time.' },
    { score: 4, review: 'Solid choice. Would definitely do again with friends.' },
    { score: 4, review: 'Better than expected! The reviews don\'t do it justice.' },
    { score: 5, review: 'This is what travel is all about. Unforgettable!' },
    { score: 3, review: 'Good but not great. Worth checking out if you have time.' },
    { score: 5, review: 'Life-changing experience. Already planning to come back!' },
  ];
  
  const commentTemplates = [
    'Can\'t wait to try this!',
    'We had so much fun here!',
    'Pro tip: go early to avoid crowds',
    'The vibes here are unmatched 🔥',
    'Adding this to our list!',
    'Best decision of the trip',
    'This looks amazing!',
    'How long should we budget for this?',
    'Is this good for groups?',
    'Wow, this is exactly what we need!',
    'Thanks for the rec! 🙌',
    'We did this last year - so good!',
    'The photos don\'t even do it justice',
    'Bookmarking for our next trip',
  ];
  
  let ratingsCreated = 0;
  let commentsCreated = 0;
  let savesCreated = 0;
  
  for (const activity of activities) {
    // Random number of ratings (0-4)
    const numRatings = Math.floor(Math.random() * 5);
    const ratedUserIds = new Set<string>();
    
    for (let i = 0; i < numRatings; i++) {
      const randomUserId = userIds[Math.floor(Math.random() * userIds.length)];
      if (ratedUserIds.has(randomUserId)) continue;
      ratedUserIds.add(randomUserId);
      
      const template = reviewTemplates[Math.floor(Math.random() * reviewTemplates.length)];
      
      try {
        await prisma.activityRating.create({
          data: {
            activityId: activity.id,
            userId: randomUserId,
            score: template.score,
            review: Math.random() > 0.5 ? template.review : null,
          },
        });
        ratingsCreated++;
      } catch {
        // Skip duplicates
      }
    }
    
    // Random number of comments (0-3)
    const numComments = Math.floor(Math.random() * 4);
    for (let i = 0; i < numComments; i++) {
      const randomUserId = userIds[Math.floor(Math.random() * userIds.length)];
      const comment = commentTemplates[Math.floor(Math.random() * commentTemplates.length)];
      
      await prisma.activityComment.create({
        data: {
          activityId: activity.id,
          userId: randomUserId,
          text: comment,
        },
      });
      commentsCreated++;
    }
    
    // Random saves (0-5)
    const numSaves = Math.floor(Math.random() * 6);
    const savedUserIds = new Set<string>();
    
    for (let i = 0; i < numSaves; i++) {
      const randomUserId = userIds[Math.floor(Math.random() * userIds.length)];
      if (savedUserIds.has(randomUserId)) continue;
      savedUserIds.add(randomUserId);
      
      try {
        await prisma.savedActivity.create({
          data: {
            activityId: activity.id,
            userId: randomUserId,
          },
        });
        savesCreated++;
      } catch {
        // Skip duplicates
      }
    }
  }
  
  console.log(`   ✅ Created ${ratingsCreated} ratings, ${commentsCreated} comments, ${savesCreated} saves`);
}

// Generate notifications for recent activity
export async function seedNotifications(
  prisma: PrismaClient,
  userIdMap: Map<string, string>
): Promise<void> {
  console.log('🔔 Creating notifications...');
  
  const notifications: Array<{ userEmail: string; type: NotificationType; title: string; message: string; read: boolean }> = [
    { userEmail: 'alex@demo.com', type: NotificationType.TRIP_INVITATION, title: 'New Trip Invitation', message: 'Jordan invited you to "Vegas Birthday Bash"', read: false },
    { userEmail: 'alex@demo.com', type: NotificationType.SURVEY_REMINDER, title: 'Survey Closing Soon', message: 'Complete the survey for "Austin Music & BBQ Crawl" before it closes!', read: false },
    { userEmail: 'alex@demo.com', type: NotificationType.TRIP_UPDATE, title: 'Trip Updated', message: 'New activity added to "Nashville Bachelor Party"', read: true },
    { userEmail: 'jordan@demo.com', type: NotificationType.VOTE_REMINDER, title: 'Vote Now', message: 'Voting ends soon for "Miami Art Basel Weekend"', read: false },
    { userEmail: 'jordan@demo.com', type: NotificationType.FOLLOW, title: 'New Follower', message: 'Riley started following you', read: true },
    { userEmail: 'taylor@demo.com', type: NotificationType.ACTIVITY_COMMENT, title: 'New Comment', message: 'Alex commented on "Husk Restaurant"', read: false },
    { userEmail: 'casey@demo.com', type: NotificationType.TRIP_UPDATE, title: 'Member Joined', message: 'Reese joined "Austin Music & BBQ Crawl"', read: true },
    { userEmail: 'sam@demo.com', type: NotificationType.SURVEY_REMINDER, title: 'Survey Available', message: 'Share your preferences for "Colorado Ski Trip"', read: false },
    { userEmail: 'riley@demo.com', type: NotificationType.TRIP_INVITATION, title: 'New Trip Invitation', message: 'Avery invited you to "Miami Art Basel Weekend"', read: true },
    { userEmail: 'dakota@demo.com', type: NotificationType.TRIP_UPDATE, title: 'Trip Confirmed', message: '"Vegas Birthday Bash" is now fully booked!', read: false },
  ];
  
  for (const notif of notifications) {
    const userId = userIdMap.get(notif.userEmail);
    if (!userId) continue;
    
    await prisma.notification.create({
      data: {
        userId,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        read: notif.read,
        data: {},
      },
    });
  }
  
  console.log(`   ✅ Created ${notifications.length} notifications`);
}

// Generate surveys for SURVEYING trips
export async function seedSurveys(
  prisma: PrismaClient,
  tripIdMap: Map<string, string>,
  userIdMap: Map<string, string>
): Promise<void> {
  console.log('📋 Creating surveys...');
  
  // Austin trip survey
  const austinTripId = tripIdMap.get('Austin Music & BBQ Crawl');
  if (austinTripId) {
    const survey = await prisma.tripSurvey.create({
      data: {
        tripId: austinTripId,
        title: 'Austin Trip Preferences',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        questions: [
          {
            id: 'dates',
            type: 'multiple_choice',
            question: 'Which dates work for you?',
            required: true,
            options: ['March 15-18', 'March 22-25', 'April 5-8'],
          },
          {
            id: 'budget',
            type: 'budget',
            question: 'What\'s your budget for this trip?',
            required: true,
            min: 300,
            max: 1500,
          },
          {
            id: 'bbq_priority',
            type: 'ranking',
            question: 'Rank these BBQ spots',
            required: true,
            options: ['Franklin BBQ', 'La Barbecue', 'Micklethwait', 'Terry Black\'s'],
          },
          {
            id: 'activities',
            type: 'multiple_choice',
            question: 'What activities interest you?',
            required: false,
            options: ['Live Music', 'Barton Springs', 'Food Tours', 'Brewery Crawl', 'Hiking'],
          },
        ],
      },
    });
    
    // Add some responses
    const alexId = userIdMap.get('alex@demo.com');
    const drewId = userIdMap.get('drew@demo.com');
    
    if (alexId) {
      await prisma.surveyResponse.create({
        data: {
          surveyId: survey.id,
          userId: alexId,
          answers: {
            dates: ['March 15-18'],
            budget: 750,
            bbq_priority: ['Franklin BBQ', 'La Barbecue', 'Terry Black\'s', 'Micklethwait'],
            activities: ['Live Music', 'Food Tours', 'Brewery Crawl'],
          },
        },
      });
    }
    
    if (drewId) {
      await prisma.surveyResponse.create({
        data: {
          surveyId: survey.id,
          userId: drewId,
          answers: {
            dates: ['March 15-18', 'March 22-25'],
            budget: 500,
            bbq_priority: ['La Barbecue', 'Franklin BBQ', 'Micklethwait', 'Terry Black\'s'],
            activities: ['Live Music', 'Barton Springs'],
          },
        },
      });
    }
  }
  
  // Colorado trip survey
  const coloradoTripId = tripIdMap.get('Colorado Ski Trip');
  if (coloradoTripId) {
    await prisma.tripSurvey.create({
      data: {
        tripId: coloradoTripId,
        title: 'Ski Trip Preferences',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        questions: [
          {
            id: 'resort',
            type: 'single_choice',
            question: 'Which resort do you prefer?',
            required: true,
            options: ['Vail', 'Breckenridge', 'Aspen', 'Keystone'],
          },
          {
            id: 'skill_level',
            type: 'single_choice',
            question: 'What\'s your ski level?',
            required: true,
            options: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
          },
          {
            id: 'budget',
            type: 'budget',
            question: 'Budget for the trip?',
            required: true,
            min: 500,
            max: 3000,
          },
        ],
      },
    });
  }
  
  console.log('   ✅ Created surveys with responses');
}

