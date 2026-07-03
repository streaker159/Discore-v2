-- Migration: Add indexes to support "Most Messages" / "Most Reactions" XP leaderboards
CREATE INDEX IF NOT EXISTS "UserXp_guildId_messagesCounted_idx" ON "UserXp"("guildId", "messagesCounted");
CREATE INDEX IF NOT EXISTS "UserXp_guildId_reactionsCounted_idx" ON "UserXp"("guildId", "reactionsCounted");
