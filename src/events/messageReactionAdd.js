"use strict";

const {
  trackReaction,
} = require("../modules/player/services/userActivityService");
const { getLanguageForFlag } = require("../modules/ai/flagLanguages");
const {
  translateMessage,
  canSendCreditError,
} = require("../modules/ai/translation");
const { EmbedBuilder } = require("discord.js");

// ── Debug logging ────────────────────────────────────────────────────
const DEBUG = process.env.DEBUG_SCOREBOARDS === "true";
function debugLog(...args) {
  if (DEBUG) console.log("[Reaction::Debug]", ...args);
}

module.exports = {
  name: "messageReactionAdd",

  async execute(reaction, user, client) {
    const guildId = reaction.message.guild?.id || null;

    // ── Log: every reaction received ────────────────────────────────
    debugLog("reaction received", {
      rawEmojiName: reaction.emoji?.name,
      emojiId: reaction.emoji?.id || null,
      guildId,
      channelId: reaction.message.channelId,
      messageId: reaction.message.id,
      userId: user.id,
      isBot: user.bot,
    });

    // ── Early return: bot user ───────────────────────────────────────
    if (user.bot) {
      debugLog("early return: bot user", { userId: user.id });
      return;
    }

    // ── Early return: not in a guild ─────────────────────────────────
    if (!guildId) {
      debugLog("early return: DM (no guild)", { userId: user.id });
      return;
    }

    // ── Track user activity (non-critical) ────────────────────────────
    try {
      const emoji = reaction.emoji.name || reaction.emoji.id;
      await trackReaction(guildId, user.id, emoji);
    } catch {
      // Silently fail — activity tracking is not critical
    }

    // ── AI Translation ───────────────────────────────────────────────
    try {
      const emojiName = reaction.emoji?.name || reaction.emoji?.id || "";

      // ── Flag detection via new bulletproof system ──────────────────
      const flagInfo = getLanguageForFlag(emojiName);

      if (!flagInfo) {
        debugLog("unsupported flag or non-flag emoji", {
          rawEmojiName: emojiName,
          reason: "no_flag_match",
        });
        return; // Not a supported flag — no credit consumed
      }

      debugLog("supported flag detected", {
        rawEmojiName: emojiName,
        normalizedCode: flagInfo.code,
        mappedLanguage: flagInfo.language,
        displayEmoji: flagInfo.emoji,
      });

      // ── Fetch full message if partial ──────────────────────────────
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch {
          debugLog("early return: reaction fetch failed");
          return;
        }
      }
      if (reaction.message.partial) {
        try {
          await reaction.message.fetch();
        } catch {
          debugLog("early return: message fetch failed", {
            messageId: reaction.message.id,
          });
          return;
        }
      }

      // ── Check: message has content ─────────────────────────────────
      if (!reaction.message.content && !reaction.message.embeds?.length) {
        debugLog("early return: no content to translate", {
          messageId: reaction.message.id,
        });
        return;
      }

      // ── Check: not bot's own message (avoid loops) ─────────────────
      if (reaction.message.author?.id === client.user?.id) {
        debugLog("early return: own message, skipping", {
          messageId: reaction.message.id,
        });
        return;
      }

      // ── Extract text content ───────────────────────────────────────
      let content = reaction.message.content || "";
      if (!content.trim() && reaction.message.embeds?.length) {
        content = reaction.message.embeds
          .map((e) => e.description || e.title || "")
          .filter(Boolean)
          .join("\n");
      }
      if (!content.trim()) {
        debugLog("early return: no useful text content", {
          messageId: reaction.message.id,
        });
        return;
      }

      debugLog("content extracted", {
        contentLength: content.length,
      });

      // ── Permission check: bot must be able to send in channel ──────
      const channel = reaction.message.channel;
      const botPerms = channel.permissionsFor(client.user);
      if (!botPerms?.has("SendMessages")) {
        debugLog("early return: missing SEND_MESSAGES permission", {
          channelId: channel.id,
        });
        return;
      }
      if (!botPerms?.has("EmbedLinks")) {
        debugLog("early return: missing EMBED_LINKS permission", {
          channelId: channel.id,
        });
        return;
      }

      debugLog("permission check passed");

      // ── Check translation enabled ───────────────────────────────────
      const prisma = require("../lib/prisma");
      const premium = await prisma.guildPremium.findUnique({
        where: { guildId },
        select: { aiTranslationEnabled: true, aiEnabled: true },
      });

      debugLog("premium check", {
        aiEnabled: premium?.aiEnabled !== false,
        aiTranslationEnabled: !!premium?.aiTranslationEnabled,
      });

      if (!premium || premium.aiEnabled === false) {
        debugLog("early return: AI disabled for guild");
        return;
      }

      if (!premium.aiTranslationEnabled) {
        debugLog("early return: translation disabled for guild");
        return;
      }

      // ── Credit check ────────────────────────────────────────────────
      const { canUseAi } = require("../modules/premium/service");
      const gate = await canUseAi(guildId, user.id, 1);

      debugLog("credit gate result", {
        ok: gate.ok,
        reason: gate.reason || null,
      });

      if (!gate.ok) {
        if (gate.reason === "no_credits" && canSendCreditError(guildId)) {
          await channel
            .send({
              content: `${user}, AI translation is enabled, but this server has no AI credits available.`,
            })
            .catch(() => {});
        } else if (
          gate.reason === "cooldown" ||
          gate.reason === "server_daily_limit" ||
          gate.reason === "user_daily_limit"
        ) {
          await channel.send({ content: gate.message }).catch(() => {});
        }
        debugLog("early return: credit/limit blocked", {
          reason: gate.reason,
        });
        return; // No credit consumed
      }

      // ── Attempt translation ─────────────────────────────────────────
      debugLog("AI translation: starting AI call", {
        contentLength: content.length,
        targetLanguage: flagInfo.language,
      });

      const result = await translateMessage({
        guildId,
        userId: user.id,
        messageContent: content,
        targetEmoji: emojiName,
      });

      debugLog("AI translation: result", {
        success: result.success,
        error: result.error || null,
        targetLang: result.targetLang || null,
        translationLength: result.translation?.length || null,
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
        debugLog("AI translation: sent fallback error message", {
          error: result.error,
        });
        return;
      }

      // ── Build embed response ─────────────────────────────────────────
      const embed = new EmbedBuilder()
        .setTitle(`${flagInfo.emoji} ${flagInfo.language} Translation`)
        .setDescription(result.translation)
        .setColor(0x1a7a9e)
        .setFooter({ text: "Discore Official AI Translation" })
        .setTimestamp();

      // ── Send reply ──────────────────────────────────────────────────
      await channel.send({
        content: `${user} here is your translation:`,
        embeds: [embed],
      });

      debugLog("AI translation: sent successfully", {
        guildId,
        channelId: channel.id,
        messageId: reaction.message.id,
        userId: user.id,
        language: flagInfo.language,
      });
    } catch (err) {
      console.error("[AI Translation] Error:", err.message);
      debugLog("AI translation: unexpected error", {
        error: err.message,
        stack: err.stack,
      });
    }
  },
};
