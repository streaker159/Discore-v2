"use strict";

const db = require("./sniperDb");
const logger = require("../../lib/logger");
const {
  buildChallengeEmbed,
  getChallengeAttachments,
  buildExpiredEmbed,
  buildWonEmbed,
  buildWinnerAnnouncementEmbed,
  getWinnerAnnouncementAttachments,
} = require("./sniperEmbeds");
const { updateLeaderboard } = require("./sniperLeaderboard");
const { randomDelay } = require("./sniperScheduler");

const DEBUG = process.env.DEBUG_SNIPER_CHALLENGE === "true";
const AUTO_DELETE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Schedule a message for deletion after AUTO_DELETE_MS.
 * Wraps setTimeout with error logging so silent failures are visible.
 */
function scheduleDelete(message, label = "message") {
  if (!message) return;
  setTimeout(() => {
    message.delete().catch((err) => {
      if (err?.code !== 10008) {
        // 10008 = Unknown Message (already deleted) — expected
        logger.warn(`[SniperChallenge] Failed to auto-delete ${label}`, {
          error: err?.message ?? err,
          code: err?.code,
        });
      }
    });
  }, AUTO_DELETE_MS);
}

async function getConfig(guildId) {
  return db.findConfig(guildId);
}

async function ensureConfig(guildId) {
  let config = await db.findConfig(guildId);
  if (!config) config = await db.upsertConfig(guildId, {});
  return config;
}

function validateSetup(config) {
  const issues = [];
  if (!config.challengeChannelIds || config.challengeChannelIds.length === 0)
    issues.push("No challenge channels selected.");
  if (config.challengeChannelIds && config.challengeChannelIds.length > 5)
    issues.push("Maximum 5 challenge channels allowed.");
  if (!config.rewardRoleId) issues.push("No reward role selected.");
  if (!config.leaderboardChannelId)
    issues.push("No leaderboard channel selected (recommended).");
  if (config.minDelayMs >= config.maxDelayMs)
    issues.push("Min delay must be less than max delay.");
  if (config.minDelayMs < 60000)
    issues.push("Min delay must be at least 1 minute.");
  if (config.activeDurationMs < 30000)
    issues.push("Active duration must be at least 30 seconds.");
  if (config.activeDurationMs > 600000)
    issues.push("Active duration must be at most 10 minutes.");
  return issues;
}

async function spawnChallenge(guildId, client, forceChannelId = null) {
  const config = await getConfig(guildId);
  if (!config || !config.enabled) return null;

  const existingActive = await db.findActiveRun(guildId);
  if (existingActive) {
    if (DEBUG) logger.info("[SniperChallenge] Already active, skipping spawn");
    return null;
  }

  const channelIds = config.challengeChannelIds || [];
  if (!channelIds.length) return null;

  const channelId =
    forceChannelId || channelIds[Math.floor(Math.random() * channelIds.length)];
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    logger.warn("[SniperChallenge] Challenge channel not found", {
      guildId,
      channelId,
    });
    return null;
  }

  const perms = channel.permissionsFor(guild.members.me);
  if (
    !perms?.has("ViewChannel") ||
    !perms?.has("SendMessages") ||
    !perms?.has("EmbedLinks") ||
    !perms?.has("AttachFiles")
  ) {
    logger.warn("[SniperChallenge] Missing permissions in challenge channel", {
      guildId,
      channelId,
    });
    return null;
  }

  // ── TEASER: Send immediately, 30 seconds BEFORE the actual challenge ────
  if (config.teaserRoleId || config.notificationChannelId) {
    const teaserChanId = config.notificationChannelId || channelId;
    const teaserChan = client.channels.cache.get(teaserChanId);
    if (teaserChan) {
      const { buildTeaserEmbed } = require("./sniperEmbeds");
      const teaserContent = config.teaserRoleId
        ? `<@&${config.teaserRoleId}> — Incoming target in 30 seconds!`
        : "👀 A target is about to appear in 30 seconds...";
      let teaserMsg;
      try {
        teaserMsg = await teaserChan.send({
          content: teaserContent,
          embeds: [buildTeaserEmbed()],
          files: [getChallengeAttachments()[0]],
        });
      } catch {}
      if (teaserMsg) {
        scheduleDelete(teaserMsg, "teaser");
      }
    }
  }

  // ── CHALLENGE: Schedule 30 seconds after teaser ─────────────────────────
  // We return a pseudo-run immediately so the scheduler doesn't try to spawn again.
  // The actual challenge posts after the delay.
  const TEASER_DELAY_MS = 30 * 1000;

  // Schedule next run now (based on when spawnChallenge was called)
  const nextDelay = randomDelay(config.minDelayMs, config.maxDelayMs);
  await db.updateConfig(guildId, {
    nextRunAt: new Date(Date.now() + nextDelay + TEASER_DELAY_MS),
  });

  // Create a placeholder run to prevent duplicate spawns during the 30s window
  const placeholderRun = await db.createRun({
    guildId,
    channelId,
    messageId: null,
    status: "ACTIVE",
    spawnedAt: new Date(),
    expiresAt: new Date(Date.now() + config.activeDurationMs + TEASER_DELAY_MS),
  });
  if (!placeholderRun) return null;

  // Fire the actual challenge after 30 seconds
  setTimeout(async () => {
    try {
      const embed = buildChallengeEmbed();
      const attachments = getChallengeAttachments();
      const {
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
      } = require("discord.js");
      const button = new ButtonBuilder()
        .setCustomId("sniper:shoot")
        .setLabel("SHOOT")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔫");
      const row = new ActionRowBuilder().addComponents(button);

      let message;
      try {
        message = await channel.send({
          embeds: [embed],
          components: [row],
          files: attachments,
        });
      } catch (err) {
        logger.error(
          "[SniperChallenge] Failed to send challenge message (delayed)",
          { guildId, channelId, error: err.message },
        );
        await db.updateRun(placeholderRun.id, { status: "EXPIRED" });
        return;
      }

      // Update the placeholder run with the real message ID
      await db.updateRun(placeholderRun.id, {
        messageId: message.id,
        spawnedAt: new Date(),
        expiresAt: new Date(Date.now() + config.activeDurationMs),
      });

      // Auto-delete after 10 minutes
      scheduleDelete(message, "challenge");

      if (DEBUG) {
        logger.info("[SniperChallenge] Challenge spawned (30s teaser)", {
          guildId,
          channelId,
          runId: placeholderRun.id,
        });
      }
    } catch (err) {
      logger.error("[SniperChallenge] Delayed challenge spawn failed", {
        guildId,
        error: err.message,
      });
      await db.updateRun(placeholderRun.id, { status: "EXPIRED" });
    }
  }, TEASER_DELAY_MS);

  return placeholderRun;
}

async function handleShoot(interaction, challengeId) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  if (interaction.user.bot) return { success: false, reason: "bot" };

  const run = await db.findRun(challengeId);
  if (!run) return { success: false, reason: "unknown_challenge" };
  if (run.status !== "ACTIVE")
    return { success: false, reason: "already_ended" };
  if (new Date() > run.expiresAt) {
    await db.updateRun(challengeId, { status: "EXPIRED" });
    return { success: false, reason: "expired" };
  }

  const wonAt = new Date();
  const reactionTimeMs = run.spawnedAt
    ? wonAt.getTime() - new Date(run.spawnedAt).getTime()
    : null;

  const result = await db.updateRunMany(
    { id: challengeId, status: "ACTIVE", winnerId: null },
    { winnerId: userId, status: "WON", wonAt, reactionTimeMs },
  );

  if (result.count === 0) return { success: false, reason: "too_slow" };

  setImmediate(() => {
    processWin(
      guildId,
      userId,
      challengeId,
      reactionTimeMs,
      interaction.client,
    ).catch((err) => {
      logger.error("[SniperChallenge] Background win processing failed", {
        guildId,
        userId,
        error: err.message,
      });
    });
  });

  return { success: true, winnerId: userId, reactionTimeMs };
}

async function processWin(
  guildId,
  userId,
  challengeId,
  reactionTimeMs,
  client,
) {
  const config = await getConfig(guildId);
  if (!config) return;

  let stats = await db.findStats(guildId, userId);
  if (!stats) {
    stats = { totalWins: 0, currentStreak: 0, bestStreak: 0 };
    await db.upsertStats(guildId, userId, {
      totalWins: 0,
      currentStreak: 0,
      bestStreak: 0,
    });
  }

  const isStreak = config.currentChampionId === userId;
  const newStreak = isStreak && stats ? stats.currentStreak + 1 : 1;
  const newBestStreak = stats
    ? Math.max(stats.bestStreak ?? 0, newStreak)
    : newStreak;

  await db.updateStats(guildId, userId, {
    totalWins: Number(stats.totalWins ?? 0) + 1,
    currentStreak: newStreak,
    bestStreak: newBestStreak,
    lastWinAt: new Date(),
  });

  if (
    config.currentChampionId &&
    config.currentChampionId !== userId &&
    config.rewardRoleId
  ) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const prevMember = await guild.members
          .fetch(config.currentChampionId)
          .catch(() => null);
        if (prevMember)
          await prevMember.roles.remove(config.rewardRoleId).catch(() => {});
      }
    } catch (err) {
      logger.warn(
        "[SniperChallenge] Failed to remove role from previous champion",
        { prevChampion: config.currentChampionId, error: err.message },
      );
    }
  }

  if (config.rewardRoleId) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) await member.roles.add(config.rewardRoleId).catch(() => {});
      }
    } catch (err) {
      logger.warn("[SniperChallenge] Failed to give role to winner", {
        userId,
        error: err.message,
      });
    }
  }

  await db.updateConfig(guildId, {
    currentChampionId: userId,
    currentChampionSince: new Date(),
    lastWinnerId: userId,
    totalChallengesCompleted: (config.totalChallengesCompleted ?? 0) + 1,
  });

  const run = await db.findRun(challengeId);
  if (run?.messageId && run?.channelId) {
    try {
      const channel = client.channels.cache.get(run.channelId);
      if (channel) {
        const message = await channel.messages
          .fetch(run.messageId)
          .catch(() => null);
        if (message) {
          const {
            ActionRowBuilder,
            ButtonBuilder,
            ButtonStyle,
          } = require("discord.js");
          const wonEmbed = buildWonEmbed(userId, reactionTimeMs);
          const disabledButton = new ButtonBuilder()
            .setCustomId("sniper:shoot")
            .setLabel("Claimed")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🔫")
            .setDisabled(true);
          await message
            .edit({
              embeds: [wonEmbed],
              components: [
                new ActionRowBuilder().addComponents(disabledButton),
              ],
              files: getWinnerAnnouncementAttachments(),
            })
            .catch(() => {});
          scheduleDelete(message, "won challenge");
        }
      }
    } catch (err) {
      logger.warn("[SniperChallenge] Failed to edit challenge message", {
        error: err.message,
      });
    }
  }

  const freshStats = await db.findStats(guildId, userId);
  const notifChannelId = config.notificationChannelId || run?.channelId;
  if (notifChannelId) {
    try {
      const notifChannel = client.channels.cache.get(notifChannelId);
      if (notifChannel) {
        const annMsg = await notifChannel
          .send({
            content: `🏆 <@${userId}> just stole the top spot!`,
            embeds: [
              buildWinnerAnnouncementEmbed(
                userId,
                freshStats?.totalWins ?? 1,
                freshStats?.currentStreak ?? 1,
                config.currentChampionId !== userId
                  ? config.currentChampionId
                  : null,
              ),
            ],
            files: getWinnerAnnouncementAttachments(),
          })
          .catch(() => null);
        if (annMsg) scheduleDelete(annMsg, "winner announcement");
      }
    } catch (err) {
      logger.warn("[SniperChallenge] Failed to send winner announcement", {
        error: err.message,
      });
    }
  }

  try {
    await updateLeaderboard(guildId, client);
  } catch (err) {
    logger.warn("[SniperChallenge] Failed to update leaderboard", {
      error: err.message,
    });
  }

  // ── Auto-increment scoreboard wins for roles the winner holds ──────
  try {
    const prisma = require("../../lib/prisma");
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        const userRoleIds = member.roles.cache.map((r) => r.id);
        // Find scoreboard entries targeting any role the user currently has
        const roleEntries = await prisma.scoreboardEntry.findMany({
          where: {
            targetId: { in: userRoleIds },
            targetType: "ROLE",
            scoreboard: { guildId, isArchived: false },
          },
          include: { scoreboard: true },
        });
        for (const entry of roleEntries) {
          await prisma.scoreboardEntry.update({
            where: { id: entry.id },
            data: { wins: { increment: 1 } },
          });
          // Update userRoleScore tracking
          await prisma.userRoleScore.upsert({
            where: {
              userId_roleId_scoreboardId: {
                userId,
                roleId: entry.targetId,
                scoreboardId: entry.scoreboardId,
              },
            },
            create: {
              userId,
              roleId: entry.targetId,
              scoreboardId: entry.scoreboardId,
              wins: 1,
              losses: 0,
              points: 0,
              isActive: true,
            },
            update: { wins: { increment: 1 }, isActive: true },
          });
        }
        // Also update direct user entries
        const userEntries = await prisma.scoreboardEntry.findMany({
          where: {
            targetId: userId,
            targetType: "USER",
            scoreboard: { guildId, isArchived: false },
          },
        });
        for (const entry of userEntries) {
          await prisma.scoreboardEntry.update({
            where: { id: entry.id },
            data: { wins: { increment: 1 } },
          });
        }
      }
    }
  } catch (err) {
    logger.warn("[SniperChallenge] Failed to update scoreboard for winner", {
      error: err.message,
    });
  }

  if (DEBUG)
    logger.info("[SniperChallenge] Winner processed", {
      guildId,
      userId,
      reactionTimeMs,
    });
}

async function handleExpiry(run, client) {
  if (!run.messageId || !run.channelId) return;
  try {
    const channel = client.channels.cache.get(run.channelId);
    if (!channel) return;
    const message = await channel.messages
      .fetch(run.messageId)
      .catch(() => null);
    if (!message) return;
    const {
      ActionRowBuilder,
      ButtonBuilder,
      ButtonStyle,
    } = require("discord.js");
    const expiredEmbed = buildExpiredEmbed();
    const disabledButton = new ButtonBuilder()
      .setCustomId("sniper:shoot")
      .setLabel("Expired")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔫")
      .setDisabled(true);
    await message
      .edit({
        embeds: [expiredEmbed],
        components: [new ActionRowBuilder().addComponents(disabledButton)],
      })
      .catch(() => {});
    setTimeout(() => {
      message.delete().catch(() => {});
    }, AUTO_DELETE_MS);
  } catch (err) {
    logger.warn("[SniperChallenge] Failed to edit expired message", {
      error: err.message,
    });
  }
  await db.updateRun(run.id, { status: "EXPIRED" });
}

async function pauseChallenges(guildId) {
  await db.updateConfig(guildId, { paused: true, nextRunAt: null });
}

async function resumeChallenges(guildId, client) {
  const config = await getConfig(guildId);
  if (!config || !config.enabled) return;
  await db.updateConfig(guildId, { paused: false });
  const nextRunAt = new Date(
    Date.now() + randomDelay(config.minDelayMs, config.maxDelayMs),
  );
  await db.updateConfig(guildId, { nextRunAt });
  if (DEBUG) logger.info("[SniperChallenge] Resumed", { guildId, nextRunAt });
}

async function forceChallenge(guildId, client) {
  const config = await getConfig(guildId);
  if (!config) return { success: false, reason: "no_config" };
  const issues = validateSetup(config);
  if (issues.length > 0)
    return { success: false, reason: "invalid_setup", issues };
  const active = await db.findActiveRun(guildId);
  if (active) await db.updateRun(active.id, { status: "CANCELLED" });
  const run = await spawnChallenge(guildId, client);
  if (!run) return { success: false, reason: "spawn_failed" };
  return { success: true, runId: run.id };
}

async function cancelActive(guildId) {
  const active = await db.findActiveRun(guildId);
  if (!active) return false;
  await db.updateRun(active.id, { status: "CANCELLED" });
  return true;
}

async function resetStats(guildId) {
  await db.deleteStats({ guildId });
  await db.deleteRuns({ guildId });
  await db.updateConfig(guildId, {
    currentChampionId: null,
    currentChampionSince: null,
    lastWinnerId: null,
    totalChallengesCompleted: 0,
  });
}

async function clearChampion(guildId, client) {
  const config = await getConfig(guildId);
  if (!config?.currentChampionId) return;
  if (config.rewardRoleId) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const member = await guild.members
          .fetch(config.currentChampionId)
          .catch(() => null);
        if (member)
          await member.roles.remove(config.rewardRoleId).catch(() => {});
      }
    } catch {}
  }
  await db.updateConfig(guildId, {
    currentChampionId: null,
    currentChampionSince: null,
  });
}

async function deleteConfig(guildId) {
  await db.deleteStats({ guildId });
  await db.deleteRuns({ guildId });
  await db.deleteConfig(guildId);
}

async function getPlayerStats(guildId, userId) {
  return db.findStats(guildId, userId);
}

async function getTopPlayers(guildId, limit = 10) {
  return db.findTopPlayers(guildId, limit);
}

async function markExpiredRuns() {
  const expiredRuns = await db.findExpiredRuns();
  if (expiredRuns.length > 0) {
    await db.updateRunMany(
      { id: { in: expiredRuns.map((r) => r.id) } },
      { status: "EXPIRED" },
    );
    if (DEBUG)
      logger.info("[SniperChallenge] Marked expired runs", {
        count: expiredRuns.length,
      });
  }
  return expiredRuns;
}

module.exports = {
  getConfig,
  ensureConfig,
  validateSetup,
  spawnChallenge,
  handleShoot,
  processWin,
  handleExpiry,
  pauseChallenges,
  resumeChallenges,
  forceChallenge,
  cancelActive,
  resetStats,
  clearChampion,
  deleteConfig,
  getPlayerStats,
  getTopPlayers,
  markExpiredRuns,
};
