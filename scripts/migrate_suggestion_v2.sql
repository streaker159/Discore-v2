-- Suggestion V2 Migration
-- Adds SUG-xxx public IDs, title, admin tracking, single-vote, public voters
-- Required: add publicSuggestionVoters to Guild

ALTER TABLE "Suggestion"
ADD COLUMN IF NOT EXISTS "publicId" TEXT,
ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS "approvedBy" TEXT,
ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "deniedBy" TEXT,
ADD COLUMN IF NOT EXISTS "deniedAt" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "adminNote" TEXT;

-- Unique index on publicId
CREATE UNIQUE INDEX IF NOT EXISTS "Suggestion_publicId_key" ON "Suggestion" ("publicId");

ALTER TABLE "Guild"
ADD COLUMN IF NOT EXISTS "publicSuggestionVoters" BOOLEAN NOT NULL DEFAULT false;