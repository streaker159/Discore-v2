"use strict";

const { generateWelcome } = require("../modules/ai/welcome");
const prisma = require("../lib/prisma");

module.exports = {
  name: "guildMemberAdd",

  async execute(member, client) {
    // Ignore bots
    if (member.user.bot) return;

    const guildId = member.guild.id;
    const userId = member.user.id;
    const serverName = member.guild.name;
    const userMention = `<@${userId}>`;

    try {
      // Check if AI welcome is configured
      const guild = await prisma.guild.findUnique({
        where: { id: guildId },
        select: { aiWelcomeChannelId: true },
      });

      if (!guild?.aiWelcomeChannelId) return; // No welcome channel configured

      const channel = await member.guild.channels
        .fetch(guild.aiWelcomeChannelId)
        .catch(() => null);
      if (!channel) return; // Channel not found

      // Check send permissions
      if (!channel.permissionsFor(client.user)?.has("SendMessages")) return;

      // Generate welcome
      const result = await generateWelcome({
        guildId,
        userId,
        userMention,
        serverName,
      });

      if (result.success) {
        await channel.send({ content: result.message }).catch(() => {});
      } else if (result.fallback) {
        // Use non-AI fallback if available
        await channel.send({ content: result.fallback }).catch(() => {});
      }
      // If skipped (no credits, disabled, rate limited) — do nothing
    } catch (err) {
      console.error("[AI Welcome] Error:", err.message);
    }
  },
};
