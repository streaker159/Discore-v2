"use strict";

const prisma = require("../lib/prisma");
const {
  trackMessage,
} = require("../modules/player/services/userActivityService");
const { handleDiscoreMention } = require("../modules/ai/service");
const { handleMessageXp } = require("../modules/xp/xpService");
const {
  isConversationContinuation,
  addTurn,
} = require("../modules/ai/conversationMemory");
const {
  processMessage: processAutomod,
} = require("../modules/automod/enforcement");
const {
  isImageGenerationRequest,
  extractImagePrompt,
  filterPrompt,
  generateImage,
} = require("../modules/ai/providers/imageProvider");
const { canUseAi, consumeAiCredits } = require("../modules/premium/service");
const { getAiAdminSettings } = require("../modules/premium/service");
const logger = require("../lib/logger");

const IMAGE_GEN_COST = 5; // Credits per image generation

// ── Helper: handle conversation continuation (reply to bot AI message) ─────────

async function handleDiscoreReplyContinuation({
  message,
  client,
  guildId,
  userId,
  channelId,
}) {
  const content = message.content.trim();
  if (!content) return;

  const { handleDiscoreMention } = require("../modules/ai/service");
  const { addTurn } = require("../modules/ai/conversationMemory");

  // Store the user's turn
  addTurn({
    guildId,
    channelId,
    userId,
    role: "user",
    content: content.substring(0, 200),
    messageId: message.id,
  });

  // Treat it like a mention
  await handleDiscoreMention({
    message,
    client,
    guildId,
    userId,
    channelId,
    content: `User: ${message.author.username}\nMessage: ${content}`,
  });
}

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

    // ── Discore XP: Award message XP (no async wait needed, fire-and-forget safe) ──
    handleMessageXp(message, client).catch(() => {});

    const guildId = message.guild.id;

    // ── Automod enforcement (cached, single-pass) ────────────────────────
    processAutomod(client, message).catch((err) => {
      logger.error("Automod: processMessage crashed", {
        guildId,
        error: err.message,
      });
    });

    // ── Auto Post: Keyword & Mention triggers ───────────────────────────
    try {
      const {
        checkPremiumActive,
        getPosts,
        isOnCooldown,
        markTriggered,
        sendAutoPost,
        recordFailure,
      } = require("../modules/autopost/autoPostService");
      const isPremium = await checkPremiumActive(guildId);

      if (isPremium) {
        const autoPosts = await getPosts(guildId);
        for (const post of autoPosts) {
          if (post.status !== "ACTIVE" || !post.enabled) continue;

          if (post.triggerType === "KEYWORD") {
            const cfg = post.triggerConfig || {};
            const phrase = cfg.phrase || "";
            const matchType = cfg.matchType || "CONTAINS";
            if (!phrase) continue;

            const msgContent = message.content.toLowerCase();
            const phraseLower = phrase.toLowerCase();

            let matched = false;
            if (matchType === "EXACT") {
              matched = msgContent === phraseLower;
            } else {
              matched = msgContent.includes(phraseLower);
            }

            if (matched && !(await isOnCooldown(post))) {
              await markTriggered(post.id);
              const guild = message.guild;
              const member = message.member;
              const result = await sendAutoPost(client, post, {
                serverName: guild.name,
                memberCount: String(guild.memberCount),
                userMention: `<@${message.author.id}>`,
                username: message.author.username,
                displayName:
                  member?.displayName ||
                  message.author.displayName ||
                  message.author.username,
                channel: `<#${message.channel.id}>`,
                trigger: phrase,
              });
              if (!result.success) {
                await recordFailure(post.id);
                logger.warn("Auto post keyword trigger failed to send", {
                  guildId,
                  postId: post.id,
                  postName: post.name,
                  error: result.error,
                });
              }
            }
          }

          if (post.triggerType === "MENTION") {
            const cfg = post.triggerConfig || {};
            const targetId = cfg.targetId;
            if (!targetId) continue;

            // Check if the message mentions the target role or user
            const mentionsRole = message.mentions.roles.has(targetId);
            const mentionsUser = message.mentions.users.has(targetId);

            if ((mentionsRole || mentionsUser) && !(await isOnCooldown(post))) {
              await markTriggered(post.id);
              const guild = message.guild;
              const member = message.member;
              const result = await sendAutoPost(client, post, {
                serverName: guild.name,
                memberCount: String(guild.memberCount),
                userMention: `<@${message.author.id}>`,
                username: message.author.username,
                displayName:
                  member?.displayName ||
                  message.author.displayName ||
                  message.author.username,
                channel: `<#${message.channel.id}>`,
                trigger: mentionsRole ? `<@&${targetId}>` : `<@${targetId}>`,
              });
              if (!result.success) {
                await recordFailure(post.id);
                logger.warn("Auto post mention trigger failed to send", {
                  guildId,
                  postId: post.id,
                  postName: post.name,
                  error: result.error,
                });
              }
            }
          }
        }
      }
    } catch (err) {
      logger.error("Auto post trigger check crashed", {
        guildId,
        error: err.message,
      });
    }

    // ── Bot mention AI ──────────────────────────────────────────────────
    const userId = message.author.id;
    const channelId = message.channel.id;

    // Ignore @everyone and @here mentions — these are not directed at the bot
    if (message.mentions.everyone) return;

    // Check if this is a reply to a bot message
    const isReplyToBotMsg =
      message.reference?.messageId &&
      (await (async () => {
        try {
          const refMsg = await message.channel.messages.fetch(
            message.reference.messageId,
          );
          return refMsg?.author?.id === client.user.id;
        } catch {
          return false;
        }
      })());

    // ── Conversation continuation: reply to bot AI message (no @mention needed) ──
    if (!message.mentions.has(client.user) && isReplyToBotMsg) {
      const {
        isConversationContinuation: isCont,
      } = require("../modules/ai/conversationMemory");
      if (isCont({ guildId, channelId, userId, message })) {
        // This is a reply to a bot conversation message — treat as a mention
        await handleDiscoreReplyContinuation({
          message,
          client,
          guildId,
          userId,
          channelId,
        });
      }
      return;
    }

    // Only respond when explicitly @mentioned
    const botMentioned = message.mentions.has(client.user);
    if (!botMentioned) return;

    // ── If @mentioned while replying to a bot embed → IGNORE ─────────────
    if (isReplyToBotMsg) {
      // Check if the reply target is one of our conversation messages
      const {
        isConversationContinuation: isCont,
      } = require("../modules/ai/conversationMemory");
      if (!isCont({ guildId, channelId, userId, message })) {
        // Reply target is a bot message NOT in conversation memory → likely an embed
        // Verify: fetch and check if it has embeds with no substantial text
        try {
          const refMsg = await message.channel.messages.fetch(
            message.reference.messageId,
          );
          const hasEmbeds = refMsg.embeds && refMsg.embeds.length > 0;
          const hasText = refMsg.content && refMsg.content.trim().length > 50;
          if (hasEmbeds && !hasText) {
            return; // Silent ignore — replying to bot embed, not a conversation
          }
        } catch {
          // Can't verify — skip to be safe
        }
      }
    }

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

      // Check if image generation is enabled for this server
      const aiSettings = await getAiAdminSettings(guildId);
      if (!aiSettings.aiImageGenEnabled) {
        await message.reply({
          content:
            "🎨 AI image generation is not enabled on this server. An admin can enable it in `/premium` → **AI Feature Toggles**.",
        });
        return;
      }

      // Safety filter
      const safetyCheck = filterPrompt(imagePrompt);
      if (!safetyCheck.safe) {
        await message.reply({ content: `⚠️ ${safetyCheck.reason}` });
        return;
      }

      // Check per-user daily image gen limit
      if (aiSettings.perUserDailyImageGenLimit > 0) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const userImageGenToday = await prisma.botAiUsage.aggregate({
          where: {
            guildId,
            userId,
            requestType: "IMAGE_GENERATION",
            createdAt: { gte: todayStart },
          },
          _count: true,
        });
        const generatedToday = userImageGenToday._count || 0;
        if (generatedToday >= aiSettings.perUserDailyImageGenLimit) {
          await message.reply({
            content: `⚠️ You've reached your daily image generation limit (${aiSettings.perUserDailyImageGenLimit}). Try again tomorrow!`,
          });
          return;
        }
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
