-- ============================================================
-- Discore Event System v3 Migration
-- Run each batch separately in Supabase SQL editor.
-- ============================================================

-- BATCH 1: Add new columns to Event table
-- ============================================================
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "teamSize" INTEGER;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "tagRoleIds" TEXT[] DEFAULT '{}';

-- BATCH 2: Migrate existing tagRoleId to tagRoleIds, then drop old column
-- ============================================================
UPDATE "Event" SET "tagRoleIds" = ARRAY["tagRoleId"] WHERE "tagRoleId" IS NOT NULL AND array_length("tagRoleIds", 1) IS NULL;
ALTER TABLE "Event" DROP COLUMN IF EXISTS "tagRoleId";

-- BATCH 3: Add sequential event number
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS event_number_seq START 1001;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "eventNumber" INTEGER DEFAULT nextval('event_number_seq');
DO $body$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Event_eventNumber_key'
  ) THEN
    ALTER TABLE "Event" ADD CONSTRAINT "Event_eventNumber_key" UNIQUE ("eventNumber");
  END IF;
END
$body$;
