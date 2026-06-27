"use strict";

const {
  trackMessage,
} = require("../modules/player/services/userActivityService");
const { handleDiscoreMention } = require("../modules/ai/service");

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;

    // Track user activity
    try {
      await trackMessage(
        message.guild.id,
        message.author.id,
        message.channel.id,
      );
    } catch {
      // Non-critical
    }

    // ── Bot mention AI ──────────────────────────────────────────────────
    const botMentioned = message.mentions.has(client.user);
    if (!botMentioned) return;

    // Strip mention and clean content
    const content = message.content
      .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
      .trim();

    if (!content) return; // Empty mention — ignore

    await handleDiscoreMention({
      message,
      client,
      guildId: message.guild.id,
      userId: message.author.id,
      channelId: message.channel.id,
      content: `User: ${message.author.username}\nMessage: ${content}`,
    });
  },
};
