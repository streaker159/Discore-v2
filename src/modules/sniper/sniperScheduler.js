"use strict";

const logger = require("../../lib/logger");
const prisma = require("../../lib/prisma");

const DEBUG = process.env.DEBUG_SNIPER_CHALLENGE === "true";

/**
 * Generate a random delay between min and max (in milliseconds).
 */
function randomDelay(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Get all configs that are enabled, not paused, and due for a challenge.
 * Returns empty array if the table doesn't exist yet.
 */
async function getDueConfigs() {
  try {
    const now = new Date();
    return await prisma.sniperChallengeConfig.findMany({
      where: {
        enabled: true,
        paused: false,
        nextRunAt: { lte: now },
      },
    });
  } catch (err) {
    // Table may not exist yet (before migration/prisma db push)
    if (DEBUG) {
      logger.warn(
        "[SniperChallenge] getDueConfigs failed (table may not exist)",
        {
          error: err.message,
        },
      );
    }
    return [];
  }
}

/**
 * Recover configs on bot restart.
 * - Recalculate nextRunAt for any enabled/not-paused configs that have null or past dates.
 * - Mark expired active runs.
 */
async function recoverOnStartup(client) {
  try {
    const { markExpiredRuns, handleExpiry } = require("./sniperService");

    // Mark expired active runs
    let expiredRuns = [];
    try {
      expiredRuns = await markExpiredRuns();
    } catch (err) {
      if (DEBUG) {
        logger.warn("[SniperChallenge] markExpiredRuns failed", {
          error: err.message,
        });
      }
    }

    // Handle expired runs — disable their buttons
    for (const run of expiredRuns) {
      await handleExpiry(run, client).catch(() => {});
    }

    // Recalculate nextRunAt for configs that need it
    let activeConfigs = [];
    try {
      activeConfigs = await prisma.sniperChallengeConfig.findMany({
        where: {
          enabled: true,
          paused: false,
        },
      });
    } catch (err) {
      if (DEBUG) {
        logger.warn("[SniperChallenge] findMany configs failed", {
          error: err.message,
        });
      }
    }

    for (const config of activeConfigs) {
      if (!config.nextRunAt || config.nextRunAt <= new Date()) {
        const delay = randomDelay(config.minDelayMs, config.maxDelayMs);
        const nextRunAt = new Date(Date.now() + delay);
        await prisma.sniperChallengeConfig
          .update({
            where: { id: config.id },
            data: { nextRunAt },
          })
          .catch(() => {});
        if (DEBUG) {
          logger.info(
            "[SniperChallenge] Startup recovery: scheduled next run",
            { guildId: config.guildId, nextRunAt },
          );
        }
      }
    }

    const count = activeConfigs.length;
    if (count > 0) {
      logger.info(`[SniperChallenge] Loaded ${count} enabled guild configs`);
    }
  } catch (err) {
    logger.error("[SniperChallenge] Startup recovery error", {
      error: err.message,
    });
  }
}

module.exports = {
  randomDelay,
  getDueConfigs,
  recoverOnStartup,
};
