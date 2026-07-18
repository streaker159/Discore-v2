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
const { handleReactionXp } = require("../modules/xp/xpService");

module.exports = {
  name: "messageReactionAdd",

  async execute(reaction, user, client) {
    const guildId = reaction.message.guild?.id || null;
    const emojiName = reaction.emoji?.name || null;

    if (user.bot || !guildId) return;

    // Fetch partials early so all handlers have full message data
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();
    } catch {
      // Continue anyway — some handlers may still work
    }

    try {
      await trackReaction(guildId, user.id, emojiName);
    } catch {}

    // ── Discore XP: Award reaction XP ──
    handleReactionXp(reaction, user, client).catch(() => {});

    // ── Assassin: 🔪 elimination check ──
    if (emojiName === "🔪" && guildId) {
      const { handleKill } = require("../modules/assassin/assassinService");
      handleKill(reaction, user, client).catch(() => {});
      // Don't return — let other handlers run too
    }

    const flagInfo = getLanguageForFlag(emojiName);
    if (!flagInfo) return;

    if (reaction.message.author?.id === client.user?.id) return;

    let content = reaction.message.content || "";
    if (!content.trim() && reaction.message.embeds?.length) {
      content = reaction.message.embeds
        .map((e) => e.description || e.title || "")
        .filter(Boolean)
        .join("\n");
    }
    if (!content.trim()) return;

    const channel = reaction.message.channel;
    const perms = channel.permissionsFor(client.user);
    if (!perms?.has("SendMessages") || !perms?.has("EmbedLinks")) return;

    const prisma = require("../lib/prisma");
    const premium = await prisma.guildPremium.findUnique({
      where: { guildId },
      select: { aiTranslationEnabled: true, aiEnabled: true },
    });
    if (
      !premium ||
      premium.aiEnabled === false ||
      !premium.aiTranslationEnabled
    )
      return;

    const { canUseAi } = require("../modules/premium/service");
    const gate = await canUseAi(guildId, user.id, 1);
    if (!gate.ok) return;

    const result = await translateMessage({
      guildId,
      userId: user.id,
      messageContent: content,
      targetEmoji: emojiName,
    });
    if (!result.success) return;

    // Resolve author display name
    let authorName = reaction.message.author?.username || "Unknown";
    try {
      const member = await reaction.message.guild?.members
        .fetch(reaction.message.author.id)
        .catch(() => null);
      if (member)
        authorName = member.displayName || member.user?.username || authorName;
    } catch {}

    const MAX_FIELD_LEN = 1024;
    function safeTrim(text, max = MAX_FIELD_LEN) {
      const t = String(text || "").trim();
      return t.length > max ? t.substring(0, max - 3) + "..." : t;
    }

    const embed = new EmbedBuilder()
      .setTitle("🌍 Translation Complete")
      .setDescription(
        `👤 **Message from:** ${authorName}\n🎯 **Target language:** ${flagInfo.emoji} ${flagInfo.language}`,
      )
      .setColor(0x1a7a9e)
      .addFields(
        {
          name: "💬 Original Message",
          value: safeTrim(content) || "(empty)",
          inline: false,
        },
        {
          name: "🌐 Translated Message",
          value: safeTrim(result.translation) || "(empty)",
          inline: false,
        },
      )
      .setFooter({
        text: `Triggered by ${flagInfo.emoji} • AI Translation • Discore Official`,
      })
      .setTimestamp();

    await channel
      .send({
        content: `${user} here is your translation:`,
        embeds: [embed],
      })
      .catch(() => {});
  },
};
