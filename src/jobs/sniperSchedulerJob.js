"use strict";

const logger = require("../lib/logger");
const db = require("../modules/sniper/sniperDb");
const {
  getDueConfigs,
  recoverOnStartup,
} = require("../modules/sniper/sniperScheduler");
const {
  spawnChallenge,
  markExpiredRuns,
  handleExpiry,
} = require("../modules/sniper/sniperService");

const CHECK_INTERVAL_MS = 30_000;
const DEBUG = process.env.DEBUG_SNIPER_CHALLENGE === "true";

let isRunning = false;

async function processDueChallenges(client) {
  if (isRunning) return;
  isRunning = true;

  try {
    const expiredRuns = await markExpiredRuns();

    for (const run of expiredRuns) {
      await handleExpiry(run, client).catch(() => {});
    }

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
        if (run && DEBUG) {
          logger.info("[SniperChallenge] Challenge spawned by scheduler", {
            guildId: config.guildId,
            runId: run.id,
          });
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

function startSniperScheduler(client) {
  logger.info(
    `[SniperChallenge] Starting scheduler — checking every ${CHECK_INTERVAL_MS / 1000}s`,
  );

  // Auto-create database tables on startup (no CLI needed)
  db.ensureTables()
    .then(() => {
      // Recovery after tables are guaranteed to exist
      return recoverOnStartup(client);
    })
    .catch((e) =>
      logger.error("[SniperChallenge] Startup recovery error", {
        error: e.message,
      }),
    )
    .finally(() => {
      // First run
      setTimeout(() => {
        processDueChallenges(client).catch((e) =>
          logger.error("[SniperChallenge] Initial run error", {
            error: e.message,
          }),
        );
      }, 5000);

      // Interval
      setInterval(() => {
        processDueChallenges(client).catch((e) =>
          logger.error("[SniperChallenge] Interval error", {
            error: e.message,
          }),
        );
      }, CHECK_INTERVAL_MS);
    });
}

module.exports = { startSniperScheduler };
