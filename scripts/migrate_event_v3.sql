-- ============================================================
-- Discore Event System v3 Migration
-- Run each batch separately in Supabase SQL editor.
-- ============================================================

-- BATCH 1: Add new columns to Event table
-- ============================================================
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "teamSize" INTEGER;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "tagRoleIds" TEXT[] DEFAULT '{}';

-- BATCH 2: Migrate existing tagRoleId → tagRoleIds, then drop old column
-- ============================================================
UPDATE "Event" SET "tagRoleIds" = ARRAY["tagRoleId"] WHERE "tagRoleId" IS NOT NULL AND array_length("tagRoleIds", 1) IS NULL;
ALTER TABLE "Event" DROP COLUMN IF EXISTS "tagRoleId";

-- BATCH 3: Add sequential event number
-- ============================================================
