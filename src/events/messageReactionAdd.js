"use strict";

const {
  trackReaction,
} = require("../modules/player/services/userActivityService");

module.exports = {
  name: "messageReactionAdd",
  async execute(reaction, user, client) {
    // Ignore bots
    if (user.bot) return;

    // Ignore DMs
    if (!reaction.message.guild) return;

    // Track user activity
    try {
      const emoji = reaction.emoji.name || reaction.emoji.id;
      await trackReaction(reaction.message.guild.id, user.id, emoji);
    } catch (error) {
      // Silently fail - activity tracking is not critical
      console.error("[Reaction Activity Tracking]", error.message);
    }
  },
};
