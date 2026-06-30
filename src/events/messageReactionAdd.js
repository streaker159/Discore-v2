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

// ── Configuration ─────────────────────────────────────────────────────
const DEBUG = process.env.DEBUG_AI_TRANSLATION === "true";
const OWNER_DEBUG_CHANNEL = "1367326139109871738";
const DEBUG_SEND_COOLDOWN_MS = 5000;

// ── Owner debug notification (rate-limited) ────────────────────────────
let _lastDebugSend = 0;
let _debugClient = null;

function ownerDebugLog(text) {
  if (!DEBUG) return;
  console.log("[AI_TRANSLATE_DEBUG]", text);
}

function ownerDebugSend(client, text) {
  if (!DEBUG) return;
  if (!client?.isReady()) return;

  const now = Date.now();
  if (now - _lastDebugSend < DEBUG_SEND_COOLDOWN_MS) return;
  _lastDebugSend = now;

  const channel = client.channels.cache.get(OWNER_DEBUG_CHANNEL);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("🔍 AI Translate Debug")
    .setDescription(
      typeof text === "string" ? text : JSON.stringify(text, null, 2),
    )
    .setColor(0x3498db)
    .setTimestamp();

  channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = {
  name: "messageReactionAdd",

  async execute(reaction, user, client) {
    // ── UNCONDITIONAL first-line log ──────────────────────────────────
    // This MUST fire before any return statement so we know the event works.
    const guildId = reaction.message.guild?.id || null;
    const emojiName = reaction.emoji?.name || null;
    const emojiId = reaction.emoji?.id || null;
    const emojiIdentifier = reaction.emoji?.identifier || null;

    ownerDebugLog(
      `messageReactionAdd FIRED | guild=${guildId || "DM"} channel=${reaction.message.channelId} message=${reaction.message.id} user=${user.id} bot=${user.bot} emojiName=${emojiName} emojiId=${emojiId} emojiIdentifier=${emojiIdentifier} reactionPartial=${!!reaction.partial} messagePartial=${!!reaction.message.partial}`,
    );

    // ── Early return: bot user ────────────────────────────────────────
    if (user.bot) {
      ownerDebugLog(`STOP: bot user ignored | user=${user.id}`);
      return;
    }

    // ── Early return: not in a guild ──────────────────────────────────
    if (!guildId) {
      ownerDebugLog(`STOP: DM (no guild) | user=${user.id}`);
      return;
    }

    // ── Track user activity (non-critical) ────────────────────────────
    try {
      const emoji = reaction.emoji.name || reaction.emoji.id;
      await trackReaction(guildId, user.id, emoji);
    } catch {
      // Silently fail
    }

    // ── AI Translation ────────────────────────────────────────────────
    try {
      // ── Flag detection ──────────────────────────────────────────────
      const flagInfo = getLanguageForFlag(emojiName);

      if (!flagInfo) {
        ownerDebugLog(
          `STOP: unsupported emoji | raw="${emojiName}" guild=${guildId} channel=${reaction.message.channelId}`,
        );
        return; // No credit consumed
      }

      ownerDebugLog(
        `FLAG MATCHED | raw="${emojiName}" code=${flagInfo.code} language=${flagInfo.language} emoji=${flagInfo.emoji} guild=${guildId}`,
      );

      // ── Fetch full message if partial ───────────────────────────────
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch {
          ownerDebugLog(
            `STOP: reaction fetch failed | guild=${guildId} channel=${reaction.message.channelId}`,
          );
          return;
        }
      }
      if (reaction.message.partial) {
        try {
          await reaction.message.fetch();
        } catch {
          ownerDebugLog(
            `STOP: message fetch failed | guild=${guildId} messageId=${reaction.message.id}`,
          );
          return;
        }
      }

      // ── Check: message has content ──────────────────────────────────
      if (!reaction.message.content && !reaction.message.embeds?.length) {
        ownerDebugLog(
          `STOP: no content to translate | guild=${guildId} messageId=${reaction.message.id}`,
        );
        return;
      }

      // ── Check: not bot's own message (avoid loops) ──────────────────
      if (reaction.message.author?.id === client.user?.id) {
        ownerDebugLog(
          `STOP: own message | guild=${guildId} messageId=${reaction.message.id}`,
        );
        return;
      }

      // ── Extract text content ────────────────────────────────────────
      let content = reaction.message.content || "";
      if (!content.trim() && reaction.message.embeds?.length) {
        content = reaction.message.embeds
          .map((e) => e.description || e.title || "")
          .filter(Boolean)
          .join("\n");
      }
      if (!content.trim()) {
        ownerDebugLog(
          `STOP: no useful text content | guild=${guildId} messageId=${reaction.message.id}`,
        );
        return;
      }

      ownerDebugLog(`CONTENT OK | length=${content.length} guild=${guildId}`);

      // ── Permission check ────────────────────────────────────────────
      const channel = reaction.message.channel;
      const botPerms = channel.permissionsFor(client.user);
      if (!botPerms?.has("SendMessages")) {
        ownerDebugLog(
          `STOP: missing SEND_MESSAGES | guild=${guildId} channel=${channel.id}`,
        );
        return;
      }
      if (!botPerms?.has("EmbedLinks")) {
        ownerDebugLog(
          `STOP: missing EMBED_LINKS | guild=${guildId} channel=${channel.id}`,
        );
        return;
      }

      ownerDebugLog(`PERMS OK | guild=${guildId} channel=${channel.id}`);

      // ── Check AI enabled ────────────────────────────────────────────
      const prisma = require("../lib/prisma");
      const premium = await prisma.guildPremium.findUnique({
        where: { guildId },
        select: { aiTranslationEnabled: true, aiEnabled: true },
      });

      if (!premium || premium.aiEnabled === false) {
        ownerDebugLog(`STOP: AI disabled | guild=${guildId}`);
        return;
      }

      if (!premium.aiTranslationEnabled) {
        ownerDebugLog(`STOP: translation disabled | guild=${guildId}`);
        return;
      }

      ownerDebugLog(`AI ENABLED | guild=${guildId} translation=true`);

      // ── Credit check ────────────────────────────────────────────────
      const { canUseAi } = require("../modules/premium/service");
      const gate = await canUseAi(guildId, user.id, 1);

      if (!gate.ok) {
        ownerDebugLog(
          `STOP: credit blocked | reason=${gate.reason} guild=${guildId} user=${user.id}`,
        );

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
        return; // No credit consumed
      }

      ownerDebugLog(`CREDITS OK | guild=${guildId}`);

      // ── Attempt translation ─────────────────────────────────────────
      ownerDebugLog(
        `AI CALL START | guild=${guildId} lang=${flagInfo.language} contentLen=${content.length}`,
      );

      const result = await translateMessage({
        guildId,
        userId: user.id,
        messageContent: content,
        targetEmoji: emojiName,
      });

      if (!result.success) {
        ownerDebugLog(
          `STOP: AI failed | error=${result.error} guild=${guildId}`,
        );

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
        return;
      }

      ownerDebugLog(
        `AI CALL OK | guild=${guildId} translationLen=${result.translation?.length}`,
      );

      // ── Build embed response ────────────────────────────────────────
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

      ownerDebugLog(
        `SENT | guild=${guildId} channel=${channel.id} lang=${flagInfo.language}`,
      );

      // Also send a mini debug notification to owner channel
      ownerDebugSend(
        client,
        [
          `**Translation sent**`,
          `Guild: ${guildId}`,
          `Channel: <#${channel.id}>`,
          `Language: ${flagInfo.emoji} ${flagInfo.language}`,
          `Content length: ${content.length}`,
          `Translation length: ${result.translation.length}`,
          `User: <@${user.id}>`,
        ].join("\n"),
      );
    } catch (err) {
      console.error("[AI Translation] Error:", err.message);
      ownerDebugLog(`EXCEPTION: ${err.message} | guild=${guildId}`);
    }
  },
};
