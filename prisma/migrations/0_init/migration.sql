-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('FREE', 'PRO', 'ELITE', 'LIFETIME');

-- CreateEnum
CREATE TYPE "PremiumMethod" AS ENUM ('STRIPE', 'CODE', 'MANUAL');

-- CreateEnum
CREATE TYPE "CodeType" AS ENUM ('LIFETIME', 'DISCOUNT', 'TRIAL');

-- CreateEnum
CREATE TYPE "BoardType" AS ENUM ('USER', 'ROLE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SignupStatus" AS ENUM ('OPEN', 'LOCKED', 'STARTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ACCEPTED', 'RESERVE', 'DECLINED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('UPCOMING', 'LIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('GOING', 'MAYBE', 'NOT_GOING');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED', 'EXPIRED', 'PENDING', 'DENIED', 'DELETED');

-- CreateEnum
CREATE TYPE "VoteType" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "MatchResult" AS ENUM ('VICTORY', 'DEFEAT', 'DRAW');

-- CreateEnum
CREATE TYPE "LeaderboardType" AS ENUM ('TOP_PLAYERS_KD', 'TOP_PLAYERS_WINS', 'TOP_PLAYERS_ELO', 'TOP_ALLIANCES_ELO', 'TOP_ALLIANCES_WINS', 'TOP_ALLIANCES_RANK');

-- CreateEnum
CREATE TYPE "AvaStatus" AS ENUM ('PENDING', 'ACTIVE', 'RESULT_SUBMITTED', 'AWAITING_CONFIRMATION', 'VERIFIED', 'DISPUTED', 'VOIDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ModActionType" AS ENUM ('WARN', 'MUTE', 'TIMEOUT', 'BAN', 'PROBATION', 'TEMP_BAN');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'APPEALED', 'UPHELD');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'NONE', 'OPEN', 'REDUCED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('EXACT', 'CONTAINS', 'STARTS_WITH', 'REGEX');

-- CreateEnum
CREATE TYPE "AutoModAction" AS ENUM ('DELETE', 'REVIEW', 'MUTE', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('MEDIAWIKI_API', 'HTML_FALLBACK', 'MANUAL');

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "defaultGame" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "allianceName" TEXT,
    "allianceLogo" TEXT,
    "themeColor" TEXT NOT NULL DEFAULT '#1a7a9e',
    "scoreboardChan" TEXT,
    "adminLogChan" TEXT,
    "premiumNoticeChan" TEXT,
    "battleSignupChan" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "customFooter" TEXT,
    "scoreboardManagerRoleId" TEXT,
    "disAdminRoleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "allianceCode" TEXT,
    "avaAlertRoleId" TEXT,
    "avaCategoryId" TEXT,
    "avaChatChannelId" TEXT,
    "avaRequestChannelId" TEXT,
    "discoreAppealRoleId" TEXT,
    "discoreAvaRoleId" TEXT,
    "discoreManagerRoleId" TEXT,
    "discoreMutedRoleId" TEXT,
    "logChannelId" TEXT,
    "maintainRolesAndChannels" BOOLEAN NOT NULL DEFAULT true,
    "moderationLogChannelId" TEXT,
    "appealChannelId" TEXT,
    "appealCategoryId" TEXT,
    "eventChannelId" TEXT,
    "suggestionChannelId" TEXT,
    "supportChannelId" TEXT,
    "adminReportsChannelId" TEXT,
    "publicSuggestionVoters" BOOLEAN NOT NULL DEFAULT false,
    "onboardingSentAt" TIMESTAMPTZ(6),
    "onboardingCompletedAt" TIMESTAMPTZ(6),
    "onboardingSkippedAt" TIMESTAMPTZ(6),
    "onboardingChannelId" TEXT,
    "announcementChannelId" TEXT,
    "aiWelcomeChannelId" TEXT,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildPremium" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "tier" "Tier" NOT NULL DEFAULT 'FREE',
    "method" "PremiumMethod" NOT NULL,
    "stripeSubId" TEXT,
    "code" TEXT,
    "expiresAt" TIMESTAMP(3),
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "entitlementId" TEXT,
    "monthlyAiAllowance" INTEGER NOT NULL DEFAULT 0,
    "monthlyAiUsed" INTEGER NOT NULL DEFAULT 0,
    "monthlyAiPeriodStart" TIMESTAMPTZ(6),
    "monthlyAiPeriodEnd" TIMESTAMPTZ(6),
    "extraAiCredits" INTEGER NOT NULL DEFAULT 0,
    "serverDailyAiLimit" INTEGER NOT NULL DEFAULT 0,
    "perUserDailyAiLimit" INTEGER NOT NULL DEFAULT 0,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 0,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "purchasedAt" TIMESTAMPTZ(6),
    "lastRenewalAt" TIMESTAMPTZ(6),
    "renewalCount" INTEGER NOT NULL DEFAULT 0,
    "graceNotifiedAt" TIMESTAMPTZ(6),
    "aiTranslationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiWelcomeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiWelcomeInstructions" TEXT,

    CONSTRAINT "GuildPremium_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedEntitlement" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "creditsGranted" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PremiumCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CodeType" NOT NULL,
    "tier" "Tier" NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "discountPct" INTEGER,
    "trialDays" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PremiumCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scoreboard" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metric" TEXT NOT NULL DEFAULT 'WIN_LOSS',
    "type" "BoardType" NOT NULL DEFAULT 'USER',
    "channelId" TEXT,
    "messageId" TEXT,
    "theme" TEXT NOT NULL DEFAULT 'default',
    "liveTitle" TEXT,
    "description" TEXT,
    "season" INTEGER,
    "lastLeaderId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publicId" TEXT,
    "repairStatus" TEXT NOT NULL DEFAULT 'OK',
    "roleImageUrl" TEXT,
    "lastUpdatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "archivedBy" TEXT,
    "archiveNote" TEXT,
    "hasCategories" BOOLEAN NOT NULL DEFAULT false,
    "brandingImageUrl" TEXT,
    "friendlyArchiveId" TEXT,
    "restoredFromArchiveId" TEXT,

    CONSTRAINT "Scoreboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreboardScoreType" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "scoreboardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreboardScoreType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreboardEntryTypeStats" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "scoreboardId" TEXT NOT NULL,
    "scoreboardEntryId" TEXT NOT NULL,
    "scoreTypeId" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreboardEntryTypeStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreboardEntry" (
    "id" TEXT NOT NULL,
    "scoreboardId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetType" "BoardType" NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "winStreak" INTEGER NOT NULL DEFAULT 0,
    "lossStreak" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "liveChannelId" TEXT,
    "liveMessageId" TEXT,
    "sourceScoreboardId" TEXT,
    "sourceScoreboardName" TEXT,
    "targetName" TEXT,

    CONSTRAINT "ScoreboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreboardAction" (
    "id" TEXT NOT NULL,
    "scoreboardId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreboardAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreboardMergeHistory" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "targetScoreboardId" TEXT NOT NULL,
    "sourceScoreboardId" TEXT NOT NULL,
    "sourceScoreboardName" TEXT NOT NULL,
    "mergeOption" TEXT NOT NULL,
    "mergedBy" TEXT NOT NULL,
    "entriesMerged" INTEGER NOT NULL DEFAULT 0,
    "sourceAction" TEXT NOT NULL,
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreboardMergeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "doctrine" TEXT,
    "category" TEXT,
    "description" TEXT,
    "stats" JSONB,
    "iconUrl" TEXT,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "description" TEXT,
    "stats" JSONB,
    "iconUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "description" TEXT,
    "iconUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Research" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "description" TEXT,
    "stats" JSONB,
    "iconUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattleSignup" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "threadId" TEXT,
    "captainId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "mode" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "teamSize" INTEGER NOT NULL,
    "tagOnCreate" TEXT,
    "tagOnStart" TEXT,
    "status" "SignupStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publicId" TEXT,
    "cleanupAfter" TIMESTAMP(3),

    CONSTRAINT "BattleSignup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignupParticipant" (
    "id" TEXT NOT NULL,
    "signupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ParticipantStatus" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "tagOnCreate" BOOLEAN NOT NULL DEFAULT false,
    "tagOnStart" BOOLEAN NOT NULL DEFAULT false,
    "status" "EventStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publicId" TEXT,
    "eventType" TEXT NOT NULL DEFAULT 'EVENT',
    "cleanupAfter" TIMESTAMP(3),
    "game" TEXT,
    "customTypeName" TEXT,
    "timezoneUsed" TEXT,
    "reminderBeforeMinutes" INTEGER,
    "teamSize" INTEGER,
    "color" TEXT,
    "tagRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "eventNumber" INTEGER,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRsvp" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RsvpStatus" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRsvp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventNotificationLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "roleId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReminder" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'OPEN',
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicId" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMPTZ(6),
    "deniedBy" TEXT,
    "deniedAt" TIMESTAMPTZ(6),
    "adminNote" TEXT,
    "showVoters" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionVote" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "VoteType" NOT NULL,

    CONSTRAINT "SuggestionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerProfile" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "gameUsername" TEXT,
    "game" TEXT DEFAULT 'supremacy-ww3',
    "currentAlliance" TEXT,
    "currentAllianceTag" TEXT,
    "currentAllianceJoinedAt" TIMESTAMP(3),
    "inGameRank" TEXT,
    "level" INTEGER,
    "xpCurrent" INTEGER,
    "xpMax" INTEGER,
    "kdRatio" DOUBLE PRECISION,
    "unitsKilled" INTEGER,
    "unitsLost" INTEGER,
    "provincesTaken" INTEGER,
    "provincesLost" INTEGER,
    "gamesJoined" INTEGER,
    "soloVictories" INTEGER,
    "coalitionVictories" INTEGER,
    "overallScore" INTEGER,
    "overallRank" INTEGER,
    "economicRank" INTEGER,
    "militaryRank" INTEGER,
    "memberSince" TEXT,
    "lastOnline" TEXT,
    "playedOnPC" INTEGER,
    "playedOnMobile" INTEGER,
    "role" TEXT,
    "playstyle" TEXT,
    "discoreElo" INTEGER NOT NULL DEFAULT 1000,
    "avaWins" INTEGER NOT NULL DEFAULT 0,
    "avaLosses" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION,
    "performanceScore" INTEGER,
    "combatStyle" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "profileImageUrl" TEXT,
    "screenshotUrls" TEXT[],
    "lastUpdateAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceHistory" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "allianceName" TEXT NOT NULL,
    "allianceTag" TEXT,
    "game" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "AllianceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileUpdateLog" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileUpdateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "description" TEXT,
    "discordInvite" TEXT,
    "country" TEXT,
    "tags" TEXT[],
    "ownerId" TEXT,
    "managerRoleId" TEXT,
    "officialId" TEXT,
    "officialRank" INTEGER,
    "officialElo" INTEGER,
    "officialWins" INTEGER,
    "officialLosses" INTEGER,
    "officialMembers" INTEGER,
    "officialMaxMembers" INTEGER,
    "founded" TEXT,
    "discoreRank" INTEGER,
    "discoreElo" INTEGER NOT NULL DEFAULT 1000,
    "discoreWins" INTEGER NOT NULL DEFAULT 0,
    "discoreLosses" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION,
    "seasonRecord" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "screenshotUrls" TEXT[],
    "lastUpdateAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllianceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceRecentMatch" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "opponentName" TEXT NOT NULL,
    "opponentTag" TEXT,
    "opponentLogo" TEXT,
    "result" "MatchResult" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllianceRecentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceUpdateLog" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllianceUpdateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardChannel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" "LeaderboardType" NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "scheduleHour" INTEGER NOT NULL DEFAULT 9,
    "scheduleMinute" INTEGER NOT NULL DEFAULT 0,
    "frequencyHours" INTEGER NOT NULL DEFAULT 24,
    "lastPostedAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCredits" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCredits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchWatcher" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "mode" TEXT,
    "maxPlayers" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchWatcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattleReminder" (
    "id" TEXT NOT NULL,
    "signupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BattleReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserActivity" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "lastReactionAt" TIMESTAMP(3),
    "lastInteractionAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "activeDayStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActiveDate" TIMESTAMP(3),
    "mostActiveChannelId" TEXT,
    "mostUsedReaction" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationCase" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "actionType" "ModActionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "status" "CaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "appealStatus" "AppealStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "staffNote" TEXT,

    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appealText" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'OPEN',
    "channelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "outcome" TEXT,
    "staffNotes" TEXT,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRoleSnapshot" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "roleIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleanupAfter" TIMESTAMP(3),

    CONSTRAINT "UserRoleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoModRule" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "matchType" "MatchType" NOT NULL DEFAULT 'CONTAINS',
    "action" "AutoModAction" NOT NULL DEFAULT 'REVIEW',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoModRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoModCase" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "ruleId" TEXT NOT NULL,
    "messageExcerpt" TEXT NOT NULL,
    "actionTaken" "AutoModAction" NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewMessageId" TEXT,
    "cleanupAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "AutoModCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRoleScore" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "scoreboardId" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRoleScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameDataSource" (
    "id" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "gameKey" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "targetPage" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL DEFAULT 'MEDIAWIKI_API',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameDataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameUnit" (
    "id" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "gameKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "sourcePage" TEXT,
    "sourceLastSyncedAt" TIMESTAMP(3),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameUnitVariant" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "doctrine" TEXT,
    "generation" INTEGER,
    "tier" INTEGER,
    "level" INTEGER,
    "description" TEXT,
    "hitPoints" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "range" DOUBLE PRECISION,
    "sightRange" DOUBLE PRECISION,
    "radarRange" DOUBLE PRECISION,
    "stealthDetectionRange" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameUnitVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameUnitFeature" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "variantId" TEXT,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "GameUnitFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameUnitCost" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "supplies" INTEGER,
    "components" INTEGER,
    "manpower" INTEGER,
    "electronics" INTEGER,
    "fuel" INTEGER,
    "cash" INTEGER,
    "rareMaterials" INTEGER,
    "timeSeconds" INTEGER,
    "rawTimeText" TEXT,

    CONSTRAINT "GameUnitCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameUnitUpkeep" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "supplies" INTEGER,
    "components" INTEGER,
    "manpower" INTEGER,
    "electronics" INTEGER,
    "fuel" INTEGER,
    "cash" INTEGER,
    "rareMaterials" INTEGER,

    CONSTRAINT "GameUnitUpkeep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameUnitTerrainStat" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "terrain" TEXT NOT NULL,
    "hitPoints" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "attackModifier" DOUBLE PRECISION,
    "defenseModifier" DOUBLE PRECISION,
    "sightRange" DOUBLE PRECISION,

    CONSTRAINT "GameUnitTerrainStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameUnitImportDraft" (
    "id" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "gameKey" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "sourcePage" TEXT,
    "rawExtract" TEXT,
    "parsedJson" JSONB,
    "confidence" TEXT NOT NULL DEFAULT 'LOW',
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameUnitImportDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationCaseTranscript" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "caseId" TEXT,
    "appealId" TEXT,
    "caseNumber" TEXT,
    "appealNumber" TEXT,
    "ticketChannelId" TEXT,
    "ticketChannelName" TEXT,
    "userId" TEXT,
    "handledById" TEXT,
    "outcome" TEXT,
    "openedAt" TIMESTAMPTZ(6),
    "closedAt" TIMESTAMPTZ(6),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "transcriptJson" TEXT,
    "transcriptText" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationCaseTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotCommandUsage" (
    "id" TEXT NOT NULL,
    "guildId" TEXT,
    "userId" TEXT NOT NULL,
    "commandName" TEXT NOT NULL,
    "subcommand" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotCommandUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotAiUsage" (
    "id" TEXT NOT NULL,
    "guildId" TEXT,
    "userId" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestType" TEXT,

    CONSTRAINT "BotAiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotGuildInstallEvent" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "guildName" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT,
    "eventType" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotGuildInstallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotHourlyStatusReport" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "reportHour" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'success',
    "payloadJson" TEXT,

    CONSTRAINT "BotHourlyStatusReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafeVaultRound" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6),
    "crackedAt" TIMESTAMPTZ(6),
    "crackedByUserId" TEXT,
    "crackedByUserTag" TEXT,
    "crackedByDisplayName" TEXT,
    "crackedInGuildId" TEXT,
    "crackedInGuildName" TEXT,
    "selectedPrize" TEXT,
    "prizeStatus" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SafeVaultRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafeVaultAttempt" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userTag" TEXT,
    "displayName" TEXT,
    "guildId" TEXT NOT NULL,
    "guildName" TEXT,
    "guessedCode" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafeVaultAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafeVaultDailyLimit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "attemptsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SafeVaultDailyLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvaMatch" (
    "id" TEXT NOT NULL,
    "homeAllianceId" TEXT NOT NULL,
    "awayAllianceId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "status" "AvaStatus" NOT NULL DEFAULT 'PENDING',
    "winnerId" TEXT,
    "evidenceUrl" TEXT,
    "submittedBy" TEXT,
    "confirmedBy" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvaMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedRole" (
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'SCOREBOARD',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedRole_pkey" PRIMARY KEY ("guildId","roleId")
);

-- CreateTable
CREATE TABLE "TrackedRoleMember" (
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedRoleMember_pkey" PRIMARY KEY ("guildId","roleId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Guild_allianceCode_key" ON "Guild"("allianceCode");

-- CreateIndex
CREATE INDEX "Guild_id_idx" ON "Guild"("id");

-- CreateIndex
CREATE INDEX "Guild_allianceCode_idx" ON "Guild"("allianceCode");

-- CreateIndex
CREATE UNIQUE INDEX "GuildPremium_guildId_key" ON "GuildPremium"("guildId");

-- CreateIndex
CREATE INDEX "GuildPremium_guildId_idx" ON "GuildPremium"("guildId");

-- CreateIndex
CREATE INDEX "GuildPremium_expiresAt_idx" ON "GuildPremium"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedEntitlement_entitlementId_key" ON "ProcessedEntitlement"("entitlementId");

-- CreateIndex
CREATE UNIQUE INDEX "PremiumCode_code_key" ON "PremiumCode"("code");

-- CreateIndex
CREATE INDEX "PremiumCode_code_idx" ON "PremiumCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Scoreboard_publicId_key" ON "Scoreboard"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Scoreboard_friendlyArchiveId_key" ON "Scoreboard"("friendlyArchiveId");

-- CreateIndex
CREATE INDEX "Scoreboard_guildId_idx" ON "Scoreboard"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreboardScoreType_scoreboardId_normalizedName_key" ON "ScoreboardScoreType"("scoreboardId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreboardEntryTypeStats_entryId_typeId_key" ON "ScoreboardEntryTypeStats"("scoreboardEntryId", "scoreTypeId");

-- CreateIndex
CREATE INDEX "ScoreboardEntry_scoreboardId_idx" ON "ScoreboardEntry"("scoreboardId");

-- CreateIndex
CREATE INDEX "ScoreboardEntry_sourceScoreboardId_idx" ON "ScoreboardEntry"("sourceScoreboardId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreboardEntry_scoreboardId_targetId_key" ON "ScoreboardEntry"("scoreboardId", "targetId");

-- CreateIndex
CREATE INDEX "ScoreboardAction_scoreboardId_idx" ON "ScoreboardAction"("scoreboardId");

-- CreateIndex
CREATE INDEX "ScoreboardMergeHistory_guildId_idx" ON "ScoreboardMergeHistory"("guildId");

-- CreateIndex
CREATE INDEX "ScoreboardMergeHistory_targetScoreboardId_idx" ON "ScoreboardMergeHistory"("targetScoreboardId");

-- CreateIndex
CREATE INDEX "ScoreboardMergeHistory_sourceScoreboardId_idx" ON "ScoreboardMergeHistory"("sourceScoreboardId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

-- CreateIndex
CREATE INDEX "Game_slug_idx" ON "Game"("slug");

-- CreateIndex
CREATE INDEX "Unit_gameId_idx" ON "Unit"("gameId");

-- CreateIndex
CREATE INDEX "Building_gameId_idx" ON "Building"("gameId");

-- CreateIndex
CREATE INDEX "Resource_gameId_idx" ON "Resource"("gameId");

-- CreateIndex
CREATE INDEX "Research_gameId_idx" ON "Research"("gameId");

-- CreateIndex
CREATE INDEX "BattleSignup_guildId_idx" ON "BattleSignup"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "SignupParticipant_signupId_userId_key" ON "SignupParticipant"("signupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_publicId_key" ON "Event"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_eventNumber_key" ON "Event"("eventNumber");

-- CreateIndex
CREATE INDEX "Event_guildId_idx" ON "Event"("guildId");

-- CreateIndex
CREATE INDEX "Event_scheduledAt_idx" ON "Event"("scheduledAt");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX "Event_cleanupAfter_idx" ON "Event"("cleanupAfter");

-- CreateIndex
CREATE INDEX "EventRsvp_eventId_idx" ON "EventRsvp"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRsvp_eventId_userId_key" ON "EventRsvp"("eventId", "userId");

-- CreateIndex
CREATE INDEX "EventNotificationLog_eventId_idx" ON "EventNotificationLog"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventNotificationLog_eventId_notificationType_key" ON "EventNotificationLog"("eventId", "notificationType");

-- CreateIndex
CREATE INDEX "EventReminder_remindAt_idx" ON "EventReminder"("remindAt");

-- CreateIndex
CREATE INDEX "EventReminder_eventId_idx" ON "EventReminder"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventReminder_eventId_userId_key" ON "EventReminder"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Suggestion_publicId_key" ON "Suggestion"("publicId");

-- CreateIndex
CREATE INDEX "Suggestion_guildId_idx" ON "Suggestion"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "SuggestionVote_suggestionId_userId_key" ON "SuggestionVote"("suggestionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProfile_discordId_key" ON "PlayerProfile"("discordId");

-- CreateIndex
CREATE INDEX "PlayerProfile_discordId_idx" ON "PlayerProfile"("discordId");

-- CreateIndex
CREATE INDEX "AllianceHistory_playerId_idx" ON "AllianceHistory"("playerId");

-- CreateIndex
CREATE INDEX "ProfileUpdateLog_playerId_idx" ON "ProfileUpdateLog"("playerId");

-- CreateIndex
CREATE INDEX "AllianceProfile_game_idx" ON "AllianceProfile"("game");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceProfile_tag_game_key" ON "AllianceProfile"("tag", "game");

-- CreateIndex
CREATE INDEX "AllianceRecentMatch_allianceId_idx" ON "AllianceRecentMatch"("allianceId");

-- CreateIndex
CREATE INDEX "AllianceUpdateLog_allianceId_idx" ON "AllianceUpdateLog"("allianceId");

-- CreateIndex
CREATE INDEX "LeaderboardChannel_guildId_idx" ON "LeaderboardChannel"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardChannel_guildId_type_key" ON "LeaderboardChannel"("guildId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardSettings_guildId_key" ON "LeaderboardSettings"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "AiCredits_guildId_key" ON "AiCredits"("guildId");

-- CreateIndex
CREATE INDEX "AiUsageLog_guildId_idx" ON "AiUsageLog"("guildId");

-- CreateIndex
CREATE INDEX "AuditLog_guildId_idx" ON "AuditLog"("guildId");

-- CreateIndex
CREATE INDEX "MatchWatcher_guildId_idx" ON "MatchWatcher"("guildId");

-- CreateIndex
CREATE INDEX "MatchWatcher_game_isActive_idx" ON "MatchWatcher"("game", "isActive");

-- CreateIndex
CREATE INDEX "BattleReminder_remindAt_sent_idx" ON "BattleReminder"("remindAt", "sent");

-- CreateIndex
CREATE UNIQUE INDEX "BattleReminder_signupId_userId_key" ON "BattleReminder"("signupId", "userId");

-- CreateIndex
CREATE INDEX "UserActivity_guildId_userId_idx" ON "UserActivity"("guildId", "userId");

-- CreateIndex
CREATE INDEX "UserActivity_lastActiveAt_idx" ON "UserActivity"("lastActiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserActivity_guildId_userId_key" ON "UserActivity"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationCase_publicId_key" ON "ModerationCase"("publicId");

-- CreateIndex
CREATE INDEX "ModerationCase_guildId_idx" ON "ModerationCase"("guildId");

-- CreateIndex
CREATE INDEX "ModerationCase_userId_idx" ON "ModerationCase"("userId");

-- CreateIndex
CREATE INDEX "ModerationCase_publicId_idx" ON "ModerationCase"("publicId");

-- CreateIndex
CREATE INDEX "ModerationCase_status_idx" ON "ModerationCase"("status");

-- CreateIndex
CREATE INDEX "ModerationCase_expiresAt_idx" ON "ModerationCase"("expiresAt");

-- CreateIndex
CREATE INDEX "ModerationCase_appealStatus_idx" ON "ModerationCase"("appealStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Appeal_publicId_key" ON "Appeal"("publicId");

-- CreateIndex
CREATE INDEX "Appeal_caseId_idx" ON "Appeal"("caseId");

-- CreateIndex
CREATE INDEX "Appeal_guildId_idx" ON "Appeal"("guildId");

-- CreateIndex
CREATE INDEX "Appeal_publicId_idx" ON "Appeal"("publicId");

-- CreateIndex
CREATE INDEX "Appeal_status_idx" ON "Appeal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UserRoleSnapshot_caseId_key" ON "UserRoleSnapshot"("caseId");

-- CreateIndex
CREATE INDEX "UserRoleSnapshot_caseId_idx" ON "UserRoleSnapshot"("caseId");

-- CreateIndex
CREATE INDEX "UserRoleSnapshot_cleanupAfter_idx" ON "UserRoleSnapshot"("cleanupAfter");

-- CreateIndex
CREATE INDEX "AutoModRule_guildId_idx" ON "AutoModRule"("guildId");

-- CreateIndex
CREATE INDEX "AutoModRule_enabled_idx" ON "AutoModRule"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AutoModCase_publicId_key" ON "AutoModCase"("publicId");

-- CreateIndex
CREATE INDEX "AutoModCase_guildId_idx" ON "AutoModCase"("guildId");

-- CreateIndex
CREATE INDEX "AutoModCase_status_idx" ON "AutoModCase"("status");

-- CreateIndex
CREATE INDEX "AutoModCase_cleanupAfter_idx" ON "AutoModCase"("cleanupAfter");

-- CreateIndex
CREATE INDEX "AiUsage_guildId_month_idx" ON "AiUsage"("guildId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsage_guildId_month_key" ON "AiUsage"("guildId", "month");

-- CreateIndex
CREATE INDEX "UserRoleScore_guildId_userId_idx" ON "UserRoleScore"("guildId", "userId");

-- CreateIndex
CREATE INDEX "UserRoleScore_roleId_idx" ON "UserRoleScore"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRoleScore_scoreboardId_roleId_userId_key" ON "UserRoleScore"("scoreboardId", "roleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameDataSource_gameKey_key" ON "GameDataSource"("gameKey");

-- CreateIndex
CREATE INDEX "GameUnit_game_category_idx" ON "GameUnit"("game", "category");

-- CreateIndex
CREATE INDEX "GameUnit_name_idx" ON "GameUnit"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GameUnit_gameKey_slug_key" ON "GameUnit"("gameKey", "slug");

-- CreateIndex
CREATE INDEX "GameUnitVariant_unitId_idx" ON "GameUnitVariant"("unitId");

-- CreateIndex
CREATE INDEX "GameUnitFeature_unitId_idx" ON "GameUnitFeature"("unitId");

-- CreateIndex
CREATE INDEX "GameUnitCost_variantId_idx" ON "GameUnitCost"("variantId");

-- CreateIndex
CREATE INDEX "GameUnitUpkeep_variantId_idx" ON "GameUnitUpkeep"("variantId");

-- CreateIndex
CREATE INDEX "GameUnitTerrainStat_variantId_idx" ON "GameUnitTerrainStat"("variantId");

-- CreateIndex
CREATE INDEX "GameUnitImportDraft_gameKey_status_idx" ON "GameUnitImportDraft"("gameKey", "status");

-- CreateIndex
CREATE INDEX "GameUnitImportDraft_status_idx" ON "GameUnitImportDraft"("status");

-- CreateIndex
CREATE INDEX "ModerationCaseTranscript_caseId_idx" ON "ModerationCaseTranscript"("caseId");

-- CreateIndex
CREATE INDEX "ModerationCaseTranscript_appealNumber_idx" ON "ModerationCaseTranscript"("appealNumber");

-- CreateIndex
CREATE INDEX "ModerationCaseTranscript_guildId_idx" ON "ModerationCaseTranscript"("guildId");

-- CreateIndex
CREATE INDEX "ModerationCaseTranscript_createdAt_idx" ON "ModerationCaseTranscript"("createdAt");

-- CreateIndex
CREATE INDEX "BotCommandUsage_createdAt_idx" ON "BotCommandUsage"("createdAt");

-- CreateIndex
CREATE INDEX "BotCommandUsage_guildId_idx" ON "BotCommandUsage"("guildId");

-- CreateIndex
CREATE INDEX "BotCommandUsage_commandName_idx" ON "BotCommandUsage"("commandName");

-- CreateIndex
CREATE INDEX "BotAiUsage_createdAt_idx" ON "BotAiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "BotAiUsage_guildId_idx" ON "BotAiUsage"("guildId");

-- CreateIndex
CREATE INDEX "BotGuildInstallEvent_guildId_idx" ON "BotGuildInstallEvent"("guildId");

-- CreateIndex
CREATE INDEX "BotGuildInstallEvent_eventType_createdAt_idx" ON "BotGuildInstallEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "SafeVaultRound_status_idx" ON "SafeVaultRound"("status");

-- CreateIndex
CREATE INDEX "SafeVaultRound_generatedAt_idx" ON "SafeVaultRound"("generatedAt");

-- CreateIndex
CREATE INDEX "SafeVaultRound_crackedByUserId_idx" ON "SafeVaultRound"("crackedByUserId");

-- CreateIndex
CREATE INDEX "SafeVaultAttempt_roundId_idx" ON "SafeVaultAttempt"("roundId");

-- CreateIndex
CREATE INDEX "SafeVaultAttempt_userId_idx" ON "SafeVaultAttempt"("userId");

-- CreateIndex
CREATE INDEX "SafeVaultAttempt_guildId_idx" ON "SafeVaultAttempt"("guildId");

-- CreateIndex
CREATE INDEX "SafeVaultAttempt_createdAt_idx" ON "SafeVaultAttempt"("createdAt");

-- CreateIndex
CREATE INDEX "SafeVaultDailyLimit_dateKey_idx" ON "SafeVaultDailyLimit"("dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "SafeVaultDailyLimit_userId_dateKey_key" ON "SafeVaultDailyLimit"("userId", "dateKey");

-- CreateIndex
CREATE INDEX "AvaMatch_homeAllianceId_awayAllianceId_idx" ON "AvaMatch"("homeAllianceId", "awayAllianceId");

-- CreateIndex
CREATE INDEX "TrackedRoleMember_guild_role_idx" ON "TrackedRoleMember"("guildId", "roleId");

-- CreateIndex
CREATE INDEX "TrackedRoleMember_guild_user_idx" ON "TrackedRoleMember"("guildId", "userId");

-- AddForeignKey
ALTER TABLE "GuildPremium" ADD CONSTRAINT "GuildPremium_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scoreboard" ADD CONSTRAINT "Scoreboard_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreboardEntry" ADD CONSTRAINT "ScoreboardEntry_scoreboardId_fkey" FOREIGN KEY ("scoreboardId") REFERENCES "Scoreboard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreboardAction" ADD CONSTRAINT "ScoreboardAction_scoreboardId_fkey" FOREIGN KEY ("scoreboardId") REFERENCES "Scoreboard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreboardMergeHistory" ADD CONSTRAINT "ScoreboardMergeHistory_targetScoreboardId_fkey" FOREIGN KEY ("targetScoreboardId") REFERENCES "Scoreboard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Research" ADD CONSTRAINT "Research_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleSignup" ADD CONSTRAINT "BattleSignup_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignupParticipant" ADD CONSTRAINT "SignupParticipant_signupId_fkey" FOREIGN KEY ("signupId") REFERENCES "BattleSignup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventNotificationLog" ADD CONSTRAINT "EventNotificationLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReminder" ADD CONSTRAINT "EventReminder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionVote" ADD CONSTRAINT "SuggestionVote_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceHistory" ADD CONSTRAINT "AllianceHistory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileUpdateLog" ADD CONSTRAINT "ProfileUpdateLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceRecentMatch" ADD CONSTRAINT "AllianceRecentMatch_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "AllianceProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceUpdateLog" ADD CONSTRAINT "AllianceUpdateLog_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "AllianceProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActivity" ADD CONSTRAINT "UserActivity_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleSnapshot" ADD CONSTRAINT "UserRoleSnapshot_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoModRule" ADD CONSTRAINT "AutoModRule_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoModCase" ADD CONSTRAINT "AutoModCase_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoModCase" ADD CONSTRAINT "AutoModCase_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutoModRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleScore" ADD CONSTRAINT "UserRoleScore_scoreboardId_fkey" FOREIGN KEY ("scoreboardId") REFERENCES "Scoreboard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameUnitVariant" ADD CONSTRAINT "GameUnitVariant_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "GameUnit"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "GameUnitFeature" ADD CONSTRAINT "GameUnitFeature_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "GameUnit"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "GameUnitCost" ADD CONSTRAINT "GameUnitCost_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "GameUnitVariant"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "GameUnitUpkeep" ADD CONSTRAINT "GameUnitUpkeep_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "GameUnitVariant"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "GameUnitTerrainStat" ADD CONSTRAINT "GameUnitTerrainStat_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "GameUnitVariant"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SafeVaultAttempt" ADD CONSTRAINT "SafeVaultAttempt_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "SafeVaultRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaMatch" ADD CONSTRAINT "AvaMatch_awayAllianceId_fkey" FOREIGN KEY ("awayAllianceId") REFERENCES "AllianceProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaMatch" ADD CONSTRAINT "AvaMatch_homeAllianceId_fkey" FOREIGN KEY ("homeAllianceId") REFERENCES "AllianceProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

