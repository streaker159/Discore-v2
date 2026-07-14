-- Add DRAFT status to EventStatus enum (safe: only adds if not exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EventStatus') AND enumlabel = 'DRAFT') THEN
    ALTER TYPE "EventStatus" ADD VALUE 'DRAFT';
  END IF;
END $$;

-- Add data retention field to Event
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "dataDeleteAt" TIMESTAMPTZ(6);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "draftedAt" TIMESTAMPTZ(6);
