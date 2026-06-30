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
const MUTED_COOLDOWN_MS = 4000; // 4s between unsupported-emoji STOP messages

// ── Debug embed sender (NO COOLDOWN — we need to see every step) ─────
let _lastMuted = 0;

async function sendDebug(client, title, description, color) {
  if (!DEBUG) return;
  if (!client?.isReady?.()) return;

  try {
    const channel = client.channels.cache.get(OWNER_DEBUG_CHANNEL);
    if (!channel?.isTextBased?.()) return;

    const { EmbedBuilder } = require("discord.js");
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(String(description).substring(0, 4096))
      .setColor(color || 0x3498db)
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
  } catch {}
}

module.exports = {
  name: "messageReactionAdd",

  async execute(reaction, user, client) {
    // ── Unconditional first-line log ─────────────────────────────────
    const guildId = reaction.message.guild?.id || null;
    const channelId = reaction.message.channelId || null;
    const messageId = reaction.message.id || null;
    const emojiName = reaction.emoji?.name || null;
    const emojiId = reaction.emoji?.id || null;
    const emojiIdentifier = reaction.emoji?.identifier || null;

    console.log(
      `[AI_TRANSLATE_DEBUG] REACTION FIRED | guild=${guildId || "DM"} channel=${channelId} message=${messageId} user=${user.id} bot=${user.bot} emojiName="${emojiName}" emojiId="${emojiId}" identifier="${emojiIdentifier}" reactionPartial=${!!reaction.partial} messagePartial=${!!reaction.message.partial}`,
    );

    // Send: event fired notification (always)
    await sendDebug(
      client,
      "⚡ Reaction Event Fired",
      [
        `**Guild:** ${guildId || "DM"}`,
        `**Channel:** <#${channelId}>`,
        `**Message:** \`${messageId}\``,
        `**User:** <@${user.id}> (\`${user.id}\`)`,
        `**Bot:** ${user.bot ? "Yes" : "No"}`,
        `**Emoji Name:** \`${emojiName}\``,
        `**Emoji ID:** \`${emojiId || "none"}\``,
        `**Identifier:** \`${emojiIdentifier || "none"}\``,
        `**Reaction Partial:** ${!!reaction.partial}`,
        `**Message Partial:** ${!!reaction.message.partial}`,
      ].join("\n"),
      0x9b59b6,
    );

    // ── Early return: bot user ───────────────────────────────────────
    if (user.bot) {
      await sendDebug(
        client,
        "🛑 STOP: Bot User",
        `User <@${user.id}> is a bot. Ignored.`,
        0xe74c3c,
      );
      return;
    }

    // ── Early return: not in a guild ─────────────────────────────────
    if (!guildId) {
      await sendDebug(
        client,
        "🛑 STOP: DM (No Guild)",
        `Reaction from <@${user.id}> in DMs. Ignored.`,
        0xe74c3c,
      );
      return;
    }

    // ── Track user activity (non-critical) ───────────────────────────
    try {
      const emoji = reaction.emoji.name || reaction.emoji.id;
      await trackReaction(guildId, user.id, emoji);
    } catch {}

    // ── AI Translation ───────────────────────────────────────────────
    try {
      // ── Flag detection ─────────────────────────────────────────────
      const flagInfo = getLanguageForFlag(emojiName);

      if (!flagInfo) {
        const now = Date.now();
        if (now - _lastMuted > MUTED_COOLDOWN_MS) {
          _lastMuted = now;
          await sendDebug(
            client,
            "🛑 STOP: Unsupported Emoji",
            [
              `**Raw emoji:** \`${emojiName}\``,
              `**Guild:** ${guildId}`,
              `**Channel:** <#${channelId}>`,
              `Emoji is not a supported flag or not mapped to a language.`,
            ].join("\n"),
            0xe67e22,
          );
        }
        return;
      }

      await sendDebug(
        client,
        "🏳️ Flag Matched",
        [
          `**Raw:** \`${emojiName}\``,
          `**Code:** ${flagInfo.code}`,
          `**Language:** ${flagInfo.language}`,
          `**Emoji:** ${flagInfo.emoji}`,
          `**Guild:** ${guildId}`,
        ].join("\n"),
        0x2ecc71,
      );

      // ── Fetch full message if partial ──────────────────────────────
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch {
          await sendDebug(
            client,
            "🛑 STOP: Reaction Fetch Failed",
            `Guild: ${guildId} | Channel: <#${channelId}>`,
            0xe74c3c,
          );
          return;
        }
      }
      if (reaction.message.partial) {
        try {
          await reaction.message.fetch();
        } catch {
          await sendDebug(
            client,
            "🛑 STOP: Message Fetch Failed",
            `Guild: ${guildId} | Message: \`${messageId}\``,
            0xe74c3c,
          );
          return;
        }
      }

      // ── Check: message has content ─────────────────────────────────
      if (!reaction.message.content && !reaction.message.embeds?.length) {
        await sendDebug(
          client,
          "🛑 STOP: No Content",
          [
            `**Guild:** ${guildId}`,
            `**Message:** \`${messageId}\``,
            `Message has no text content and no embeds.`,
            `This may indicate Message Content Intent is missing.`,
          ].join("\n"),
          0xe74c3c,
        );
        return;
      }

      // ── Check: not bot's own message ───────────────────────────────
      if (reaction.message.author?.id === client.user?.id) {
        await sendDebug(
          client,
          "🛑 STOP: Own Message",
          `Bot message. Skipping to avoid loop. Guild: ${guildId}`,
          0xe67e22,
        );
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
        await sendDebug(
          client,
          "🛑 STOP: No Useful Text",
          `Guild: ${guildId} | Message: \`${messageId}\` | Content after extraction is empty.`,
          0xe74c3c,
        );
        return;
      }

      // ── Permission check ───────────────────────────────────────────
      const channel = reaction.message.channel;
      const botPerms = channel.permissionsFor(client.user);

      if (!botPerms?.has("ViewChannel")) {
        await sendDebug(
          client,
          "🛑 STOP: Missing ViewChannel",
          `Guild: ${guildId} | Channel: <#${channel.id}>`,
          0xe74c3c,
        );
        return;
      }
      if (!botPerms?.has("ReadMessageHistory")) {
        await sendDebug(
          client,
          "🛑 STOP: Missing ReadMessageHistory",
          `Guild: ${guildId} | Channel: <#${channel.id}>`,
          0xe74c3c,
        );
        return;
      }
      if (!botPerms?.has("SendMessages")) {
        await sendDebug(
          client,
          "🛑 STOP: Missing SendMessages",
          `Guild: ${guildId} | Channel: <#${channel.id}>`,
          0xe74c3c,
        );
        return;
      }
      if (!botPerms?.has("EmbedLinks")) {
        await sendDebug(
          client,
          "🛑 STOP: Missing EmbedLinks",
          `Guild: ${guildId} | Channel: <#${channel.id}>`,
          0xe74c3c,
        );
        return;
      }

      // ── Check AI enabled ───────────────────────────────────────────
      const prisma = require("../lib/prisma");
      const premium = await prisma.guildPremium.findUnique({
        where: { guildId },
        select: { aiTranslationEnabled: true, aiEnabled: true },
      });

      if (!premium || premium.aiEnabled === false) {
        await sendDebug(
          client,
          "🛑 STOP: AI Disabled",
          `Guild: ${guildId} | aiEnabled: ${premium?.aiEnabled}, hasRecord: ${!!premium}`,
          0xe74c3c,
        );
        return;
      }

      if (!premium.aiTranslationEnabled) {
        await sendDebug(
          client,
          "🛑 STOP: Translation Disabled",
          `Guild: ${guildId} | aiTranslationEnabled: false`,
          0xe74c3c,
        );
        return;
      }

      // ── Credit check ───────────────────────────────────────────────
      const { canUseAi } = require("../modules/premium/service");
      const gate = await canUseAi(guildId, user.id, 1);

      if (!gate.ok) {
        await sendDebug(
          client,
          "🛑 STOP: Credit Blocked",
          [
            `**Guild:** ${guildId}`,
            `**User:** <@${user.id}>`,
            `**Reason:** ${gate.reason}`,
            `**Message:** ${gate.message || "N/A"}`,
          ].join("\n"),
          0xe74c3c,
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
        return;
      }

      // ── Attempt translation ────────────────────────────────────────
      await sendDebug(
        client,
        "🤖 AI Call Started",
        [
          `**Guild:** ${guildId}`,
          `**Language:** ${flagInfo.emoji} ${flagInfo.language}`,
          `**Content length:** ${content.length}`,
          `**Content preview:** ${content.substring(0, 100)}...`,
        ].join("\n"),
        0x3498db,
      );

      const result = await translateMessage({
        guildId,
        userId: user.id,
        messageContent: content,
        targetEmoji: emojiName,
      });

      if (!result.success) {
        await sendDebug(
          client,
          "🛑 STOP: AI Failed",
          [
            `**Guild:** ${guildId}`,
            `**Error:** ${result.error}`,
            `**Language:** ${flagInfo.language}`,
            `No credit consumed.`,
          ].join("\n"),
          0xe74c3c,
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

      // ── Send translation ───────────────────────────────────────────
      const embed = new EmbedBuilder()
        .setTitle(`${flagInfo.emoji} ${flagInfo.language} Translation`)
        .setDescription(result.translation)
        .setColor(0x1a7a9e)
        .setFooter({ text: "Discore Official AI Translation" })
        .setTimestamp();

      await channel.send({
        content: `${user} here is your translation:`,
        embeds: [embed],
      });

      await sendDebug(
        client,
        "✅ Translation Sent",
        [
          `**Guild:** ${guildId}`,
          `**Channel:** <#${channel.id}>`,
          `**Language:** ${flagInfo.emoji} ${flagInfo.language}`,
          `**Content length:** ${content.length}`,
          `**Translation length:** ${result.translation.length}`,
          `**Credit consumed:** 1`,
          `**User:** <@${user.id}>`,
        ].join("\n"),
        0x2ecc71,
      );
    } catch (err) {
      console.error("[AI Translation] Error:", err.message);
      await sendDebug(
        client,
        "💥 EXCEPTION",
        `**Guild:** ${guildId}\n**Error:** ${err.message}\n**Stack:** ${String(err.stack).substring(0, 500)}`,
        0xe74c3c,
      );
    }
  },
};
