-- Suggestion V3 Migration: per-suggestion showVoters + category enum
ALTER TABLE "Suggestion"
ADD COLUMN IF NOT EXISTS "showVoters" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'GENERAL';