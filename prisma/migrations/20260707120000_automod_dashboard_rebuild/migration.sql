-- Migration: Rebuild Automod into a premium single-command dashboard system
-- Additive only — no destructive drops. Safe to run on existing data.

-- ── Extend enums ──────────────────────────────────────────────────────────
-- New match types (word_boundary, ends_with) for the V1 matching engine.
ALTER TYPE "MatchType" ADD VALUE IF NOT EXISTS 'ENDS_WITH';
ALTER TYPE "MatchType" ADD VALUE IF NOT EXISTS 'WORD_BOUNDARY';

-- New actions (warn, delete_and_timeout, silent_log) for the dashboard.
ALTER TYPE "AutoModAction" ADD VALUE IF NOT EXISTS 'WARN';
ALTER TYPE "AutoModAction" ADD VALUE IF NOT EXISTS 'DELETE_AND_TIMEOUT';
ALTER TYPE "AutoModAction" ADD VALUE IF NOT EXISTS 'SILENT_LOG';

-- ── Guild: automod dashboard settings ───────────────────────────────────────
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "automodEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "automodReviewChannelId" TEXT;
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "automodDefaultAction" "AutoModAction" NOT NULL DEFAULT 'REVIEW';

-- ── AutoModRule: extended rule model ────────────────────────────────────────
ALTER TABLE "AutoModRule" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "AutoModRule" ADD COLUMN IF NOT EXISTS "severity" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "AutoModRule" ADD COLUMN IF NOT EXISTS "exemptRoleIds" JSONB;
ALTER TABLE "AutoModRule" ADD COLUMN IF NOT EXISTS "ignoredChannelIds" JSONB;
ALTER TABLE "AutoModRule" ADD COLUMN IF NOT EXISTS "reviewChannelId" TEXT;
ALTER TABLE "AutoModRule" ADD COLUMN IF NOT EXISTS "timeoutSeconds" INTEGER;
ALTER TABLE "AutoModRule" ADD COLUMN IF NOT EXISTS "deleteMessage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AutoModRule" ADD COLUMN IF NOT EXISTS "userMessage" TEXT;
ALTER TABLE "AutoModRule" ADD COLUMN IF NOT EXISTS "appealEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AutoModRule" ADD COLUMN IF NOT EXISTS "triggerCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AutoModRule" ADD COLUMN IF NOT EXISTS "lastTriggeredAt" TIMESTAMP(3);
ALTER TABLE "AutoModRule" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── AutoModCase: extended trigger log ───────────────────────────────────────
ALTER TABLE "AutoModCase" ADD COLUMN IF NOT EXISTS "matchedText" TEXT;
ALTER TABLE "AutoModCase" ADD COLUMN IF NOT EXISTS "resolutionAction" TEXT;
ALTER TABLE "AutoModCase" ADD COLUMN IF NOT EXISTS "moderationCaseId" TEXT;
