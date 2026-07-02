"use strict";

const prisma = require("../../lib/prisma");
const logger = require("../../lib/logger");
const {
  calculateLevel,
  getTotalXpForLevel,
  getXpForNextLevel,
  getProgressToNextLevel,
  formatXp,
} = require("./xpFormula");
const { getXpConfig } = require("./xpConfigService");
const { isCooldownActive, setCooldown } = require("./xpCooldownCache");

/**
 * Handle message XP award
 * @param {object} message - Discord message object
 * @param {object} client - Discord client
 * @returns {Promise<{ awarded: boolean, leveledUp: boolean, oldLevel?: number, newLevel?: number, amount?: number }>}
 */
async function handleMessageXp(message, client) {
  // Quick exits first - no DB calls
  if (message.author.bot) return { awarded: false };
  if (!message.guild) return { awarded: false };
  if (message.webhookId) return { awarded: false };

  const guildId = message.guild.id;
  const userId = message.author.id;

  try {
    // Get config (uses cache)
    const config = await getXpConfig(guildId);
    if (!config.enabled) return { awarded: false };
    if (!config.messageXpEnabled) return { awarded: false };

    // Fast cooldown check (in-memory)
    if (
      isCooldownActive(
        guildId,
        userId,
        "message",
        config.messageCooldownSeconds,
      )
    ) {
      return { awarded: false };
    }

    // DB-backed cooldown check (persists across restarts)
    const now = new Date();
    const userXp = await prisma.userXp.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { lastMessageXpAt: true },
    });

    if (userXp?.lastMessageXpAt) {
      const elapsed = (now.getTime() - userXp.lastMessageXpAt.getTime()) / 1000;
      if (elapsed < config.messageCooldownSeconds) {
        // Still on cooldown via DB - update cache
        setCooldown(guildId, userId, "message");
        return { awarded: false };
      }
    }

    // Calculate random XP
    const amount = Math.floor(
      Math.random() * (config.maxMessageXp - config.minMessageXp + 1) +
        config.minMessageXp,
    );

    // Resolve display info
    const member = message.member;
    const displayName = member
      ? member.displayName || member.user?.username
      : message.author.username;
    const userTag = message.author.tag || message.author.username;
    const avatarUrl =
      member?.displayAvatarURL?.({ dynamic: true }) ||
      message.author.displayAvatarURL({ dynamic: true }) ||
      null;

    // Upsert UserXp and update level
    const upserted = await upsertUserXp(guildId, userId, amount, "message", {
      displayName,
      userTag,
      avatarUrl,
    });

    // Record event
    await prisma.userXpEvent
      .create({
        data: {
          guildId,
          userId,
          source: "message",
          amount,
        },
      })
      .catch(() => {});

    // Update cooldown cache
    setCooldown(guildId, userId, "message");

    // Handle level-up
    if (
      upserted.didLevelUp &&
      config.announceLevelUps &&
      config.levelUpChannelId
    ) {
      try {
        await sendLevelUpAnnouncement(
          client,
          guildId,
          config.levelUpChannelId,
          message.author,
          member,
          upserted.oldLevel,
          upserted.newLevel,
        );
      } catch (err) {
        logger.warn("Failed to send level-up announcement", {
          guildId,
          userId,
          error: err.message,
        });
      }
    }

    return {
      awarded: true,
      amount,
      leveledUp: upserted.didLevelUp,
      oldLevel: upserted.oldLevel,
      newLevel: upserted.newLevel,
    };
  } catch (err) {
    logger.warn("XP message handler error", {
      guildId,
      userId,
      error: err.message,
    });
    return { awarded: false };
  }
}

/**
 * Handle reaction XP award
 * @param {object} reaction - Discord reaction object
 * @param {object} user - Discord user who added the reaction
 * @param {object} client - Discord client
 * @returns {Promise<{ awarded: boolean, leveledUp: boolean }>}
 */
async function handleReactionXp(reaction, user, client) {
  if (user.bot) return { awarded: false };
  const guildId = reaction.message.guild?.id;
  if (!guildId) return { awarded: false };

  try {
    const config = await getXpConfig(guildId);
    if (!config.enabled) return { awarded: false };
    if (!config.reactionXpEnabled) return { awarded: false };

    // Fast cache cooldown check
    if (
      isCooldownActive(
        guildId,
        user.id,
        "reaction",
        config.reactionCooldownSeconds,
      )
    ) {
      return { awarded: false };
    }

    // DB cooldown check
    const now = new Date();
    const userXp = await prisma.userXp.findUnique({
      where: { guildId_userId: { guildId, userId: user.id } },
      select: { lastReactionXpAt: true },
    });

    if (userXp?.lastReactionXpAt) {
      const elapsed =
        (now.getTime() - userXp.lastReactionXpAt.getTime()) / 1000;
      if (elapsed < config.reactionCooldownSeconds) {
        setCooldown(guildId, user.id, "reaction");
        return { awarded: false };
      }
    }

    // Small XP
    const amount = Math.floor(
      Math.random() * (config.maxReactionXp - config.minReactionXp + 1) +
        config.minReactionXp,
    );

    // Try to get member for display info
    let displayName = user.username;
    let avatarUrl = user.displayAvatarURL({ dynamic: true }) || null;
    try {
      const member = await reaction.message.guild?.members
        .fetch(user.id)
        .catch(() => null);
      if (member) {
        displayName = member.displayName || user.username;
        avatarUrl = member.displayAvatarURL({ dynamic: true }) || avatarUrl;
      }
    } catch {}

    await upsertUserXp(guildId, user.id, amount, "reaction", {
      displayName,
      userTag: user.tag || user.username,
      avatarUrl,
    });

    // Record event
    await prisma.userXpEvent
      .create({
        data: {
          guildId,
          userId: user.id,
          source: "reaction",
          amount,
        },
      })
      .catch(() => {});

    setCooldown(guildId, user.id, "reaction");

    return { awarded: true, amount };
  } catch (err) {
    logger.warn("XP reaction handler error", {
      guildId,
      userId: user.id,
      error: err.message,
    });
    return { awarded: false };
  }
}

/**
 * Upsert UserXp record, add amount, recalculate level
 * @param {string} guildId
 * @param {string} userId
 * @param {number} amount
 * @param {'message'|'reaction'} source
 * @param {object} meta - { displayName, userTag, avatarUrl }
 * @returns {Promise<{ didLevelUp: boolean, oldLevel: number, newLevel: number }>}
 */
async function upsertUserXp(guildId, userId, amount, source, meta = {}) {
  const now = new Date();

  // Use a transaction to safely update
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.userXp.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });

    const oldTotalXp = existing?.totalXp || 0;
    const oldLevel = existing?.level || 1;
    const newTotalXp = oldTotalXp + amount;
    const newLevel = calculateLevel(newTotalXp);
    const didLevelUp = newLevel > oldLevel;

    const updateData = {
      totalXp: newTotalXp,
      level: newLevel,
      ...(source === "message"
        ? {
            lastMessageXpAt: now,
            messagesCounted: { increment: 1 },
          }
        : {
            lastReactionXpAt: now,
            reactionsCounted: { increment: 1 },
          }),
    };

    // Update display info if provided
    if (meta.displayName) updateData.displayName = meta.displayName;
    if (meta.userTag) updateData.userTag = meta.userTag;
    if (meta.avatarUrl) updateData.avatarUrl = meta.avatarUrl;

    await tx.userXp.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: {
        guildId,
        userId,
        totalXp: newTotalXp,
        level: newLevel,
        ...(source === "message"
          ? { lastMessageXpAt: now, messagesCounted: 1 }
          : { lastReactionXpAt: now, reactionsCounted: 1 }),
        ...meta,
      },
      update: updateData,
    });

    return { didLevelUp, oldLevel, newLevel };
  });

  return result;
}

/**
 * Send level-up announcement to configured channel
 * @param {object} client
 * @param {string} guildId
 * @param {string} channelId
 * @param {object} user
 * @param {object|null} member
 * @param {number} oldLevel
 * @param {number} newLevel
 */
async function sendLevelUpAnnouncement(
  client,
  guildId,
  channelId,
  user,
  member,
  oldLevel,
  newLevel,
) {
  if (!channelId) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  const perms = channel.permissionsFor(client.user);
  if (!perms?.has("SendMessages")) return;

  const displayName = member
    ? member.displayName || user.username
    : user.username;

  const avatarUrl = member
    ? member.displayAvatarURL({ dynamic: true, size: 128 })
    : user.displayAvatarURL({ dynamic: true, size: 128 });

  try {
    let levelUpCardBuffer = null;
    try {
      const { createLevelUpCard } = require("./levelUpCard");
      levelUpCardBuffer = await createLevelUpCard({
        avatarUrl: avatarUrl || undefined,
        oldLevel,
        newLevel,
        displayName,
      });
    } catch {
      // Canvas failed, fallback to embed only
    }

    const content = `🎉 **${displayName}** has reached **Level ${newLevel}**! Thanks for keeping the alliance active!`;

    if (levelUpCardBuffer) {
      await channel.send({
        content,
        files: [
          {
            attachment: levelUpCardBuffer,
            name: `level-up-${user.id}.png`,
          },
        ],
      });
    } else {
      // Fallback embed
      const { EmbedBuilder } = require("discord.js");
      const embed = new EmbedBuilder()
        .setTitle("🎉 Level Up!")
        .setDescription(
          `${user} has reached **Level ${newLevel}**!\n` +
            `Level ${oldLevel} ➜ Level ${newLevel}`,
        )
        .setColor(0x00cccc)
        .setThumbnail(avatarUrl || null)
        .setTimestamp()
        .setFooter({ text: "Discore XP • Keep the alliance active!" });

      await channel.send({ content, embeds: [embed] });
    }
  } catch (err) {
    logger.warn("Level-up announcement failed", {
      guildId,
      channelId,
      error: err.message,
    });
  }
}

/**
 * Get user XP stats for commands/profile
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function getUserXpStats(guildId, userId) {
  const userXp = await prisma.userXp.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });

  if (!userXp) {
    // Return default empty stats
    return {
      totalXp: 0,
      level: 1,
      messagesCounted: 0,
      reactionsCounted: 0,
      progress: {
        progressPercent: 0,
        progressXp: 0,
        nextLevelXp: getXpForNextLevel(1),
      },
    };
  }

  const progress = getProgressToNextLevel(userXp.totalXp);

  return {
    totalXp: userXp.totalXp,
    level: userXp.level,
    messagesCounted: userXp.messagesCounted,
    reactionsCounted: userXp.reactionsCounted,
    displayName: userXp.displayName,
    userTag: userXp.userTag,
    avatarUrl: userXp.avatarUrl,
    progress,
  };
}

/**
 * Get user's overall rank in a guild by total XP
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<number>} rank position (1-based)
 */
async function getUserXpRank(guildId, userId) {
  const userXp = await prisma.userXp.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: { totalXp: true },
  });

  if (!userXp) return 0;

  const count = await prisma.userXp.count({
    where: {
      guildId,
      totalXp: { gt: userXp.totalXp },
    },
  });

  return count + 1;
}

/**
 * Get leaderboard data for a guild
 * @param {string} guildId
 * @param {'overall'|'daily'|'weekly'|'monthly'} period
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function getLeaderboard(guildId, period = "overall", limit = 10) {
  if (period === "overall") {
    const rows = await prisma.userXp.findMany({
      where: { guildId },
      orderBy: { totalXp: "desc" },
      take: limit,
      select: {
        userId: true,
        totalXp: true,
        level: true,
        displayName: true,
        userTag: true,
        avatarUrl: true,
      },
    });
    return rows.map((r) => ({
      userId: r.userId,
      totalXp: r.totalXp,
      level: r.level,
      displayName: r.displayName,
      userTag: r.userTag,
      avatarUrl: r.avatarUrl,
    }));
  }

  // Daily/weekly/monthly: aggregate UserXpEvent
  const dateRange = getDateRange(period);

  const rows = await prisma.userXpEvent.groupBy({
    by: ["userId"],
    where: {
      guildId,
      createdAt: {
        gte: dateRange.start,
        lte: dateRange.end,
      },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: limit,
  });

  // For period leaderboards, we need levels from UserXp
  const userIds = rows.map((r) => r.userId);
  const xpRows = await prisma.userXp.findMany({
    where: { guildId, userId: { in: userIds } },
    select: {
      userId: true,
      level: true,
      displayName: true,
      userTag: true,
      avatarUrl: true,
    },
  });

  const xpMap = new Map(xpRows.map((r) => [r.userId, r]));

  return rows.map((r) => {
    const xp = xpMap.get(r.userId);
    return {
      userId: r.userId,
      totalXp: r._sum.amount || 0,
      level: xp?.level || 1,
      displayName: xp?.displayName,
      userTag: xp?.userTag,
      avatarUrl: xp?.avatarUrl,
    };
  });
}

/**
 * Get period XP for a specific user
 * @param {string} guildId
 * @param {string} userId
 * @param {'daily'|'weekly'|'monthly'} period
 * @returns {Promise<number>}
 */
async function getUserPeriodXp(guildId, userId, period) {
  const dateRange = getDateRange(period);
  const result = await prisma.userXpEvent.aggregate({
    where: {
      guildId,
      userId,
      createdAt: {
        gte: dateRange.start,
        lte: dateRange.end,
      },
    },
    _sum: { amount: true },
  });
  return result._sum.amount || 0;
}

/**
 * Get date range for a period
 */
function getDateRange(period) {
  const now = new Date();
  let start;

  switch (period) {
    case "daily": {
      start = new Date(now);
      start.setUTCHours(0, 0, 0, 0);
      break;
    }
    case "weekly": {
      start = new Date(now);
      const day = start.getUTCDay();
      const diff = start.getUTCDate() - day;
      start.setUTCDate(diff);
      start.setUTCHours(0, 0, 0, 0);
      break;
    }
    case "monthly": {
      start = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
      break;
    }
    default:
      start = new Date(0);
  }

  return { start, end: now };
}

/**
 * Post weekly top 10 leaderboard
 * @param {object} client - Discord client
 * @returns {Promise<number>} number of guilds posted
 */
async function postWeeklyTop10(client) {
  let postedCount = 0;

  // Find all guilds with weeklyTop10Enabled and a channel set
  const configs = await prisma.guildXpConfig.findMany({
    where: {
      weeklyTop10Enabled: true,
      weeklyLeaderboardChannelId: { not: null },
    },
  });

  for (const config of configs) {
    try {
      // Check if already posted this week
      const weekStart = getDateRange("weekly").start;
      if (
        config.lastWeeklyLeaderboardPostAt &&
        new Date(config.lastWeeklyLeaderboardPostAt) >= weekStart
      ) {
        continue; // Already posted this week
      }

      const guild = client.guilds.cache.get(config.guildId);
      if (!guild) continue;

      const channel = guild.channels.cache.get(
        config.weeklyLeaderboardChannelId,
      );
      if (!channel?.isTextBased()) continue;

      const perms = channel.permissionsFor(client.user);
      if (!perms?.has("SendMessages") || !perms?.has("EmbedLinks")) continue;

      const leaderboard = await getLeaderboard(config.guildId, "weekly", 10);

      if (leaderboard.length === 0) continue;

      const { EmbedBuilder } = require("discord.js");

      const lines = leaderboard
        .map(
          (entry, index) =>
            `**#${index + 1}** ${entry.displayName || entry.userTag || entry.userId} — **${formatXp(entry.totalXp)} XP**`,
        )
        .join("\n");

      const embed = new EmbedBuilder()
        .setTitle("🏆 Weekly XP Top 10")
        .setDescription(lines || "No XP earned this week.")
        .setColor(0x00cccc)
        .setFooter({
          text: "Discore XP • Keep the server alive, goblins.",
        })
        .setTimestamp();

      await channel.send({ embeds: [embed] });

      // Update last posted
      await prisma.guildXpConfig.update({
        where: { guildId: config.guildId },
        data: { lastWeeklyLeaderboardPostAt: new Date() },
      });

      postedCount++;
    } catch (err) {
      logger.warn("Weekly top 10 post failed for guild", {
        guildId: config.guildId,
        error: err.message,
      });
    }
  }

  return postedCount;
}

module.exports = {
  handleMessageXp,
  handleReactionXp,
  getUserXpStats,
  getUserXpRank,
  getLeaderboard,
  getUserPeriodXp,
  postWeeklyTop10,
  sendLevelUpAnnouncement,
};
