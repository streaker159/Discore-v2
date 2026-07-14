-- Add DRAFT status to EventStatus enum
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'DRAFT';

-- Add data retention field to Event
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "dataDeleteAt" TIMESTAMPTZ(6);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "draftedAt" TIMESTAMPTZ(6);