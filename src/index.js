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

    // Needed for slash commands, role/member events, guild member updates.
    GatewayIntentBits.GuildMembers,

    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,

    // Needed for your activity/message tracking features.
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

// ── TEMPORARY: Raw reaction listener to prove event fires ──────────────
const DEBUG_AI = process.env.DEBUG_AI_TRANSLATION === "true";
const OWNER_CHANNEL = "1367326139109871738";

client.on("messageReactionAdd", async (reaction, user) => {
  const eventData = {
    emojiName: reaction?.emoji?.name || null,
    emojiId: reaction?.emoji?.id || null,
    emojiIdentifier: reaction?.emoji?.identifier || null,
    userId: user?.id || null,
    userBot: user?.bot ?? null,
    guildId: reaction?.message?.guildId || null,
    channelId: reaction?.message?.channelId || null,
    messageId: reaction?.message?.id || null,
    reactionPartial: reaction?.partial ?? null,
    messagePartial: reaction?.message?.partial ?? null,
  };

  console.log("[RAW_REACTION_TEST] messageReactionAdd fired", eventData);

  // Send debug embed to owner channel
  if (DEBUG_AI) {
    try {
      const channel = client.channels.cache.get(OWNER_CHANNEL);
      if (channel?.isTextBased?.()) {
        const { EmbedBuilder } = require("discord.js");
        const embed = new EmbedBuilder()
          .setTitle("🔍 RAW REACTION FIRED")
          .setDescription(
            "```json\n" + JSON.stringify(eventData, null, 2) + "\n```",
          )
          .setColor(0x9b59b6)
          .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch {}
  }
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
