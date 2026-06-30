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

// ── AI Translation: raw reaction handler (bypasses event loader) ────
const DEBUG = process.env.DEBUG_AI_TRANSLATION === "true";
const OWNER_CHANNEL = "1367326139109871738";

async function sendDebug(client, title, desc, color) {
  if (!DEBUG) return;
  try {
    const ch = client.channels.cache.get(OWNER_CHANNEL);
    if (!ch?.isTextBased?.()) return;
    const { EmbedBuilder } = require("discord.js");
    await ch
      .send({
        embeds: [
          new EmbedBuilder()
            .setTitle(title)
            .setDescription(String(desc).substring(0, 4096))
            .setColor(color || 0x3498db)
            .setTimestamp(),
        ],
      })
      .catch(() => {});
  } catch {}
}

client.on("messageReactionAdd", async (reaction, user) => {
  // ── Step 0: raw event ──────────────────────────────────────────
  const guildId = reaction.message.guild?.id || null;
  const channelId = reaction.message.channelId;
  const messageId = reaction.message.id;
  const emojiName = reaction.emoji?.name || null;

  console.log("[RAW_AI_TRANSLATE] FIRED", {
    emojiName,
    guildId,
    channelId,
    messageId,
    userId: user.id,
    bot: user.bot,
    rPartial: !!reaction.partial,
    mPartial: !!reaction.message.partial,
  });

  await sendDebug(
    client,
    "⚡ Raw Handler Fired",
    `Emoji: \`${emojiName}\`\nGuild: ${guildId}\nChannel: <#${channelId}>\nUser: <@${user.id}>\nBot: ${user.bot}\nrPartial: ${!!reaction.partial}\nmPartial: ${!!reaction.message.partial}`,
    0x9b59b6,
  );

  // ── Step 1: bot check ──────────────────────────────────────────
  if (user.bot) {
    await sendDebug(
      client,
      "🛑 STOP: Bot",
      `User <@${user.id}> is bot.`,
      0xe74c3c,
    );
    return;
  }
  if (!guildId) {
    await sendDebug(client, "🛑 STOP: DM", "No guild.", 0xe74c3c);
    return;
  }

  // ── Step 2: flag detection ──────────────────────────────────────
  const { getLanguageForFlag } = require("./modules/ai/flagLanguages");
  const flagInfo = getLanguageForFlag(emojiName);

  if (!flagInfo) {
    await sendDebug(
      client,
      "🛑 STOP: No Flag",
      `Emoji: \`${emojiName}\` not a supported flag.`,
      0xe67e22,
    );
    return;
  }

  await sendDebug(
    client,
    "🏳️ Flag Matched",
    `Code: \`${flagInfo.code}\`\nLanguage: ${flagInfo.language}\nEmoji: ${flagInfo.emoji}`,
    0x2ecc71,
  );

  // ── Step 3: fetch partials ──────────────────────────────────────
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch {
    await sendDebug(
      client,
      "🛑 STOP: Fetch Failed",
      "Could not fetch reaction/message.",
      0xe74c3c,
    );
    return;
  }

  // ── Step 4: extract content ─────────────────────────────────────
  if (reaction.message.author?.id === client.user?.id) {
    await sendDebug(client, "🛑 STOP: Own Message", "", 0xe67e22);
    return;
  }

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
      "🛑 STOP: No Content",
      `Message has no text. Message Content Intent may be missing.`,
      0xe74c3c,
    );
    return;
  }

  await sendDebug(
    client,
    "📝 Content OK",
    `Length: ${content.length}\nPreview: ${content.substring(0, 120)}`,
    0x3498db,
  );

  // ── Step 5: permissions ─────────────────────────────────────────
  const channel = reaction.message.channel;
  const perms = channel.permissionsFor(client.user);
  if (!perms?.has("SendMessages") || !perms?.has("EmbedLinks")) {
    await sendDebug(
      client,
      "🛑 STOP: Permissions",
      `SendMessages: ${!!perms?.has("SendMessages")}\nEmbedLinks: ${!!perms?.has("EmbedLinks")}`,
      0xe74c3c,
    );
    return;
  }

  // ── Step 6: settings check ──────────────────────────────────────
  const prisma = require("./lib/prisma");
  const premium = await prisma.guildPremium.findUnique({
    where: { guildId },
    select: { aiTranslationEnabled: true, aiEnabled: true },
  });

  if (!premium || premium.aiEnabled === false) {
    await sendDebug(
      client,
      "🛑 STOP: AI Disabled",
      `aiEnabled: ${premium?.aiEnabled}, hasRecord: ${!!premium}`,
      0xe74c3c,
    );
    return;
  }
  if (!premium.aiTranslationEnabled) {
    await sendDebug(
      client,
      "🛑 STOP: Trans Disabled",
      `aiTranslationEnabled: false`,
      0xe74c3c,
    );
    return;
  }

  await sendDebug(
    client,
    "⚙️ Settings OK",
    `AI Enabled: true\nTranslation Enabled: true`,
    0x2ecc71,
  );

  // ── Step 7: credit check ────────────────────────────────────────
  const { canUseAi } = require("./modules/premium/service");
  const gate = await canUseAi(guildId, user.id, 1);

  if (!gate.ok) {
    await sendDebug(
      client,
      "🛑 STOP: Credits",
      `Reason: ${gate.reason}\nMsg: ${gate.message || "N/A"}`,
      0xe74c3c,
    );
    return;
  }

  await sendDebug(client, "💰 Credits OK", "", 0x2ecc71);

  // ── Step 8: call AI translation ─────────────────────────────────
  await sendDebug(
    client,
    "🤖 AI Call Started",
    `Lang: ${flagInfo.language}\nContent: ${content.substring(0, 100)}...`,
    0x3498db,
  );

  const { translateMessage } = require("./modules/ai/translation");
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
      `Error: ${result.error}\nLang: ${flagInfo.language}`,
      0xe74c3c,
    );
    return;
  }

  await sendDebug(
    client,
    "✅ AI Call OK",
    `Translation length: ${result.translation?.length}`,
    0x2ecc71,
  );

  // ── Step 9: send translation ────────────────────────────────────
  const { EmbedBuilder } = require("discord.js");
  await channel.send({
    content: `${user} here is your translation:`,
    embeds: [
      new EmbedBuilder()
        .setTitle(`${flagInfo.emoji} ${flagInfo.language} Translation`)
        .setDescription(result.translation)
        .setColor(0x1a7a9e)
        .setFooter({ text: "Discore Official AI Translation" })
        .setTimestamp(),
    ],
  });

  await sendDebug(
    client,
    "✅ Translation Sent!",
    `Guild: ${guildId}\nLang: ${flagInfo.emoji} ${flagInfo.language}\nCredit consumed: 1`,
    0x2ecc71,
  );
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
