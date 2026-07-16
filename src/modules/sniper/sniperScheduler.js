"use strict";

const logger = require("../../lib/logger");
const prisma = require("../../lib/prisma");
const { spawnChallenge, markExpiredRuns } = require("./sniperService");

const DEBUG = process.env.DEBUG_SNIPER_CHALLENGE === "true";

/**
 * Generate a random delay between min and max (in milliseconds).
 */
function randomDelay(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Get all configs that are enabled, not paused, and due for a challenge.
 */
async function getDueConfigs() {
  const now = new Date();
  return prisma.sniperChallengeConfig.findMany({
    where: {
      enabled: true,
      paused: false,
      nextRunAt: { lte: now },
    },
  });
}

/**
 * Recover configs on bot restart.
 * - Recalculate nextRunAt for any enabled/not-paused configs that have null or past dates.
 * - Mark expired active runs.
 */
async function recoverOnStartup(client) {
  try {
    // Mark expired active runs
    const expiredRuns = await markExpiredRuns();

    // Handle expired runs — disable their buttons
    for (const run of expiredRuns) {
      const { handleExpiry } = require("./sniperService");
      await handleExpiry(run, client).catch(() => {});
    }

    // Recalculate nextRunAt for configs that need it
    const activeConfigs = await prisma.sniperChallengeConfig.findMany({
      where: {
        enabled: true,
        paused: false,
      },
    });

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
            {
              guildId: config.guildId,
              nextRunAt,
            },
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
