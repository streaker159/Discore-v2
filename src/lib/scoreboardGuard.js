"use strict";

const { PermissionFlagsBits } = require("discord.js");
const prisma = require("./prisma");

/**
 * Check if a member can manage scoreboards in a guild.
 * Allowed: server owner, Administrator, ManageGuild, configured scoreboard manager role.
 */
async function canManageScoreboards(member, guildId) {
  if (!member || !guildId) return false;

  // Server owner
  if (member.guild?.ownerId === member.id) return true;

  // Administrator or ManageGuild
  if (
    member.permissions?.has(PermissionFlagsBits.Administrator) ||
    member.permissions?.has(PermissionFlagsBits.ManageGuild)
  )
    return true;

  // Configured scoreboard manager role
  try {
    const settings = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { scoreboardManagerRoleId: true },
    });
    if (
      settings?.scoreboardManagerRoleId &&
      member.roles?.cache?.has(settings.scoreboardManagerRoleId)
    )
      return true;
  } catch {
    return false;
  }

  return false;
}

/**
 * Assert the member can manage scoreboards. Returns a reply payload or null.
 */
async function assertCanManage(interaction) {
  const ok = await canManageScoreboards(
    interaction.member,
    interaction.guildId,
  );
  if (!ok) {
    return {
      content:
        "🔒 You need the **Scoreboard Manager** role (or Manage Server permission) to manage scoreboards.",
      flags: 64,
    };
  }
  return null;
}

module.exports = { canManageScoreboards, assertCanManage };
