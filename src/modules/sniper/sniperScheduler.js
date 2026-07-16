"use strict";

const logger = require("../../lib/logger");
const db = require("./sniperDb");

const DEBUG = process.env.DEBUG_SNIPER_CHALLENGE === "true";

function randomDelay(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function getDueConfigs() {
  const now = new Date();
  return db.findConfigs({
    enabled: true,
    paused: false,
    nextRunAt: { lte: now },
  });
}

async function recoverOnStartup(client) {
  try {
    const { markExpiredRuns, handleExpiry } = require("./sniperService");

    let expiredRuns = [];
    try {
      expiredRuns = await markExpiredRuns();
    } catch (err) {
      if (DEBUG)
        logger.warn("[SniperChallenge] markExpiredRuns failed", {
          error: err.message,
        });
    }

    for (const run of expiredRuns) {
      await handleExpiry(run, client).catch(() => {});
    }

    let activeConfigs = [];
    try {
      activeConfigs = await db.findConfigs({ enabled: true, paused: false });
    } catch (err) {
      if (DEBUG)
        logger.warn("[SniperChallenge] findConfigs failed", {
          error: err.message,
        });
    }

    for (const config of activeConfigs) {
      if (!config.nextRunAt || config.nextRunAt <= new Date()) {
        const delay = randomDelay(config.minDelayMs, config.maxDelayMs);
        const nextRunAt = new Date(Date.now() + delay);
        await db.updateConfig(config.guildId, { nextRunAt });
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

module.exports = { randomDelay, getDueConfigs, recoverOnStartup };
