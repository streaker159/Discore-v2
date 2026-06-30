-- AI Features V1: Translation and Welcome toggles + welcome channel
ALTER TABLE "GuildPremium"
ADD COLUMN IF NOT EXISTS "aiTranslationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "aiWelcomeEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Guild"
ADD COLUMN IF NOT EXISTS "aiWelcomeChannelId" TEXT;