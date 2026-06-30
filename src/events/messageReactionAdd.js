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

module.exports = {
  name: "messageReactionAdd",

  async execute(reaction, user, client) {
    const guildId = reaction.message.guild?.id || null;
    const emojiName = reaction.emoji?.name || null;

    if (user.bot || !guildId) return;

    try {
      await trackReaction(guildId, user.id, emojiName);
    } catch {}

    const flagInfo = getLanguageForFlag(emojiName);
    if (!flagInfo) return;

    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();
    } catch {
      return;
    }

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

    const embed = new EmbedBuilder()
      .setTitle(`${flagInfo.emoji} ${flagInfo.language} Translation`)
      .setDescription(result.translation)
      .setColor(0x1a7a9e)
      .setFooter({ text: "Discore Official AI Translation" })
      .setTimestamp();

    await channel
      .send({
        content: `${user} here is your translation:`,
        embeds: [embed],
      })
      .catch(() => {});
  },
};
