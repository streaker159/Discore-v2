"use strict";

const logger = require("../lib/logger");
const { postWeeklyTop10 } = require("../modules/xp/xpService");

/**
 * Weekly XP top 10 leaderboard posting job.
 * Runs every hour, checks if it's time (Sunday), and posts if needed.
 */
module.exports = {
  name: "xpWeeklyLeaderboard",
  // Run every hour at :05
  schedule: "5 * * * *",
  async execute(client) {
    try {
      // Only run on Sunday
      const now = new Date();
      if (now.getUTCDay() !== 0) return;

      // Only run during reasonable hours (UTC 8-22) to avoid mid-night spam
      const hour = now.getUTCHours();
      if (hour < 8 || hour > 22) return;

      const postedCount = await postWeeklyTop10(client);
      if (postedCount > 0) {
        logger.info("Weekly XP top 10 posted", { guilds: postedCount });
      }
    } catch (err) {
      logger.error("Weekly XP leaderboard job error", {
        error: err.message,
      });
    }
  },
};
