-- Phase 0 of V1_IMPLEMENTATION_PLAN.md: data model foundation for the
-- Intent → SubCrew → Heatmap flow. Adds 7 new tables + 8 new enums.
-- All field choices trace to a numbered resolution in PRODUCT_VISION.md.

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE "WindowPreset" AS ENUM ('EARLY_MORNING', 'MORNING', 'BRUNCH', 'AFTERNOON', 'EVENING', 'NIGHT');

CREATE TYPE "IntentState" AS ENUM ('INTERESTED', 'COMMITTED');

CREATE TYPE "SubCrewJoinMode" AS ENUM ('SEED', 'JOINED_VIA_IM_IN');

CREATE TYPE "HeatmapContributionType" AS ENUM ('INTEREST', 'PRESENCE');

CREATE TYPE "HeatmapGranularityMode" AS ENUM ('BLOCK', 'DYNAMIC_CELL', 'HIDDEN');

CREATE TYPE "HeatmapIdentityMode" AS ENUM ('KNOWN', 'ANONYMOUS', 'CREW_ANCHORED');

CREATE TYPE "HeatmapSocialScope" AS ENUM ('FULL_CREW', 'SUBGROUP_ONLY', 'NOBODY');

CREATE TYPE "NotificationPreferenceTrigger" AS ENUM ('DAILY_PROMPT', 'PER_MEMBER_INTENT', 'GROUP_FORMATION');

-- ============================================================
-- TABLES
-- ============================================================

-- Topic — curated taxonomy for free-text bucketing (R1, R9, R15)
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "keywords" TEXT[],
    "placesCategories" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Topic_slug_key" ON "Topic"("slug");

-- Intent — lightweight signal of "what I want to do" (R3, R6, R12, R16, R22)
CREATE TABLE "Intent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "windowPreset" "WindowPreset" NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "dayOffset" INTEGER NOT NULL DEFAULT 0,
    "state" "IntentState" NOT NULL DEFAULT 'INTERESTED',
    "cityArea" TEXT,
    "venueId" TEXT,
    "rawText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Intent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Intent_userId_state_expiresAt_idx" ON "Intent"("userId", "state", "expiresAt");
CREATE INDEX "Intent_topicId_windowPreset_dayOffset_expiresAt_idx" ON "Intent"("topicId", "windowPreset", "dayOffset", "expiresAt");
CREATE INDEX "Intent_cityArea_idx" ON "Intent"("cityArea");

ALTER TABLE "Intent" ADD CONSTRAINT "Intent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Intent" ADD CONSTRAINT "Intent_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Intent" ADD CONSTRAINT "Intent_venueId_fkey"
    FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SubCrew — auto-formed group from ≥2 matching Intents (R2, R17, R21)
CREATE TABLE "SubCrew" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "windowPreset" "WindowPreset" NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "cityArea" TEXT,
    "venueId" TEXT,
    "meetupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubCrew_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubCrew_meetupId_key" ON "SubCrew"("meetupId");
CREATE INDEX "SubCrew_topicId_windowPreset_startAt_idx" ON "SubCrew"("topicId", "windowPreset", "startAt");

ALTER TABLE "SubCrew" ADD CONSTRAINT "SubCrew_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubCrew" ADD CONSTRAINT "SubCrew_meetupId_fkey"
    FOREIGN KEY ("meetupId") REFERENCES "Meetup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SubCrewMember — membership row, with joinMode for seed-vs-join attribution
CREATE TABLE "SubCrewMember" (
    "id" TEXT NOT NULL,
    "subCrewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "intentId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinMode" "SubCrewJoinMode" NOT NULL,

    CONSTRAINT "SubCrewMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubCrewMember_subCrewId_userId_key" ON "SubCrewMember"("subCrewId", "userId");
CREATE INDEX "SubCrewMember_userId_idx" ON "SubCrewMember"("userId");

ALTER TABLE "SubCrewMember" ADD CONSTRAINT "SubCrewMember_subCrewId_fkey"
    FOREIGN KEY ("subCrewId") REFERENCES "SubCrew"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubCrewMember" ADD CONSTRAINT "SubCrewMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubCrewMember" ADD CONSTRAINT "SubCrewMember_intentId_fkey"
    FOREIGN KEY ("intentId") REFERENCES "Intent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CrewRelationshipSetting — per-relationship privacy overrides (R4, R20)
CREATE TABLE "CrewRelationshipSetting" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "granularityMode" "HeatmapGranularityMode" NOT NULL DEFAULT 'BLOCK',
    "identityMode" "HeatmapIdentityMode" NOT NULL DEFAULT 'KNOWN',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrewRelationshipSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrewRelationshipSetting_viewerId_targetId_key" ON "CrewRelationshipSetting"("viewerId", "targetId");
CREATE INDEX "CrewRelationshipSetting_targetId_idx" ON "CrewRelationshipSetting"("targetId");

ALTER TABLE "CrewRelationshipSetting" ADD CONSTRAINT "CrewRelationshipSetting_viewerId_fkey"
    FOREIGN KEY ("viewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrewRelationshipSetting" ADD CONSTRAINT "CrewRelationshipSetting_targetId_fkey"
    FOREIGN KEY ("targetId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- HeatmapContribution — derived from Intents (INTEREST) + CheckIns (PRESENCE) (R13)
CREATE TABLE "HeatmapContribution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "HeatmapContributionType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "cellLat" DOUBLE PRECISION NOT NULL,
    "cellLng" DOUBLE PRECISION NOT NULL,
    "cellPrecision" "HeatmapGranularityMode" NOT NULL,
    "topicId" TEXT,
    "windowPreset" "WindowPreset",
    "socialScope" "HeatmapSocialScope" NOT NULL,
    "identityMode" "HeatmapIdentityMode" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeatmapContribution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HeatmapContribution_type_expiresAt_topicId_idx" ON "HeatmapContribution"("type", "expiresAt", "topicId");
CREATE INDEX "HeatmapContribution_userId_expiresAt_idx" ON "HeatmapContribution"("userId", "expiresAt");

ALTER TABLE "HeatmapContribution" ADD CONSTRAINT "HeatmapContribution_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NotificationPreference — per-trigger opt-ins (R8)
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trigger" "NotificationPreferenceTrigger" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "schedule" TEXT,
    "perMemberTargets" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPreference_userId_trigger_key" ON "NotificationPreference"("userId", "trigger");

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
