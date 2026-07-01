"use strict";

const crypto = require("crypto");
const prisma = require("../../lib/prisma");
const logger = require("../../lib/logger");

const ADMIN_CHANNEL_ID =
  process.env.SAFE_ADMIN_CHANNEL_ID || "1521629955010859290";
const BOT_OWNER_IDS = process.env.BOT_OWNER_IDS || "462858253252952065";
// Use first owner from comma-separated list
const BOT_OWNER_ID = BOT_OWNER_IDS.split(",")[0].trim();
const MAX_ATTEMPTS_PER_DAY = 5;

// ── Helpers ───────────────────────────────────────────────

function getDateKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function getNextResetTimestamp() {
  const now = new Date();
  // Next UTC midnight
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
    ),
  );
  return Math.floor(next.getTime() / 1000);
}

function generateCode() {
  return String(crypto.randomInt(0, 10000)).padStart(4, "0");
}

// ── Daily limits ──────────────────────────────────────────

async function getDailyLimits(userId) {
  const dateKey = getDateKey();
  let limit = await prisma.safeVaultDailyLimit.findUnique({
    where: { userId_dateKey: { userId, dateKey } },
  });
  if (!limit) {
    limit = await prisma.safeVaultDailyLimit.create({
      data: { userId, dateKey, attemptsUsed: 0 },
    });
  }
  return limit;
}

async function incrementDailyAttempt(userId) {
  const dateKey = getDateKey();
  const limit = await prisma.safeVaultDailyLimit.upsert({
    where: { userId_dateKey: { userId, dateKey } },
    update: { attemptsUsed: { increment: 1 } },
    create: { userId, dateKey, attemptsUsed: 1 },
  });
  return limit;
}

// ── Round management ──────────────────────────────────────

async function getCurrentRound() {
  return prisma.safeVaultRound.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { generatedAt: "desc" },
  });
}

async function getPendingPrizeRound(userId) {
  return prisma.safeVaultRound.findFirst({
    where: {
      status: "PENDING_PRIZE",
      crackedByUserId: userId,
    },
    orderBy: { crackedAt: "desc" },
  });
}

async function getPendingPrizeRoundAny() {
  return prisma.safeVaultRound.findFirst({
    where: { status: "PENDING_PRIZE" },
    orderBy: { crackedAt: "desc" },
  });
}

async function getGlobalAttemptCount(roundId) {
  return prisma.safeVaultAttempt.count({
    where: { roundId },
  });
}

async function generateNewRound(client) {
  const code = generateCode();
  const round = await prisma.safeVaultRound.create({
    data: { code, status: "ACTIVE" },
  });

  logger.info("New safe vault code generated", { roundId: round.id });

  // Log to admin channel
  if (client) {
    try {
      const channel = await client.channels
        .fetch(ADMIN_CHANNEL_ID)
        .catch(() => null);
      if (channel) {
        const { buildAdminNewCodeEmbed } = require("./safeVaultEmbeds");
        const embed = buildAdminNewCodeEmbed(round.id, code, round.generatedAt);
        await channel
          .send({
            content: `<@${BOT_OWNER_ID}> New vault code generated.`,
            embeds: [embed],
          })
          .catch((e) =>
            logger.warn("Failed to send admin new-code embed", {
              error: e.message,
            }),
          );
      } else {
        logger.warn("Admin channel not found for new code log", {
          channelId: ADMIN_CHANNEL_ID,
        });
      }
    } catch (e) {
      logger.warn("Failed to log new code to admin channel", {
        error: e.message,
      });
    }
  }

  return round;
}

// ── Startup: ensure one active safe exists ────────────────

async function ensureActiveSafe(client) {
  // 1. Check for pending prize round
  const pendingPrize = await getPendingPrizeRoundAny();
  if (pendingPrize) {
    logger.info(
      "SafeVault: PENDING_PRIZE round exists, waiting for prize selection",
      { roundId: pendingPrize.id },
    );
    // Still ensure no ACTIVE round is leftover from a bug
  }

  // 2. Check active rounds
  const activeRounds = await prisma.safeVaultRound.findMany({
    where: { status: "ACTIVE" },
    orderBy: { generatedAt: "desc" },
  });

  if (activeRounds.length === 0 && !pendingPrize) {
    // No active and no pending prize - generate one
    logger.info("SafeVault: No active safe found, generating new round");
    await generateNewRound(client);
    return;
  }

  if (activeRounds.length === 1) {
    logger.info("SafeVault: One active safe exists", {
      roundId: activeRounds[0].id,
    });
    return;
  }

  // Multiple active rounds - keep newest, expire older
  if (activeRounds.length > 1) {
    const [newest, ...older] = activeRounds;
    logger.warn("SafeVault: Multiple active safes found — cleaning up", {
      kept: newest.id,
      expiring: older.map((r) => r.id),
    });

    for (const round of older) {
      await prisma.safeVaultRound.update({
        where: { id: round.id },
        data: { status: "EXPIRED" },
      });
    }

    // Log to admin channel
    if (client) {
      try {
        const channel = await client.channels
          .fetch(ADMIN_CHANNEL_ID)
          .catch(() => null);
        if (channel) {
          await channel
            .send({
              content: `⚠️ **SafeVault cleanup:** ${
                older.length
              } duplicate ACTIVE rounds expired. Kept: \`${newest.id}\`. Expired: ${older
                .map((r) => `\`${r.id}\``)
                .join(", ")}`,
            })
            .catch(() => {});
        }
      } catch {}
    }
  }
}

// ── Submit guess ──────────────────────────────────────────

/**
 * Submit a 4-digit guess for the active round.
 *
 * Returns an object:
 *   { success, correct, attemptsUsed, round, message }
 */
async function submitGuess(
  userId,
  userTag,
  displayName,
  guildId,
  guildName,
  code,
) {
  // Validate code format
  if (!/^\d{4}$/.test(code)) {
    return { success: false, correct: false, message: "INVALID_CODE" };
  }

  // Use a transaction for race condition protection
  return prisma.$transaction(async (tx) => {
    // Get current active round
    const round = await tx.safeVaultRound.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { generatedAt: "desc" },
    });

    if (!round) {
      return { success: false, correct: false, message: "NO_ACTIVE_ROUND" };
    }

    // Check daily limits
    const dateKey = getDateKey();
    let limit = await tx.safeVaultDailyLimit.findUnique({
      where: { userId_dateKey: { userId, dateKey } },
    });

    if (!limit) {
      limit = await tx.safeVaultDailyLimit.create({
        data: { userId, dateKey, attemptsUsed: 0 },
      });
    }

    if (limit.attemptsUsed >= MAX_ATTEMPTS_PER_DAY) {
      return {
        success: false,
        correct: false,
        message: "NO_ATTEMPTS_LEFT",
        attemptsUsed: limit.attemptsUsed,
      };
    }

    const correct = code === round.code;

    // Create attempt record
    await tx.safeVaultAttempt.create({
      data: {
        roundId: round.id,
        userId,
        userTag,
        displayName,
        guildId,
        guildName,
        guessedCode: code,
        correct,
      },
    });

    // Increment daily limit
    await tx.safeVaultDailyLimit.update({
      where: { id: limit.id },
      data: { attemptsUsed: { increment: 1 } },
    });

    const newAttemptsUsed = limit.attemptsUsed + 1;

    if (!correct) {
      return {
        success: true,
        correct: false,
        attemptsUsed: newAttemptsUsed,
        message: "WRONG_CODE",
      };
    }

    // Correct guess! Set round to PENDING_PRIZE with race condition protection
    const updateResult = await tx.safeVaultRound.updateMany({
      where: {
        id: round.id,
        status: "ACTIVE", // Only update if still ACTIVE
      },
      data: {
        status: "PENDING_PRIZE",
        crackedAt: new Date(),
        crackedByUserId: userId,
        crackedByUserTag: userTag,
        crackedByDisplayName: displayName,
        crackedInGuildId: guildId,
        crackedInGuildName: guildName,
        prizeStatus: "AWAITING_SELECTION",
      },
    });

    if (updateResult.count !== 1) {
      // Someone else cracked it milliseconds before
      logger.info(
        "SafeVault: Race condition - user submitted correct code but update count was 0",
        { userId, roundId: round.id },
      );
      return {
        success: true,
        correct: true,
        attemptsUsed: newAttemptsUsed,
        message: "RACE_LOST", // Code was correct but someone else won
      };
    }

    return {
      success: true,
      correct: true,
      attemptsUsed: newAttemptsUsed,
      roundId: round.id,
      message: "CRACKED",
    };
  });
}

// ── Prize selection ───────────────────────────────────────

async function selectPrize(roundId, userId, prizeValue) {
  const { PRIZES } = require("./safeVaultEmbeds");
  const validPrize = PRIZES.find((p) => p.value === prizeValue);
  if (!validPrize) {
    return { success: false, message: "INVALID_PRIZE" };
  }

  return prisma.$transaction(async (tx) => {
    const round = await tx.safeVaultRound.findUnique({
      where: { id: roundId },
    });

    if (!round) {
      return { success: false, message: "ROUND_NOT_FOUND" };
    }

    if (round.crackedByUserId !== userId) {
      return { success: false, message: "NOT_WINNER" };
    }

    if (round.status !== "PENDING_PRIZE") {
      return { success: false, message: "ALREADY_SELECTED" };
    }

    if (round.selectedPrize) {
      return { success: false, message: "PRIZE_ALREADY_SELECTED" };
    }

    const updatedRound = await tx.safeVaultRound.update({
      where: { id: roundId },
      data: {
        status: "CRACKED",
        selectedPrize: prizeValue,
        prizeStatus: "PENDING_CLAIM",
      },
    });

    return {
      success: true,
      round: updatedRound,
      prizeLabel: validPrize.label,
    };
  });
}

// ── Post-prize: generate new round ────────────────────────

async function finalizeAfterPrizeSelection(client, round) {
  const {
    buildAnnouncementEmbed,
    buildAdminCrackedEmbed,
    PRIZES,
    getPrizeLabel,
    OFFICIAL_INVITE,
  } = require("./safeVaultEmbeds");

  // 1. Try to DM winner
  let dmSuccess = false;
  try {
    const user = await client.users
      .fetch(round.crackedByUserId)
      .catch(() => null);
    if (user) {
      const dmEmbed = {
        embeds: [
          {
            color: 0x00ff00,
            title: "🏆 You cracked the Discore Vault!",
            description: `Your selected prize has been logged.\n\n**Prize:** ${getPrizeLabel(
              round.selectedPrize,
            )}\n\nTo claim it, join/contact the official Discore server:\n${OFFICIAL_INVITE}\n\nA Discore admin will review and hand out the prize.`,
          },
        ],
      };
      await user.send(dmEmbed).catch(() => {});
      dmSuccess = true;
    }
  } catch (e) {
    logger.warn("SafeVault: Failed to DM winner", {
      userId: round.crackedByUserId,
      error: e.message,
    });
  }

  // 2. Send admin log
  try {
    const channel = await client.channels
      .fetch(ADMIN_CHANNEL_ID)
      .catch(() => null);
    if (channel) {
      // Get attempts used
      const dateKey = getDateKey();
      const limit = await prisma.safeVaultDailyLimit.findUnique({
        where: {
          userId_dateKey: {
            userId: round.crackedByUserId,
            dateKey,
          },
        },
      });
      const attemptsUsed = limit?.attemptsUsed || "?";

      const adminEmbed = buildAdminCrackedEmbed({
        roundId: round.id,
        code: round.code,
        winnerId: round.crackedByUserId,
        winnerTag: round.crackedByUserTag,
        winnerDisplayName: round.crackedByDisplayName,
        guildName: round.crackedInGuildName,
        guildId: round.crackedInGuildId,
        channelId: "N/A",
        attemptsUsed,
        maxAttempts: MAX_ATTEMPTS_PER_DAY,
        selectedPrize: round.selectedPrize,
        crackedAt: round.crackedAt,
        ownerId: BOT_OWNER_ID,
      });

      await channel.send({
        content: `<@${BOT_OWNER_ID}> Vault prize claim pending.`,
        embeds: [adminEmbed],
      });
    }
  } catch (e) {
    logger.warn("SafeVault: Failed to log cracked to admin channel", {
      error: e.message,
    });
  }

  // 3. Global announcement
  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const guilds = [...client.guilds.cache.values()];
  for (const guild of guilds) {
    try {
      // Find announcement channel
      let channelId = null;
      try {
        const guildRecord = await prisma.guild.findUnique({
          where: { id: guild.id },
          select: { announcementChannelId: true },
        });
        channelId = guildRecord?.announcementChannelId;
      } catch {}

      if (!channelId) {
        skippedCount++;
        continue;
      }

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        skippedCount++;
        continue;
      }

      // Check permissions
      const perms = channel.permissionsFor(client.user);
      if (
        !perms?.has("ViewChannel") ||
        !perms?.has("SendMessages") ||
        !perms?.has("EmbedLinks")
      ) {
        skippedCount++;
        continue;
      }

      const { embed, attachment } = buildAnnouncementEmbed(
        round.crackedByDisplayName || round.crackedByUserTag || "Unknown",
        round.crackedInGuildName || "Unknown",
        getPrizeLabel(round.selectedPrize),
      );

      const payload = {
        content: "🏆 The Discore Vault has been cracked!",
        embeds: [embed],
      };

      if (attachment && perms.has("AttachFiles")) {
        payload.files = [attachment];
      }

      await channel.send(payload).catch(() => {
        failedCount++;
      });
      sentCount++;
    } catch {
      failedCount++;
    }
  }

  logger.info("SafeVault: Global announcement sent", {
    sent: sentCount,
    skipped: skippedCount,
    failed: failedCount,
  });

  // 4. Generate new round
  const newRound = await generateNewRound(client);

  return {
    dmSuccess,
    announcementStats: {
      sent: sentCount,
      skipped: skippedCount,
      failed: failedCount,
    },
    newRound,
  };
}

module.exports = {
  ADMIN_CHANNEL_ID,
  BOT_OWNER_ID,
  MAX_ATTEMPTS_PER_DAY,
  getDateKey,
  getNextResetTimestamp,
  generateCode,
  getDailyLimits,
  incrementDailyAttempt,
  getCurrentRound,
  getPendingPrizeRound,
  getPendingPrizeRoundAny,
  getGlobalAttemptCount,
  generateNewRound,
  ensureActiveSafe,
  submitGuess,
  selectPrize,
  finalizeAfterPrizeSelection,
};
