"use strict";

require("dotenv").config();

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { loadCommands } = require("./loaders/commandLoader");
const { loadComponents } = require("./loaders/componentLoader");
const { loadEvents } = require("./loaders/eventLoader");
const { loadJobs } = require("./loaders/jobLoader");
const logger = require("./lib/logger");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.GuildMember,
    Partials.User,
    Partials.Reaction,
  ],
});

loadCommands(client);
loadComponents(client);
loadEvents(client);
loadJobs(client);

// ── AI Translation: reaction handler ────────────────────────────────
client.on("messageReactionAdd", async (reaction, user) => {
  const guildId = reaction.message.guild?.id || null;
  const emojiName = reaction.emoji?.name || null;

  // Ignore bots and DMs
  if (user.bot || !guildId) return;

  // Track user activity
  try {
    const {
      trackReaction,
    } = require("./modules/player/services/userActivityService");
    await trackReaction(guildId, user.id, emojiName);
  } catch {}

  // Flag detection
  const { getLanguageForFlag } = require("./modules/ai/flagLanguages");
  const flagInfo = getLanguageForFlag(emojiName);
  if (!flagInfo) return;

  // Fetch partials
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch {
    return;
  }

  // Skip own messages
  if (reaction.message.author?.id === client.user?.id) return;

  // Extract content
  let content = reaction.message.content || "";
  if (!content.trim() && reaction.message.embeds?.length) {
    content = reaction.message.embeds
      .map((e) => e.description || e.title || "")
      .filter(Boolean)
      .join("\n");
  }
  if (!content.trim()) return;

  // Permissions
  const channel = reaction.message.channel;
  const perms = channel.permissionsFor(client.user);
  if (!perms?.has("SendMessages") || !perms?.has("EmbedLinks")) return;

  // Settings check
  const prisma = require("./lib/prisma");
  const premium = await prisma.guildPremium.findUnique({
    where: { guildId },
    select: { aiTranslationEnabled: true, aiEnabled: true },
  });
  if (!premium || premium.aiEnabled === false || !premium.aiTranslationEnabled)
    return;

  // Credit check
  const { canUseAi } = require("./modules/premium/service");
  const gate = await canUseAi(guildId, user.id, 1);
  if (!gate.ok) return;

  // Translate
  const { translateMessage } = require("./modules/ai/translation");
  const result = await translateMessage({
    guildId,
    userId: user.id,
    messageContent: content,
    targetEmoji: emojiName,
  });
  if (!result.success) return;

  // Send translation
  const { EmbedBuilder } = require("discord.js");

  // Resolve author display name
  let authorName = reaction.message.author?.username || "Unknown";
  try {
    const member = await reaction.message.guild?.members
      .fetch(reaction.message.author.id)
      .catch(() => null);
    if (member)
      authorName = member.displayName || member.user?.username || authorName;
  } catch {}

  // Safe truncation helpers
  const MAX_FIELD_LEN = 1024;
  function safeTrim(text, max = MAX_FIELD_LEN) {
    const t = String(text || "").trim();
    return t.length > max ? t.substring(0, max - 3) + "..." : t;
  }

  const origText = safeTrim(content);
  const transText = safeTrim(result.translation);

  const embed = new EmbedBuilder()
    .setTitle("🌍 Translation Complete")
    .setDescription(
      `👤 **Message from:** ${authorName}\n🎯 **Target language:** ${flagInfo.emoji} ${flagInfo.language}`,
    )
    .setColor(0x1a7a9e)
    .addFields(
      {
        name: "💬 Original Message",
        value: origText || "(empty)",
        inline: false,
      },
      {
        name: "🌐 Translated Message",
        value: transText || "(empty)",
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
});

process.on("unhandledRejection", (error) => {
  logger.error("Unhandled rejection", {
    error: error?.stack || error?.message || String(error),
  });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    error: error?.stack || error?.message || String(error),
  });
});

client.login(process.env.DISCORD_TOKEN);
