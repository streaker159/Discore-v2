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
const {
  isImageGenerationRequest,
  extractImagePrompt,
  filterPrompt,
  generateImage,
} = require("../modules/ai/providers/imageProvider");
const { canUseAi, consumeAiCredits } = require("../modules/premium/service");

const IMAGE_GEN_COST = 5; // Credits per image generation

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

    // Ignore @everyone and @here mentions — these are not directed at the bot
    if (message.mentions.everyone) return;

    // Only respond when explicitly @mentioned
    const botMentioned = message.mentions.has(client.user);

    if (!botMentioned) return;

    // Strip mention and clean content
    const strippedContent = message.content
      .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
      .trim();

    if (!strippedContent) return; // Empty mention — ignore

    // ── Image generation detection ───────────────────────────────────────
    if (isImageGenerationRequest(strippedContent)) {
      const imagePrompt = extractImagePrompt(strippedContent);

      if (!imagePrompt) {
        await message.reply({
          content:
            "🎨 I couldn't figure out what you want me to draw. Try: `@Discore generate a funny cartoon monkey eating a banana`",
        });
        return;
      }

      // Safety filter
      const safetyCheck = filterPrompt(imagePrompt);
      if (!safetyCheck.safe) {
        await message.reply({ content: `⚠️ ${safetyCheck.reason}` });
        return;
      }

      // Check credits
      const creditGate = await canUseAi(guildId, userId, IMAGE_GEN_COST);
      if (!creditGate.ok) {
        await message.reply({ content: creditGate.message });
        return;
      }

      // Let them know we're working on it
      const thinkingMsg = await message
        .reply({
          content: "🎨 Generating your image... this may take a few seconds.",
        })
        .catch(() => {});

      try {
        await message.channel.sendTyping().catch(() => {});

        const result = await generateImage({
          prompt: imagePrompt,
          style: "digital art, high quality",
          width: 1024,
          height: 1024,
        });

        // Consume credits
        await consumeAiCredits(
          guildId,
          userId,
          IMAGE_GEN_COST,
          "IMAGE_GENERATION",
        );

        // Delete thinking message
        if (thinkingMsg?.deletable) {
          await thinkingMsg.delete().catch(() => {});
        }

        // Send the image
        await message.reply({
          content: `🎨 Here's your image, commander!\n> *"${imagePrompt}"*\n-# ${IMAGE_GEN_COST} AI credits used · Powered by Discore AI`,
          files: [
            {
              attachment: result.buffer,
              name: `discore-ai-${Date.now()}.png`,
              description: imagePrompt.slice(0, 200),
            },
          ],
        });
      } catch (err) {
        console.error("[Image Gen Error]", err.message);

        if (thinkingMsg?.deletable) {
          await thinkingMsg.delete().catch(() => {});
        }

        const errorMsg = err.message.includes("timed out")
          ? "⚠️ Image generation took too long. Try a simpler prompt or try again."
          : "⚠️ Image generation failed. The AI artist is having a coffee break. Try again!";

        await message.reply({ content: errorMsg });
      }

      return;
    }

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
