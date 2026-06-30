"use strict";

const {
  trackReaction,
} = require("../modules/player/services/userActivityService");
const {
  translateMessage,
  getLangFromFlag,
  canSendCreditError,
} = require("../modules/ai/translation");
const { EmbedBuilder } = require("discord.js");

const DEBUG = process.env.DEBUG_SCOREBOARDS === "true"; // reuse existing debug flag

function debugLog(...args) {
  if (DEBUG) console.log("[Translation::Debug]", ...args);
}

module.exports = {
  name: "messageReactionAdd",

  async execute(reaction, user, client) {
    // Ignore bots
    if (user.bot) return;

    // Ignore DMs
    if (!reaction.message.guild) return;

    const guildId = reaction.message.guild.id;

    // Track user activity
    try {
      const emoji = reaction.emoji.name || reaction.emoji.id;
      await trackReaction(guildId, user.id, emoji);
    } catch (error) {
      // Silently fail - activity tracking is not critical
    }

    // ── AI Translation ───────────────────────────────────────────
    try {
      const emojiStr = reaction.emoji.name || reaction.emoji.id;

      debugLog("reaction received", {
        guildId,
        channelId: reaction.message.channelId,
        messageId: reaction.message.id,
        emojiName: emojiStr,
        userId: user.id,
        isBot: user.bot,
      });

      // Check if emoji is a supported flag
      const lang = getLangFromFlag(emojiStr);
      if (!lang) return; // Not a supported flag — ignore silently

      debugLog("supported flag detected", { emojiStr, lang });

      // Fetch full message if partial
      if (reaction.partial) {
        await reaction.fetch().catch(() => null);
      }
      if (reaction.message.partial) {
        await reaction.message.fetch().catch(() => null);
      }
      if (!reaction.message.content && !reaction.message.embeds?.length) {
        debugLog("no content to translate");
        return;
      }

      // Don't translate the bot's own messages (avoid loops)
      if (reaction.message.author?.id === client.user?.id) {
        debugLog("own message, skipping");
        return;
      }

      // Extract text content
      let content = reaction.message.content || "";
      if (!content.trim() && reaction.message.embeds?.length) {
        content = reaction.message.embeds
          .map((e) => e.description || e.title || "")
          .filter(Boolean)
          .join("\n");
      }
      if (!content.trim()) {
        debugLog("no useful text content");
        return;
      }

      // Check bot can send in this channel
      const channel = reaction.message.channel;
      const botPerms = channel.permissionsFor(client.user);
      if (!botPerms?.has("SendMessages")) {
        debugLog("missing SEND_MESSAGES");
        return;
      }
      if (!botPerms?.has("EmbedLinks")) {
        debugLog("missing EMBED_LINKS");
        return;
      }

      // Attempt translation
      debugLog("attempting translation", { contentLength: content.length });
      const result = await translateMessage({
        guildId,
        userId: user.id,
        messageContent: content,
        targetEmoji: emojiStr,
      });

      debugLog("translation result", {
        success: result.success,
        error: result.error,
        targetLang: result.targetLang,
      });

      if (!result.success) {
        if (result.error === "no_credits" && canSendCreditError(guildId)) {
          await channel
            .send({
              content: `${user}, AI translation is enabled, but this server has no AI credits available.`,
            })
            .catch(() => {});
        } else if (
          result.error === "ai_failure" ||
          result.error === "ai_empty_response"
        ) {
          await channel
            .send({
              content: `${user}, I could not translate that message right now.`,
            })
            .catch(() => {});
        }
        // All other errors (disabled, unsupported, etc.) — silent
        return;
      }

      // Build embed response
      const embed = new EmbedBuilder()
        .setTitle(`${emojiStr} ${result.targetLang} Translation`)
        .setDescription(result.translation)
        .setColor(0x1a7a9e)
        .setFooter({ text: "Discore Official AI Translation" })
        .setTimestamp();

      // Send reply
      await channel.send({
        content: `${user} here is your translation:`,
        embeds: [embed],
      });

      debugLog("translation sent successfully");
    } catch (err) {
      console.error("[AI Translation] Error:", err.message);
    }
  },
};
