"use strict";

const {
  trackMessage,
} = require("../modules/player/services/userActivityService");
const { handleDiscoreMention } = require("../modules/ai/service");
const {
  isConversationContinuation,
  addTurn,
} = require("../modules/ai/conversationMemory");

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
    const guildId = message.guild.id;
    const userId = message.author.id;
    const channelId = message.channel.id;

    const botMentioned = message.mentions.has(client.user);

    // Check if this is a continuation of a recent conversation (reply or correction)
    const isContinuation =
      !botMentioned &&
      isConversationContinuation({ guildId, channelId, userId, message });

    if (!botMentioned && !isContinuation) return;

    // Strip mention and clean content
    const content = message.content
      .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
      .trim();

    if (!content) return; // Empty mention — ignore

    // Store this turn before handling
    addTurn({
      guildId,
      channelId,
      userId,
      role: "user",
      content: content.substring(0, 200),
      messageId: message.id,
    });

    await handleDiscoreMention({
      message,
      client,
      guildId,
      userId,
      channelId,
      content: `User: ${message.author.username}\nMessage: ${content}`,
    });
  },
};
