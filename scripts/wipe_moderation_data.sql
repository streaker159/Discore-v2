-- ⚠️ ONE-TIME WIPE — Deletes ALL moderation and appeals data
-- Run this manually against the production database
-- This will permanently delete: moderation cases, appeals, transcripts, role snapshots, auto-mod records

BEGIN;

-- Delete moderation transcripts
DELETE FROM "ModerationCaseTranscript";

-- Delete appeals
DELETE FROM "Appeal";

-- Delete role snapshots
DELETE FROM "UserRoleSnapshot";

-- Delete auto-mod cases
DELETE FROM "AutoModCase";

-- Delete auto-mod rules
DELETE FROM "AutoModRule";

-- Delete moderation cases (must be last due to FK references)
DELETE FROM "ModerationCase";

COMMIT;