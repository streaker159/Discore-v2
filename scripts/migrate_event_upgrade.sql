-- ══════════════════════════════════════════════════════════════════════════
-- EVENT SYSTEM UPGRADE MIGRATION
-- Run in TWO batches in Supabase SQL Editor (commit Batch 1 before Batch 2).
-- ══════════════════════════════════════════════════════════════════════════

-- ── BATCH 1: Enum values (must commit before using new values) ────────────
-- Run this block first, then run Batch 2 in a separate query.

ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- ══════════════════════════════════════════════════════════════════════════
-- ── BATCH 2: Column changes + new tables ─────────────────────────────────
-- Run AFTER Batch 1 has been committed.
-- ══════════════════════════════════════════════════════════════════════════

-- Step 1: Add tagRoleId and populate from existing string tagOnCreate/tagOnStart
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "tagRoleId" TEXT;

UPDATE "Event"
SET "tagRoleId" = COALESCE(
  NULLIF("tagOnCreate", ''),
  NULLIF("tagOnStart", '')
)
WHERE "tagRoleId" IS NULL;

-- Step 2: Convert tagOnCreate from role-ID string → boolean
ALTER TABLE "Event" ALTER COLUMN "tagOnCreate" DROP DEFAULT;
ALTER TABLE "Event"
  ALTER COLUMN "tagOnCreate" TYPE BOOLEAN
  USING (CASE WHEN "tagOnCreate" IS NOT NULL AND "tagOnCreate" != '' THEN true ELSE false END);
ALTER TABLE "Event" ALTER COLUMN "tagOnCreate" SET DEFAULT false;
ALTER TABLE "Event" ALTER COLUMN "tagOnCreate" SET NOT NULL;

-- Step 3: Convert tagOnStart from role-ID string → boolean
ALTER TABLE "Event" ALTER COLUMN "tagOnStart" DROP DEFAULT;
ALTER TABLE "Event"
  ALTER COLUMN "tagOnStart" TYPE BOOLEAN
  USING (CASE WHEN "tagOnStart" IS NOT NULL AND "tagOnStart" != '' THEN true ELSE false END);
ALTER TABLE "Event" ALTER COLUMN "tagOnStart" SET DEFAULT false;
ALTER TABLE "Event" ALTER COLUMN "tagOnStart" SET NOT NULL;

-- Step 4: Drop reminderSent (replaced by EventNotificationLog)
ALTER TABLE "Event" DROP COLUMN IF EXISTS "reminderSent";

-- Step 5: Add new Event columns
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "game"                  TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "customTypeName"        TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "timezoneUsed"          TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "reminderBeforeMinutes" INTEGER;

-- Step 6: Add updatedAt to EventRsvp (if it doesn't already have it)
ALTER TABLE "EventRsvp" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Step 7: Add indexes on Event
CREATE INDEX IF NOT EXISTS "Event_scheduledAt_idx"  ON "Event"("scheduledAt");
CREATE INDEX IF NOT EXISTS "Event_status_idx"       ON "Event"("status");
CREATE INDEX IF NOT EXISTS "Event_cleanupAfter_idx" ON "Event"("cleanupAfter");

-- ── EventNotificationLog ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EventNotificationLog" (
  "id"               TEXT        NOT NULL,
  "eventId"          TEXT        NOT NULL,
  "guildId"          TEXT        NOT NULL,
  "notificationType" TEXT        NOT NULL,
  "channelId"        TEXT,
  "messageId"        TEXT,
  "roleId"           TEXT,
  "sentAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventNotificationLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EventNotificationLog"
  ADD CONSTRAINT "EventNotificationLog_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE
  NOT VALID; -- skip validation for existing rows

CREATE UNIQUE INDEX IF NOT EXISTS "EventNotificationLog_eventId_notificationType_key"
  ON "EventNotificationLog"("eventId", "notificationType");
CREATE INDEX IF NOT EXISTS "EventNotificationLog_eventId_idx"
  ON "EventNotificationLog"("eventId");

-- ── EventReminder ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EventReminder" (
  "id"        TEXT         NOT NULL,
  "eventId"   TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "remindAt"  TIMESTAMP(3) NOT NULL,
  "sentAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventReminder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EventReminder"
  ADD CONSTRAINT "EventReminder_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE
  NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS "EventReminder_eventId_userId_key"
  ON "EventReminder"("eventId", "userId");
CREATE INDEX IF NOT EXISTS "EventReminder_remindAt_idx"
  ON "EventReminder"("remindAt");
CREATE INDEX IF NOT EXISTS "EventReminder_eventId_idx"
  ON "EventReminder"("eventId");
