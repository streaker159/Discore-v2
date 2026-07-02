"use strict";

const { EmbedBuilder } = require("discord.js");

/**
 * Create a slim player profile embed.
 * The rendered card handles: identity, XP stats, progress, activity, account.
 * This embed only shows: roles.
 */
async function createPlayerProfileEmbed(member) {
  const embed = new EmbedBuilder().setColor(0xd4af37).setTimestamp();

  // ── Roles ────────────────────────────────────────────────────────────
  const roles = member.roles.cache
    .filter((r) => r.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => r.name)
    .slice(0, 15)
    .join(", ");

  if (roles) {
    embed.addFields({
      name: `🎭 Roles (${member.roles.cache.size - 1})`,
      value: roles.length > 1024 ? roles.substring(0, 1021) + "..." : roles,
      inline: false,
    });
  } else {
    embed.addFields({
      name: "🎭 Roles",
      value: "No roles",
      inline: false,
    });
  }

  // ── Auto-delete note ────────────────────────────────────────────────
  embed.setFooter({
    text: "This profile auto-deletes in 10 minutes. Run the command again for live stats.",
  });

  return embed;
}

module.exports = {
  createPlayerProfileEmbed,
};
