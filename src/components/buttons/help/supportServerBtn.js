"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const logger = require("../../../lib/logger");

const SUPPORT_GUILD_ID = "1366566263048110125";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cachedInviteUrl = null;
let cachedAt = 0;

async function getSupportInvite(client) {
  const now = Date.now();
  if (cachedInviteUrl && now - cachedAt < CACHE_TTL_MS) {
    return cachedInviteUrl;
  }

  const guild = await client.guilds.fetch(SUPPORT_GUILD_ID).catch(() => null);
  if (!guild) return null;

  // Prefer the server's vanity URL if it has one
  if (guild.vanityURLCode) {
    cachedInviteUrl = `https://discord.gg/${guild.vanityURLCode}`;
    cachedAt = now;
    return cachedInviteUrl;
  }

  // Reuse an existing non-expiring invite if one already exists
  try {
    const invites = await guild.invites.fetch();
    const permanent = invites.find(
      (inv) => inv.maxAge === 0 && inv.maxUses === 0,
    );
    if (permanent) {
      cachedInviteUrl = permanent.url;
      cachedAt = now;
      return cachedInviteUrl;
    }
  } catch {
    // Missing permission to list invites — fall through and try to create one
  }

  // Create a fresh, non-expiring invite in a suitable channel
  try {
    const me = guild.members.me;
    const channel =
      guild.systemChannel &&
      guild.systemChannel.permissionsFor(me)?.has("CreateInstantInvite")
        ? guild.systemChannel
        : guild.channels.cache.find(
            (c) =>
              c.isTextBased?.() &&
              !c.isThread?.() &&
              c.permissionsFor(me)?.has("CreateInstantInvite"),
          );
    if (!channel) return null;

    const invite = await channel.createInvite({
      maxAge: 0,
      maxUses: 0,
      unique: false,
      reason: "Support server invite for /help",
    });
    cachedInviteUrl = invite.url;
    cachedAt = now;
    return cachedInviteUrl;
  } catch (err) {
    logger.warn("supportServerBtn: failed to create invite", {
      error: err.message,
    });
    return null;
  }
}

module.exports = {
  customId: "help:support",
  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const url = await getSupportInvite(interaction.client);
    if (!url) {
      return interaction.editReply({
        content:
          "⚠️ Couldn't generate an invite link right now. Please contact the bot owner directly.",
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("🆘 Need Help?")
      .setDescription(
        "Have a question, a suggestion, or found a bug?\nJoin our official server — we're happy to help!",
      )
      .setColor(0x1a7a9e)
      .setFooter({ text: "Powered by Discore" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Join Official Server")
        .setEmoji("🔗")
        .setStyle(ButtonStyle.Link)
        .setURL(url),
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
  },
};
