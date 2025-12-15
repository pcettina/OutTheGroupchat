import { PrismaClient } from '@prisma/client';
import { seedUsers } from './generators/users';
import { seedTrips } from './generators/trips';
import { seedActivities } from './generators/activities';
import { 
  seedFollows, 
  seedActivityEngagement, 
  seedNotifications,
  seedSurveys 
} from './generators/social';

const prisma = new PrismaClient();

async function cleanDatabase() {
  console.log('🧹 Cleaning database...');
  
  // Delete in correct order to respect foreign keys
  await prisma.vote.deleteMany();
  await prisma.votingSession.deleteMany();
  await prisma.surveyResponse.deleteMany();
  await prisma.tripSurvey.deleteMany();
  await prisma.activityRating.deleteMany();
  await prisma.activityComment.deleteMany();
  await prisma.savedActivity.deleteMany();
  await prisma.itineraryItem.deleteMany();
  await prisma.itineraryDay.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.tripInvitation.deleteMany();
  await prisma.tripMember.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  
  console.log('   ✅ Database cleaned');
}

async function main() {
  console.log('\n🌱 Starting OutTheGroupchat Database Seeding...\n');
  console.log('='.repeat(50));
  
  // Only clean in development
  if (process.env.NODE_ENV !== 'production') {
    await cleanDatabase();
  }
  
  console.log('\n📦 Phase 1: Core Data\n');
  
  // 1. Create users
  const userIdMap = await seedUsers(prisma);
  
  // 2. Create trips with members
  const tripIdMap = await seedTrips(prisma, userIdMap);
  
  // 3. Create activities
  await seedActivities(prisma, tripIdMap);
  
  console.log('\n📦 Phase 2: Social & Engagement\n');
  
  // 4. Create follow relationships
  await seedFollows(prisma, userIdMap);
  
  // 5. Create surveys
  await seedSurveys(prisma, tripIdMap, userIdMap);
  
  // 6. Create activity engagement (ratings, comments, saves)
  await seedActivityEngagement(prisma, userIdMap);
  
  // 7. Create notifications
  await seedNotifications(prisma, userIdMap);
  
  console.log('\n' + '='.repeat(50));
  console.log('\n✅ Database seeding completed!\n');
  
  // Print summary
  const userCount = await prisma.user.count();
  const tripCount = await prisma.trip.count();
  const activityCount = await prisma.activity.count();
  const followCount = await prisma.follow.count();
  const ratingCount = await prisma.activityRating.count();
  const commentCount = await prisma.activityComment.count();
  
  console.log('📊 Summary:');
  console.log(`   Users: ${userCount}`);
  console.log(`   Trips: ${tripCount}`);
  console.log(`   Activities: ${activityCount}`);
  console.log(`   Follows: ${followCount}`);
  console.log(`   Ratings: ${ratingCount}`);
  console.log(`   Comments: ${commentCount}`);
  
  console.log('\n📋 Demo Accounts:');
  console.log('   Email: alex@demo.com');
  console.log('   Email: jordan@demo.com');
  console.log('   Email: taylor@demo.com');
  console.log('   Password: demo123 (for all accounts)\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
