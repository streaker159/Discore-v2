-- Add new enum values to SuggestionStatus
ALTER TYPE "SuggestionStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';
ALTER TYPE "SuggestionStatus" ADD VALUE IF NOT EXISTS 'PLANNED';
ALTER TYPE "SuggestionStatus" ADD VALUE IF NOT EXISTS 'IMPLEMENTED';
ALTER TYPE "SuggestionStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

-- Alter Suggestion table: add threadId, closesAt, dataDeleteAt, closedBy, closedAt
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "threadId" TEXT;
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "closesAt" TIMESTAMP(3);
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "dataDeleteAt" TIMESTAMP(3);
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "closedBy" TEXT;
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

-- Set initial dataDeleteAt for existing suggestions: 30 days from now max
UPDATE "Suggestion" SET "dataDeleteAt" = NOW() + INTERVAL '30 days' WHERE "dataDeleteAt" IS NULL;
UPDATE "Suggestion" SET "closesAt" = "expiresAt" WHERE "closesAt" IS NULL;

-- Create index on new date columns
CREATE INDEX IF NOT EXISTS "Suggestion_dataDeleteAt_idx" ON "Suggestion"("dataDeleteAt");
CREATE INDEX IF NOT EXISTS "Suggestion_closesAt_idx" ON "Suggestion"("closesAt");

-- Alter Guild table: add suggestion settings columns
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "suggestionDefaultDuration" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "suggestionShowVoters" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "suggestionRequireReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "suggestionAllowImages" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "suggestionCreateThreads" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "suggestionManagerRoleId" TEXT;
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "suggestionMaxPerUser" INTEGER NOT NULL DEFAULT 5;