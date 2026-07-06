"use strict";

const prisma = require("../lib/prisma");
const logger = require("../lib/logger");
const {
  calculateNextRun,
  sendAutoPost,
  recordFailure,
  checkPremiumActive,
} = require("../modules/autopost/autoPostService");

let isRunning = false;
const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds

async function processDuePosts(client) {
  if (isRunning) return;
  isRunning = true;

  try {
    const now = new Date();

    // Find all active scheduled posts that are due
    const duePosts = await prisma.autoPost.findMany({
      where: {
        triggerType: "SCHEDULED",
        status: "ACTIVE",
        enabled: true,
        nextRunAt: { lte: now },
      },
    });

    if (duePosts.length === 0) return;

    logger.info(`[AutoPostScheduler] Processing ${duePosts.length} due posts`);

    for (const post of duePosts) {
      try {
        // Check premium still active
        const isPremium = await checkPremiumActive(post.guildId);
        if (!isPremium) {
          // Skip — premium expired, don't run but keep stored
          await prisma.autoPost.update({
            where: { id: post.id },
            data: { nextRunAt: null },
          });
          continue;
        }

        // Fetch guild for context
        const guild = client.guilds.cache.get(post.guildId);
        const memberCount = guild?.memberCount ?? 0;

        const result = await sendAutoPost(client, post, {
          serverName: guild?.name || "Server",
          memberCount: String(memberCount),
        });

        if (result.success) {
          // Update last run and calculate next
          const nextRun = calculateNextRun(post);
          await prisma.autoPost.update({
            where: { id: post.id },
            data: {
              lastRunAt: new Date(),
              nextRunAt: nextRun,
              failureCount: 0, // Reset failures on success
            },
          });
        } else {
          logger.warn(
            `[AutoPostScheduler] Failed to send post ${post.id}: ${result.error}`,
          );
          await recordFailure(post.id);
        }
      } catch (err) {
        logger.error(`[AutoPostScheduler] Error processing post ${post.id}`, {
          error: err.message,
        });
        await recordFailure(post.id).catch(() => {});
      }
    }
  } catch (err) {
    logger.error("[AutoPostScheduler] Error in scheduler loop", {
      error: err.message,
    });
  } finally {
    isRunning = false;
  }
}

/**
 * Start the auto post scheduler.
 * Called from jobLoader.
 */
function startAutoPostScheduler(client) {
  logger.info(
    `[AutoPostScheduler] Starting — checking every ${CHECK_INTERVAL_MS / 1000}s`,
  );

  // On startup, load active scheduled posts and recalculate nextRunAt for any that may have been missed
  async function recalcOnStartup() {
    try {
      const activeScheduled = await prisma.autoPost.findMany({
        where: {
          triggerType: "SCHEDULED",
          status: "ACTIVE",
          enabled: true,
        },
      });

      for (const post of activeScheduled) {
        // If nextRunAt is in the past (or null), recalculate
        if (!post.nextRunAt || post.nextRunAt <= new Date()) {
          // If lastRunAt was recent (within 60s), it was probably just sent before restart
          // so calculate the NEXT one after that
          let basePost = { ...post };
          if (
            post.lastRunAt &&
            Date.now() - post.lastRunAt.getTime() < CHECK_INTERVAL_MS * 2
          ) {
            null; // Will use lastRunAt as base
          }
          const nextRun = calculateNextRun(post);
          if (nextRun) {
            await prisma.autoPost
              .update({
                where: { id: post.id },
                data: { nextRunAt: nextRun },
              })
              .catch(() => {});
          }
        }
      }
    } catch (err) {
      logger.error("[AutoPostScheduler] Startup recalculation error", {
        error: err.message,
      });
    }
  }

  // Initial calculation
  recalcOnStartup();

  // First run immediately to catch any missed posts
  setTimeout(() => {
    processDuePosts(client).catch((e) =>
      logger.error("[AutoPostScheduler] Initial run error", {
        error: e.message,
      }),
    );
  }, 5000);

  // Then run on interval
  setInterval(() => {
    processDuePosts(client).catch((e) =>
      logger.error("[AutoPostScheduler] Interval error", { error: e.message }),
    );
  }, CHECK_INTERVAL_MS);
}

module.exports = { startAutoPostScheduler };
