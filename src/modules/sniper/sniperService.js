"use strict";

const prisma = require("../../lib/prisma");
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

// ─── Config helpers ──────────────────────────────────────────────────────────────

async function getConfig(guildId) {
  return prisma.sniperChallengeConfig.findUnique({ where: { guildId } });
}

async function ensureConfig(guildId) {
  let config = await prisma.sniperChallengeConfig.findUnique({
    where: { guildId },
  });
  if (!config) {
    config = await prisma.sniperChallengeConfig.create({
      data: { guildId },
    });
  }
  return config;
}

// ─── Validation ──────────────────────────────────────────────────────────────────

function validateSetup(config) {
  const issues = [];

  if (!config.challengeChannelIds || config.challengeChannelIds.length === 0) {
    issues.push("No challenge channels selected.");
  }
  if (config.challengeChannelIds && config.challengeChannelIds.length > 5) {
    issues.push("Maximum 5 challenge channels allowed.");
  }
  if (!config.rewardRoleId) {
    issues.push("No reward role selected.");
  }
  if (!config.leaderboardChannelId) {
    issues.push("No leaderboard channel selected (recommended).");
  }
  if (config.minDelayMs >= config.maxDelayMs) {
    issues.push("Min delay must be less than max delay.");
  }
  if (config.minDelayMs < 60000) {
    issues.push("Min delay must be at least 1 minute.");
  }
  if (config.activeDurationMs < 30000) {
    issues.push("Active duration must be at least 30 seconds.");
  }
  if (config.activeDurationMs > 600000) {
    issues.push("Active duration must be at most 10 minutes.");
  }

  return issues;
}

// ─── Spawn challenge ─────────────────────────────────────────────────────────────

async function spawnChallenge(guildId, client, forceChannelId = null) {
  const config = await getConfig(guildId);
  if (!config || !config.enabled) return null;

  // Check if another challenge is already active
  const existingActive = await prisma.sniperChallengeRun.findFirst({
    where: { guildId, status: "ACTIVE" },
  });
  if (existingActive) {
    if (DEBUG) logger.info("[SniperChallenge] Already active, skipping spawn");
    return null;
  }

  // Pick a random channel
  const channelIds = config.challengeChannelIds || [];
  if (!channelIds.length) return null;

  const channelId =
    forceChannelId || channelIds[Math.floor(Math.random() * channelIds.length)];

  // Fetch channel
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

  // Check bot permissions
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

  const expiresAt = new Date(Date.now() + config.activeDurationMs);

  // Build the challenge message
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
    logger.error("[SniperChallenge] Failed to send challenge message", {
      guildId,
      channelId,
      error: err.message,
    });
    return null;
  }

  // Create run record
  const run = await prisma.sniperChallengeRun.create({
    data: {
      guildId,
      channelId,
      messageId: message.id,
      status: "ACTIVE",
      spawnedAt: new Date(),
      expiresAt,
    },
  });

  // Schedule next run
  const nextDelay = randomDelay(config.minDelayMs, config.maxDelayMs);
  const nextRunAt = new Date(Date.now() + nextDelay);

  await prisma.sniperChallengeConfig.update({
    where: { guildId },
    data: { nextRunAt },
  });

  if (DEBUG) {
    logger.info("[SniperChallenge] Challenge spawned", {
      guildId,
      channelId,
      runId: run.id,
      expiresAt,
      nextRunAt,
    });
  }

  return run;
}

// ─── Handle shoot click (race-condition safe) ────────────────────────────────────

async function handleShoot(interaction, challengeId) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  // Reject bots
  if (interaction.user.bot) {
    return { success: false, reason: "bot" };
  }

  // Fetch the run
  const run = await prisma.sniperChallengeRun.findUnique({
    where: { id: challengeId },
  });

  if (!run) {
    return { success: false, reason: "unknown_challenge" };
  }

  if (run.status !== "ACTIVE") {
    return { success: false, reason: "already_ended" };
  }

  if (new Date() > run.expiresAt) {
    // Mark expired
    await prisma.sniperChallengeRun
      .update({
        where: { id: challengeId },
        data: { status: "EXPIRED" },
      })
      .catch(() => {});
    return { success: false, reason: "expired" };
  }

  // Atomic race-condition-safe update
  const spawnedAt = run.spawnedAt;
  const wonAt = new Date();
  const reactionTimeMs = spawnedAt
    ? wonAt.getTime() - spawnedAt.getTime()
    : null;

  const result = await prisma.sniperChallengeRun.updateMany({
    where: {
      id: challengeId,
      status: "ACTIVE",
      winnerId: null,
    },
    data: {
      winnerId: userId,
      status: "WON",
      wonAt,
      reactionTimeMs,
    },
  });

  if (result.count === 0) {
    // Already won by someone else
    return { success: false, reason: "too_slow" };
  }

  // Process the win
  try {
    await processWin(
      guildId,
      userId,
      challengeId,
      reactionTimeMs,
      interaction.client,
    );
  } catch (err) {
    logger.error("[SniperChallenge] Error processing win", {
      guildId,
      userId,
      error: err.message,
    });
  }

  return { success: true, winnerId: userId, reactionTimeMs };
}

// ─── Process win ─────────────────────────────────────────────────────────────────

async function processWin(
  guildId,
  userId,
  challengeId,
  reactionTimeMs,
  client,
) {
  const config = await getConfig(guildId);
  if (!config) return;

  // 1. Update / create player stats
  const stats = await prisma.sniperPlayerStats.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: {
      guildId,
      userId,
      totalWins: 1,
      currentStreak: 1,
      bestStreak: 1,
      lastWinAt: new Date(),
    },
    update: {},
  });

  // Determine if same champion (streak)
  const isStreak = config.currentChampionId === userId;
  const newStreak = isStreak ? stats.currentStreak + 1 : 1;
  const newBestStreak = Math.max(stats.bestStreak, newStreak);

  await prisma.sniperPlayerStats.update({
    where: { guildId_userId: { guildId, userId } },
    data: {
      totalWins: { increment: 1 },
      currentStreak: newStreak,
      bestStreak: newBestStreak,
      lastWinAt: new Date(),
    },
  });

  // 2. Handle champion role
  // Remove role from previous champion
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
        if (prevMember) {
          await prevMember.roles.remove(config.rewardRoleId).catch(() => {});
          if (DEBUG)
            logger.info(
              "[SniperChallenge] Removed role from previous champion",
              {
                prevChampion: config.currentChampionId,
              },
            );
        }
      }
    } catch (err) {
      logger.warn(
        "[SniperChallenge] Failed to remove role from previous champion",
        {
          prevChampion: config.currentChampionId,
          error: err.message,
        },
      );
    }
  }

  // Give role to new winner
  if (config.rewardRoleId) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          await member.roles.add(config.rewardRoleId).catch(() => {});
          if (DEBUG)
            logger.info("[SniperChallenge] Gave role to new champion", {
              userId,
            });
        } else {
          logger.warn("[SniperChallenge] Winner not in guild", { userId });
        }
      }
    } catch (err) {
      logger.warn("[SniperChallenge] Failed to give role to winner", {
        userId,
        error: err.message,
      });
    }
  }

  // 3. Update config
  await prisma.sniperChallengeConfig.update({
    where: { guildId },
    data: {
      currentChampionId: userId,
      currentChampionSince: new Date(),
      lastWinnerId: userId,
      totalChallengesCompleted: { increment: 1 },
    },
  });

  // 4. Edit challenge message
  const run = await prisma.sniperChallengeRun.findUnique({
    where: { id: challengeId },
  });
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
          const row = new ActionRowBuilder().addComponents(disabledButton);
          const wonAttachments = getWinnerAnnouncementAttachments();
          await message
            .edit({
              embeds: [wonEmbed],
              components: [row],
              files: wonAttachments,
            })
            .catch(() => {});
        }
      }
    } catch (err) {
      logger.warn("[SniperChallenge] Failed to edit challenge message", {
        error: err.message,
      });
    }
  }

  // 5. Send winner announcement
  const freshStats = await prisma.sniperPlayerStats.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });
  const notifChannelId = config.notificationChannelId || run?.channelId;
  if (notifChannelId) {
    try {
      const notifChannel = client.channels.cache.get(notifChannelId);
      if (notifChannel) {
        const announcementEmbed = buildWinnerAnnouncementEmbed(
          userId,
          freshStats?.totalWins ?? 1,
          freshStats?.currentStreak ?? 1,
        );
        const annAttachments = getWinnerAnnouncementAttachments();
        await notifChannel
          .send({
            content: `🏆 <@${userId}> just stole the top spot!`,
            embeds: [announcementEmbed],
            files: annAttachments,
          })
          .catch(() => {});
      }
    } catch (err) {
      logger.warn("[SniperChallenge] Failed to send winner announcement", {
        error: err.message,
      });
    }
  }

  // 6. Update leaderboard
  try {
    await updateLeaderboard(guildId, client);
  } catch (err) {
    logger.warn("[SniperChallenge] Failed to update leaderboard", {
      error: err.message,
    });
  }

  if (DEBUG) {
    logger.info("[SniperChallenge] Winner processed", {
      guildId,
      userId,
      reactionTimeMs,
    });
  }
}

// ─── Handle expiry ───────────────────────────────────────────────────────────────

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
    const row = new ActionRowBuilder().addComponents(disabledButton);

    await message
      .edit({ embeds: [expiredEmbed], components: [row] })
      .catch(() => {});
  } catch (err) {
    logger.warn("[SniperChallenge] Failed to edit expired message", {
      error: err.message,
    });
  }

  // Mark run as expired
  await prisma.sniperChallengeRun
    .update({
      where: { id: run.id },
      data: { status: "EXPIRED" },
    })
    .catch(() => {});
}

// ─── Pause / Resume ──────────────────────────────────────────────────────────────

async function pauseChallenges(guildId) {
  await prisma.sniperChallengeConfig.update({
    where: { guildId },
    data: { paused: true, nextRunAt: null },
  });
}

async function resumeChallenges(guildId, client) {
  const config = await getConfig(guildId);
  if (!config || !config.enabled) return;

  await prisma.sniperChallengeConfig.update({
    where: { guildId },
    data: { paused: false },
  });

  // Schedule next run
  const nextDelay = randomDelay(config.minDelayMs, config.maxDelayMs);
  const nextRunAt = new Date(Date.now() + nextDelay);
  await prisma.sniperChallengeConfig.update({
    where: { guildId },
    data: { nextRunAt },
  });

  if (DEBUG) logger.info("[SniperChallenge] Resumed", { guildId, nextRunAt });
}

// ─── Force challenge ─────────────────────────────────────────────────────────────

async function forceChallenge(guildId, client) {
  const config = await getConfig(guildId);
  if (!config) return { success: false, reason: "no_config" };

  const issues = validateSetup(config);
  if (issues.length > 0) {
    return { success: false, reason: "invalid_setup", issues };
  }

  // Check existing active
  const active = await prisma.sniperChallengeRun.findFirst({
    where: { guildId, status: "ACTIVE" },
  });
  if (active) {
    // Cancel it first
    await prisma.sniperChallengeRun.update({
      where: { id: active.id },
      data: { status: "CANCELLED" },
    });
  }

  const run = await spawnChallenge(guildId, client);
  if (!run) {
    return { success: false, reason: "spawn_failed" };
  }

  return { success: true, runId: run.id };
}

// ─── Cancel active ───────────────────────────────────────────────────────────────

async function cancelActive(guildId) {
  const active = await prisma.sniperChallengeRun.findFirst({
    where: { guildId, status: "ACTIVE" },
  });
  if (!active) return false;

  await prisma.sniperChallengeRun.update({
    where: { id: active.id },
    data: { status: "CANCELLED" },
  });
  return true;
}

// ─── Reset stats ─────────────────────────────────────────────────────────────────

async function resetStats(guildId) {
  await prisma.sniperPlayerStats.deleteMany({ where: { guildId } });
  await prisma.sniperChallengeRun.deleteMany({ where: { guildId } });
  await prisma.sniperChallengeConfig.update({
    where: { guildId },
    data: {
      currentChampionId: null,
      currentChampionSince: null,
      lastWinnerId: null,
      totalChallengesCompleted: 0,
    },
  });
}

// ─── Clear champion ──────────────────────────────────────────────────────────────

async function clearChampion(guildId, client) {
  const config = await getConfig(guildId);
  if (!config?.currentChampionId) return;

  // Remove role
  if (config.rewardRoleId) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const member = await guild.members
          .fetch(config.currentChampionId)
          .catch(() => null);
        if (member) {
          await member.roles.remove(config.rewardRoleId).catch(() => {});
        }
      }
    } catch {}
  }

  await prisma.sniperChallengeConfig.update({
    where: { guildId },
    data: { currentChampionId: null, currentChampionSince: null },
  });
}

// ─── Delete config ───────────────────────────────────────────────────────────────

async function deleteConfig(guildId) {
  await prisma.sniperPlayerStats.deleteMany({ where: { guildId } });
  await prisma.sniperChallengeRun.deleteMany({ where: { guildId } });
  await prisma.sniperChallengeConfig
    .delete({ where: { guildId } })
    .catch(() => {});
}

// ─── Get player stats ────────────────────────────────────────────────────────────

async function getPlayerStats(guildId, userId) {
  return prisma.sniperPlayerStats.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });
}

// ─── Get top players ─────────────────────────────────────────────────────────────

async function getTopPlayers(guildId, limit = 10) {
  return prisma.sniperPlayerStats.findMany({
    where: { guildId },
    orderBy: { totalWins: "desc" },
    take: limit,
  });
}

// ─── Mark expired runs ───────────────────────────────────────────────────────────

async function markExpiredRuns() {
  const now = new Date();
  const expiredRuns = await prisma.sniperChallengeRun.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lte: now },
    },
  });

  if (expiredRuns.length > 0) {
    await prisma.sniperChallengeRun.updateMany({
      where: {
        id: { in: expiredRuns.map((r) => r.id) },
      },
      data: { status: "EXPIRED" },
    });

    if (DEBUG) {
      logger.info("[SniperChallenge] Marked expired runs", {
        count: expiredRuns.length,
      });
    }
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
