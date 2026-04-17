-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TRIP_INVITATION', 'TRIP_UPDATE', 'TRIP_COMMENT', 'TRIP_LIKE', 'ACTIVITY_COMMENT', 'ACTIVITY_RATING', 'SURVEY_REMINDER', 'VOTE_REMINDER', 'FOLLOW', 'SYSTEM', 'CREW_REQUEST', 'CREW_ACCEPTED', 'MEETUP_INVITED', 'MEETUP_RSVP', 'MEETUP_STARTING_SOON', 'CHECK_IN_NEARBY');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PLANNING', 'INVITING', 'SURVEYING', 'VOTING', 'BOOKED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TripMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ANALYZED');

-- CreateEnum
CREATE TYPE "VotingType" AS ENUM ('DESTINATION', 'ACTIVITY', 'DATE', 'ACCOMMODATION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "VotingStatus" AS ENUM ('ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActivityCategory" AS ENUM ('FOOD', 'CULTURE', 'SHOPPING', 'NATURE', 'ENTERTAINMENT', 'SPORTS', 'NIGHTLIFE', 'TRANSPORTATION', 'ACCOMMODATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('SUGGESTED', 'APPROVED', 'BOOKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PriceRange" AS ENUM ('FREE', 'BUDGET', 'MODERATE', 'EXPENSIVE', 'LUXURY');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('NOT_NEEDED', 'RECOMMENDED', 'REQUIRED', 'BOOKED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ExternalSource" AS ENUM ('OPENTRIPMAP', 'FOURSQUARE', 'OPENSTREETMAP', 'WIKIVOYAGE', 'GOOGLE_PLACES', 'YELP', 'TRIPADVISOR', 'MANUAL');

-- CreateEnum
CREATE TYPE "CrewStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "MeetupVisibility" AS ENUM ('PUBLIC', 'CREW', 'INVITE_ONLY', 'PRIVATE');

-- CreateEnum
CREATE TYPE "AttendeeStatus" AS ENUM ('GOING', 'MAYBE', 'DECLINED');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VenueCategory" AS ENUM ('BAR', 'COFFEE', 'RESTAURANT', 'PARK', 'GYM', 'COWORKING', 'OTHER');

-- CreateEnum
CREATE TYPE "CheckInVisibility" AS ENUM ('PUBLIC', 'CREW', 'PRIVATE');

-- CreateEnum
CREATE TYPE "PollType" AS ENUM ('SURVEY', 'VOTE', 'RSVP_POLL');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('CHECK_IN', 'MEETUP_CREATED', 'MEETUP_ATTENDED', 'CREW_MADE', 'TEXT_POST');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "password" TEXT,
    "name" TEXT,
    "image" TEXT,
    "bio" TEXT,
    "city" TEXT,
    "crewLabel" VARCHAR(20),
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "betaSignupDate" TIMESTAMP(3),
    "newsletterSubscribed" BOOLEAN NOT NULL DEFAULT false,
    "newsletterSubscribedAt" TIMESTAMP(3),
    "passwordInitialized" BOOLEAN NOT NULL DEFAULT false,
    "betaLaunchEmailSent" BOOLEAN NOT NULL DEFAULT false,
    "preferences" JSONB,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripComment" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripLike" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TripStatus" NOT NULL DEFAULT 'PLANNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "destination" JSONB NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "budget" JSONB,
    "ownerId" TEXT NOT NULL,
    "coverImage" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripMember" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TripMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "budgetRange" JSONB,
    "departureCity" TEXT,
    "flightDetails" JSONB,

    CONSTRAINT "TripMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripInvitation" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripSurvey" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SurveyStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "questions" JSONB NOT NULL,

    CONSTRAINT "TripSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VotingSession" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" "VotingType" NOT NULL,
    "status" "VotingStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "options" JSONB NOT NULL,

    CONSTRAINT "VotingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "rank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "ActivityCategory" NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'SUGGESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "location" JSONB,
    "date" TIMESTAMP(3),
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "duration" INTEGER,
    "cost" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "priceRange" "PriceRange",
    "costDetails" JSONB,
    "bookingStatus" "BookingStatus" NOT NULL DEFAULT 'NOT_NEEDED',
    "bookingUrl" TEXT,
    "confirmationCode" TEXT,
    "requirements" JSONB,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "originalTripId" TEXT,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "externalLinks" JSONB,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityComment" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityRating" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "review" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItineraryDay" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ItineraryDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItineraryItem" (
    "id" TEXT NOT NULL,
    "itineraryDayId" TEXT NOT NULL,
    "activityId" TEXT,
    "order" INTEGER NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "customTitle" TEXT,
    "notes" TEXT,

    CONSTRAINT "ItineraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalActivity" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" "ExternalSource" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "ratingCount" INTEGER,
    "priceLevel" INTEGER,
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "websiteUrl" TEXT,
    "phoneNumber" TEXT,
    "openingHours" JSONB,
    "searchText" TEXT,
    "popularity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastFetched" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DestinationCache" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "activityCount" INTEGER NOT NULL DEFAULT 0,
    "averageRating" DOUBLE PRECISION,
    "topCategories" TEXT[],
    "description" TEXT,
    "highlights" JSONB,
    "bestTimeToVisit" TEXT,
    "averageBudget" JSONB,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataQuality" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DestinationCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL,
    "timezone" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "category" "VenueCategory" NOT NULL DEFAULT 'OTHER',
    "source" TEXT,
    "externalId" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cityId" TEXT,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Crew" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "status" "CrewStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Crew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meetup" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "hostId" TEXT NOT NULL,
    "venueId" TEXT,
    "venueName" TEXT,
    "cityId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "visibility" "MeetupVisibility" NOT NULL DEFAULT 'CREW',
    "capacity" INTEGER,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetupAttendee" (
    "id" TEXT NOT NULL,
    "meetupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AttendeeStatus" NOT NULL DEFAULT 'GOING',
    "checkedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetupAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetupInvite" (
    "id" TEXT NOT NULL,
    "meetupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetupInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "venueId" TEXT,
    "venueName" TEXT,
    "cityId" TEXT,
    "note" TEXT,
    "visibility" "CheckInVisibility" NOT NULL DEFAULT 'CREW',
    "activeUntil" TIMESTAMP(3) NOT NULL DEFAULT (now() + interval '6 hours'),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "PollType" NOT NULL,
    "options" JSONB NOT NULL,
    "meetupId" TEXT,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollResponse" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PollResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" "PostType" NOT NULL,
    "content" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "Follow_followerId_idx" ON "Follow"("followerId");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "TripComment_tripId_idx" ON "TripComment"("tripId");

-- CreateIndex
CREATE INDEX "TripComment_userId_idx" ON "TripComment"("userId");

-- CreateIndex
CREATE INDEX "TripLike_tripId_idx" ON "TripLike"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "TripLike_userId_tripId_key" ON "TripLike"("userId", "tripId");

-- CreateIndex
CREATE INDEX "Trip_ownerId_idx" ON "Trip"("ownerId");

-- CreateIndex
CREATE INDEX "Trip_status_idx" ON "Trip"("status");

-- CreateIndex
CREATE INDEX "Trip_startDate_idx" ON "Trip"("startDate");

-- CreateIndex
CREATE INDEX "TripMember_tripId_idx" ON "TripMember"("tripId");

-- CreateIndex
CREATE INDEX "TripMember_userId_idx" ON "TripMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TripMember_tripId_userId_key" ON "TripMember"("tripId", "userId");

-- CreateIndex
CREATE INDEX "TripInvitation_tripId_idx" ON "TripInvitation"("tripId");

-- CreateIndex
CREATE INDEX "TripInvitation_userId_status_idx" ON "TripInvitation"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TripInvitation_tripId_userId_key" ON "TripInvitation"("tripId", "userId");

-- CreateIndex
CREATE INDEX "PendingInvitation_email_idx" ON "PendingInvitation"("email");

-- CreateIndex
CREATE INDEX "PendingInvitation_tripId_idx" ON "PendingInvitation"("tripId");

-- CreateIndex
CREATE INDEX "PendingInvitation_expiresAt_idx" ON "PendingInvitation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripSurvey_tripId_key" ON "TripSurvey"("tripId");

-- CreateIndex
CREATE INDEX "SurveyResponse_surveyId_idx" ON "SurveyResponse"("surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyResponse_surveyId_userId_key" ON "SurveyResponse"("surveyId", "userId");

-- CreateIndex
CREATE INDEX "VotingSession_tripId_idx" ON "VotingSession"("tripId");

-- CreateIndex
CREATE INDEX "Vote_sessionId_idx" ON "Vote"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_sessionId_orderId_optionId_key" ON "Vote"("sessionId", "orderId", "optionId");

-- CreateIndex
CREATE INDEX "Activity_tripId_idx" ON "Activity"("tripId");

-- CreateIndex
CREATE INDEX "Activity_category_idx" ON "Activity"("category");

-- CreateIndex
CREATE INDEX "Activity_isPublic_idx" ON "Activity"("isPublic");

-- CreateIndex
CREATE INDEX "SavedActivity_userId_idx" ON "SavedActivity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedActivity_userId_activityId_key" ON "SavedActivity"("userId", "activityId");

-- CreateIndex
CREATE INDEX "ActivityComment_activityId_idx" ON "ActivityComment"("activityId");

-- CreateIndex
CREATE INDEX "ActivityRating_activityId_idx" ON "ActivityRating"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityRating_activityId_userId_key" ON "ActivityRating"("activityId", "userId");

-- CreateIndex
CREATE INDEX "ItineraryDay_tripId_idx" ON "ItineraryDay"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "ItineraryDay_tripId_dayNumber_key" ON "ItineraryDay"("tripId", "dayNumber");

-- CreateIndex
CREATE INDEX "ItineraryItem_itineraryDayId_idx" ON "ItineraryItem"("itineraryDayId");

-- CreateIndex
CREATE INDEX "ExternalActivity_city_category_idx" ON "ExternalActivity"("city", "category");

-- CreateIndex
CREATE INDEX "ExternalActivity_city_country_idx" ON "ExternalActivity"("city", "country");

-- CreateIndex
CREATE INDEX "ExternalActivity_latitude_longitude_idx" ON "ExternalActivity"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalActivity_externalId_source_key" ON "ExternalActivity"("externalId", "source");

-- CreateIndex
CREATE INDEX "DestinationCache_country_idx" ON "DestinationCache"("country");

-- CreateIndex
CREATE UNIQUE INDEX "DestinationCache_city_country_key" ON "DestinationCache"("city", "country");

-- CreateIndex
CREATE INDEX "City_country_idx" ON "City"("country");

-- CreateIndex
CREATE UNIQUE INDEX "City_name_country_key" ON "City"("name", "country");

-- CreateIndex
CREATE INDEX "Venue_city_category_idx" ON "Venue"("city", "category");

-- CreateIndex
CREATE INDEX "Venue_latitude_longitude_idx" ON "Venue"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Crew_userAId_status_idx" ON "Crew"("userAId", "status");

-- CreateIndex
CREATE INDEX "Crew_userBId_status_idx" ON "Crew"("userBId", "status");

-- CreateIndex
CREATE INDEX "Crew_requestedById_idx" ON "Crew"("requestedById");

-- CreateIndex
CREATE UNIQUE INDEX "Crew_userAId_userBId_key" ON "Crew"("userAId", "userBId");

-- CreateIndex
CREATE INDEX "Meetup_hostId_idx" ON "Meetup"("hostId");

-- CreateIndex
CREATE INDEX "Meetup_scheduledAt_idx" ON "Meetup"("scheduledAt");

-- CreateIndex
CREATE INDEX "Meetup_cityId_scheduledAt_idx" ON "Meetup"("cityId", "scheduledAt");

-- CreateIndex
CREATE INDEX "MeetupAttendee_meetupId_idx" ON "MeetupAttendee"("meetupId");

-- CreateIndex
CREATE INDEX "MeetupAttendee_userId_idx" ON "MeetupAttendee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetupAttendee_meetupId_userId_key" ON "MeetupAttendee"("meetupId", "userId");

-- CreateIndex
CREATE INDEX "MeetupInvite_meetupId_idx" ON "MeetupInvite"("meetupId");

-- CreateIndex
CREATE INDEX "MeetupInvite_userId_status_idx" ON "MeetupInvite"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MeetupInvite_meetupId_userId_key" ON "MeetupInvite"("meetupId", "userId");

-- CreateIndex
CREATE INDEX "CheckIn_userId_idx" ON "CheckIn"("userId");

-- CreateIndex
CREATE INDEX "CheckIn_cityId_createdAt_idx" ON "CheckIn"("cityId", "createdAt");

-- CreateIndex
CREATE INDEX "CheckIn_createdAt_idx" ON "CheckIn"("createdAt");

-- CreateIndex
CREATE INDEX "CheckIn_activeUntil_idx" ON "CheckIn"("activeUntil");

-- CreateIndex
CREATE INDEX "Poll_meetupId_idx" ON "Poll"("meetupId");

-- CreateIndex
CREATE INDEX "Poll_createdBy_idx" ON "Poll"("createdBy");

-- CreateIndex
CREATE INDEX "Poll_expiresAt_idx" ON "Poll"("expiresAt");

-- CreateIndex
CREATE INDEX "PollResponse_pollId_idx" ON "PollResponse"("pollId");

-- CreateIndex
CREATE UNIQUE INDEX "PollResponse_pollId_userId_key" ON "PollResponse"("pollId", "userId");

-- CreateIndex
CREATE INDEX "Post_authorId_createdAt_idx" ON "Post"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripComment" ADD CONSTRAINT "TripComment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripComment" ADD CONSTRAINT "TripComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripLike" ADD CONSTRAINT "TripLike_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripLike" ADD CONSTRAINT "TripLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripInvitation" ADD CONSTRAINT "TripInvitation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripInvitation" ADD CONSTRAINT "TripInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingInvitation" ADD CONSTRAINT "PendingInvitation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingInvitation" ADD CONSTRAINT "PendingInvitation_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripSurvey" ADD CONSTRAINT "TripSurvey_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "TripSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingSession" ADD CONSTRAINT "VotingSession_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VotingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedActivity" ADD CONSTRAINT "SavedActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedActivity" ADD CONSTRAINT "SavedActivity_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityComment" ADD CONSTRAINT "ActivityComment_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityComment" ADD CONSTRAINT "ActivityComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRating" ADD CONSTRAINT "ActivityRating_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRating" ADD CONSTRAINT "ActivityRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryDay" ADD CONSTRAINT "ItineraryDay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_itineraryDayId_fkey" FOREIGN KEY ("itineraryDayId") REFERENCES "ItineraryDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crew" ADD CONSTRAINT "Crew_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crew" ADD CONSTRAINT "Crew_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crew" ADD CONSTRAINT "Crew_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meetup" ADD CONSTRAINT "Meetup_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meetup" ADD CONSTRAINT "Meetup_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meetup" ADD CONSTRAINT "Meetup_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupAttendee" ADD CONSTRAINT "MeetupAttendee_meetupId_fkey" FOREIGN KEY ("meetupId") REFERENCES "Meetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupAttendee" ADD CONSTRAINT "MeetupAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupInvite" ADD CONSTRAINT "MeetupInvite_meetupId_fkey" FOREIGN KEY ("meetupId") REFERENCES "Meetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupInvite" ADD CONSTRAINT "MeetupInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupInvite" ADD CONSTRAINT "MeetupInvite_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_meetupId_fkey" FOREIGN KEY ("meetupId") REFERENCES "Meetup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollResponse" ADD CONSTRAINT "PollResponse_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollResponse" ADD CONSTRAINT "PollResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CheckConstraint (Q2 resolution — single-row bidirectional Crew)
-- Enforces canonical ordering of user pairs AND prevents self-crew.
ALTER TABLE "Crew" ADD CONSTRAINT "Crew_user_order_check" CHECK ("userAId" < "userBId");
