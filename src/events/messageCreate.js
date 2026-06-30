"use strict";

const { EmbedBuilder } = require("discord.js");
const prisma = require("../lib/prisma");
const {
  trackMessage,
} = require("../modules/player/services/userActivityService");
const { handleDiscoreMention } = require("../modules/ai/service");
const {
  isConversationContinuation,
  addTurn,
} = require("../modules/ai/conversationMemory");
const { checkMessage, createCase } = require("../modules/automod/service");

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

    const guildId = message.guild.id;

    // ── Automod enforcement ──────────────────────────────────────────────
    try {
      const matchedRule = await checkMessage(guildId, message.content);
      if (matchedRule) {
        const action = matchedRule.action;

        // Create automod case record
        await createCase({
          guildId,
          userId: message.author.id,
          channelId: message.channel.id,
          messageId: message.id,
          ruleId: matchedRule.id,
          messageExcerpt: message.content,
          actionTaken: action,
        });

        // Perform action
        if (action === "DELETE") {
          const channelPerms = message.channel.permissionsFor(client.user);
          if (channelPerms?.has("ManageMessages")) {
            await message.delete().catch(() => {});
          }
        } else if (action === "TIMEOUT") {
          const member = await message.guild.members
            .fetch(message.author.id)
            .catch(() => null);
          if (
            member?.manageable &&
            message.guild.members.me?.permissions.has("ModerateMembers")
          ) {
            await member
              .timeout(60_000, `Automod: ${matchedRule.phrase}`)
              .catch(() => {});
          }
        }
        // REVIEW: no immediate action, case is already created for review

        // Log to configured channel
        const guildRecord = await prisma.guild.findUnique({
          where: { id: guildId },
          select: { moderationLogChannelId: true, logChannelId: true },
        });
        const logChannelId =
          guildRecord?.moderationLogChannelId || guildRecord?.logChannelId;

        if (logChannelId) {
          const logChannel = await message.guild.channels
            .fetch(logChannelId)
            .catch(() => null);
          if (logChannel?.isTextBased()) {
            const logPerms = logChannel.permissionsFor(client.user);
            if (logPerms?.has("SendMessages") && logPerms?.has("EmbedLinks")) {
              const embed = new EmbedBuilder()
                .setTitle("🛡️ Automod Triggered")
                .setDescription(
                  `**User:** ${message.author.tag} (${message.author.id})\n` +
                    `**Channel:** ${message.channel}`,
                )
                .addFields(
                  {
                    name: "Rule",
                    value: `ID ${matchedRule.id} • ${matchedRule.matchType}`,
                    inline: true,
                  },
                  {
                    name: "Phrase",
                    value: `\`${matchedRule.phrase}\``,
                    inline: true,
                  },
                  {
                    name: "Action",
                    value: action,
                    inline: true,
                  },
                  {
                    name: "Message",
                    value: message.content.substring(0, 1024) || "(empty)",
                  },
                )
                .setColor("#e74c3c")
                .setTimestamp();

              await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
          }
        }
      }
    } catch (err) {
      console.error("[Automod Enforcement Error]", err);
    }

    // ── Bot mention AI ──────────────────────────────────────────────────
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
