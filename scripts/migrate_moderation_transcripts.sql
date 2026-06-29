-- Discore Official: Moderation Case Transcripts
-- Safe additive migration — no destructive changes

CREATE TABLE IF NOT EXISTS "ModerationCaseTranscript" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "caseId" TEXT,
  "appealId" TEXT,
  "caseNumber" TEXT,
  "appealNumber" TEXT,
  "ticketChannelId" TEXT,
  "ticketChannelName" TEXT,
  "userId" TEXT,
  "handledById" TEXT,
  "outcome" TEXT,
  "openedAt" TIMESTAMPTZ,
  "closedAt" TIMESTAMPTZ,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "transcriptJson" TEXT,
  "transcriptText" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ModerationCaseTranscript_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ModerationCaseTranscript_caseId_idx" ON "ModerationCaseTranscript" ("caseId");
CREATE INDEX IF NOT EXISTS "ModerationCaseTranscript_appealNumber_idx" ON "ModerationCaseTranscript" ("appealNumber");
CREATE INDEX IF NOT EXISTS "ModerationCaseTranscript_guildId_idx" ON "ModerationCaseTranscript" ("guildId");
CREATE INDEX IF NOT EXISTS "ModerationCaseTranscript_createdAt_idx" ON "ModerationCaseTranscript" ("createdAt");