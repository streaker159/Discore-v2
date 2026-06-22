"use strict";

const {
  trackMessage,
} = require("../modules/player/services/userActivityService");

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    // Ignore bots
    if (message.author.bot) return;

    // Ignore DMs
    if (!message.guild) return;

    // Track user activity
    try {
      await trackMessage(
        message.guild.id,
        message.author.id,
        message.channel.id,
      );
    } catch (error) {
      // Silently fail - activity tracking is not critical
      console.error("[Message Activity Tracking]", error.message);
    }
  },
};
