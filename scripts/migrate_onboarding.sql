-- Onboarding tracking fields
ALTER TABLE "Guild"
ADD COLUMN IF NOT EXISTS "onboardingSentAt" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "onboardingSkippedAt" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "onboardingChannelId" TEXT;