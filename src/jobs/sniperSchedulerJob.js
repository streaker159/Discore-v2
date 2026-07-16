"use strict";

const logger = require("../lib/logger");
const {
  getDueConfigs,
  recoverOnStartup,
} = require("../modules/sniper/sniperScheduler");
const {
  spawnChallenge,
  markExpiredRuns,
  handleExpiry,
} = require("../modules/sniper/sniperService");

const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds
const DEBUG = process.env.DEBUG_SNIPER_CHALLENGE === "true";

let isRunning = false;

async function processDueChallenges(client) {
  if (isRunning) return;
  isRunning = true;

  try {
    // First, mark any expired active runs
    const expiredRuns = await markExpiredRuns();

    // Handle expiry (edit messages to show expired)
    for (const run of expiredRuns) {
      await handleExpiry(run, client).catch(() => {});
    }

    // Get configs due for a new challenge
    const dueConfigs = await getDueConfigs();

    if (dueConfigs.length === 0) return;

    if (DEBUG) {
      logger.info(
        `[SniperChallenge] Processing ${dueConfigs.length} due challenges`,
      );
    }

    for (const config of dueConfigs) {
      try {
        const run = await spawnChallenge(config.guildId, client);

        if (run) {
          if (DEBUG) {
            logger.info("[SniperChallenge] Challenge spawned by scheduler", {
              guildId: config.guildId,
              runId: run.id,
            });
          }
        }
      } catch (err) {
        logger.error(
          `[SniperChallenge] Error spawning challenge for guild ${config.guildId}`,
          { error: err.message },
        );
      }
    }
  } catch (err) {
    logger.error("[SniperChallenge] Error in scheduler loop", {
      error: err.message,
    });
  } finally {
    isRunning = false;
  }
}

/**
 * Start the Sniper Challenge scheduler.
 * Called from jobLoader.
 */
function startSniperScheduler(client) {
  logger.info(
    `[SniperChallenge] Starting scheduler — checking every ${CHECK_INTERVAL_MS / 1000}s`,
  );

  // On startup, recover configs and clean up expired runs
  recoverOnStartup(client).catch((e) =>
    logger.error("[SniperChallenge] Startup recovery error", {
      error: e.message,
    }),
  );

  // First run immediately to catch any missed challenges
  setTimeout(() => {
    processDueChallenges(client).catch((e) =>
      logger.error("[SniperChallenge] Initial run error", {
        error: e.message,
      }),
    );
  }, 5000);

  // Then run on interval
  setInterval(() => {
    processDueChallenges(client).catch((e) =>
      logger.error("[SniperChallenge] Interval error", {
        error: e.message,
      }),
    );
  }, CHECK_INTERVAL_MS);
}

module.exports = { startSniperScheduler };
