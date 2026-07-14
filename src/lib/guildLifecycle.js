"use strict";

const prisma = require("./prisma");
const logger = require("./logger");

/**
 * Heuristic: has this guild actually been set up / used, or is it just a
 * "drive-by" add (invited, never configured, then removed)?
 *
 * Used to decide whether to keep a Guild row around after the bot leaves
 * (so config/premium survives a re-invite) or purge it entirely so the DB
 * doesn't accumulate permanent ghost rows for servers that never used the bot.
 */
function isGuildConfigured(guild) {
  if (!guild) return false;
  return Boolean(
    guild.onboardingCompletedAt ||
    guild.onboardingSkippedAt ||
    guild.announcementChannelId ||
    guild.scoreboardChan ||
    guild.eventChannelId ||
    guild.suggestionChannelId ||
    guild.supportChannelId ||
    guild.moderationLogChannelId ||
    guild.logChannelId ||
    guild.battleSignupChan ||
    guild.premiumNoticeChan ||
    guild.allianceName ||
    guild.allianceCode,
  );
}

/**
 * Permanently deletes a guild and every row across the schema that
 * references it (events + their rsvps/reminders/logs, scoreboards + their
 * entries/actions/merge history/role scores, automod, moderation, etc.),
 * then the Guild row itself. Safe to call on guilds with zero or minimal
 * data (drive-by adds) — wrapped in a single transaction so it either fully
 * succeeds or fully rolls back.
 */
async function purgeGuildData(guildId) {
  const [events, scoreboards] = await Promise.all([
    prisma.event.findMany({ where: { guildId }, select: { id: true } }),
    prisma.scoreboard.findMany({ where: { guildId }, select: { id: true } }),
  ]);
  const eventIds = events.map((e) => e.id);
  const scoreboardIds = scoreboards.map((s) => s.id);

  const entries = scoreboardIds.length
    ? await prisma.scoreboardEntry.findMany({
        where: { scoreboardId: { in: scoreboardIds } },
        select: { id: true },
      })
    : [];
  const entryIds = entries.map((e) => e.id);

  await prisma.$transaction([
    // Event descendants
    prisma.eventReminder.deleteMany({ where: { eventId: { in: eventIds } } }),
    prisma.eventNotificationLog.deleteMany({
      where: { eventId: { in: eventIds } },
    }),
    prisma.eventRsvp.deleteMany({ where: { eventId: { in: eventIds } } }),
    prisma.event.deleteMany({ where: { id: { in: eventIds } } }),

    // Scoreboard descendants
    prisma.scoreboardEntryTypeStats.deleteMany({
      where: { scoreboardEntryId: { in: entryIds } },
    }),
    prisma.scoreboardEntry.deleteMany({
      where: { scoreboardId: { in: scoreboardIds } },
    }),
    prisma.scoreboardAction.deleteMany({
      where: { scoreboardId: { in: scoreboardIds } },
    }),
    prisma.scoreboardMergeHistory.deleteMany({
      where: { targetScoreboardId: { in: scoreboardIds } },
    }),
    prisma.userRoleScore.deleteMany({
      where: { scoreboardId: { in: scoreboardIds } },
    }),
    prisma.scoreboard.deleteMany({ where: { id: { in: scoreboardIds } } }),

    // Other direct guild children
    prisma.userActivity.deleteMany({ where: { guildId } }),
    prisma.aiCredits.deleteMany({ where: { guildId } }),
    prisma.guildPremium.deleteMany({ where: { guildId } }),
    prisma.autoModRule.deleteMany({ where: { guildId } }),
    prisma.autoModCase.deleteMany({ where: { guildId } }),
    prisma.battleSignup.deleteMany({ where: { guildId } }),
    prisma.suggestion.deleteMany({ where: { guildId } }),
    prisma.moderationCase.deleteMany({ where: { guildId } }),
    prisma.auditLog.deleteMany({ where: { guildId } }),
    prisma.botGuildInstallEvent.deleteMany({ where: { guildId } }),

    // Finally the guild row itself
    prisma.guild.deleteMany({ where: { id: guildId } }),
  ]);
}

/**
 * Call when the bot is confirmed to no longer be in a guild (live guildDelete
 * event, or discovered missing during the startup reconciliation sweep).
 *
 * If the guild was never actually configured, purge it completely so the DB
 * doesn't accumulate permanent ghost rows. If it WAS configured (real setup
 * and/or premium), keep the row so settings survive a future re-invite.
 */
async function handleGuildGone(guildId, { guildName = null } = {}) {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) return { purged: false, kept: false, existed: false };

  if (isGuildConfigured(guild)) {
    logger.info("guildLifecycle: keeping configured guild after leave", {
      guildId,
      guildName: guildName || guild.allianceName,
    });
    return { purged: false, kept: true, existed: true };
  }

  await purgeGuildData(guildId);
  logger.info("guildLifecycle: purged unconfigured guild after leave", {
    guildId,
    guildName: guildName || guild.allianceName,
  });
  return { purged: true, kept: false, existed: true };
}

module.exports = { isGuildConfigured, purgeGuildData, handleGuildGone };
