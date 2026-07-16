"use strict";

const { PermissionFlagsBits } = require("discord.js");
const { isBotOwner } = require("../../lib/ownerGuard");

/**
 * Check if a user is authorized to manage the Sniper Challenge.
 *
 * Allowed:
 * - Server owner
 * - Users with Administrator permission
 * - Users with ManageGuild permission
 * - Bot owner (from env)
 *
 * @param {Interaction} interaction
 * @returns {boolean}
 */
function isSniperAdmin(interaction) {
  // Server owner
  if (interaction.guild?.ownerId === interaction.user.id) return true;

  // Administrator
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))
    return true;

  // Manage Guild
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
    return true;

  // Bot owner
  if (isBotOwner(interaction.user.id)) return true;

  return false;
}

/**
 * Guard: replies with an ephemeral error if the user is NOT a sniper admin.
 * Returns true if allowed, false if blocked.
 *
 * @param {Interaction} interaction
 * @returns {Promise<boolean>}
 */
async function requireSniperAdmin(interaction) {
  if (isSniperAdmin(interaction)) return true;

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "🔒 Only server admins can manage the Sniper Challenge.",
        flags: 64,
      });
    } else {
      await interaction.reply({
        content: "🔒 Only server admins can manage the Sniper Challenge.",
        flags: 64,
      });
    }
  } catch {
    // Interaction may have expired
  }

  return false;
}

module.exports = { isSniperAdmin, requireSniperAdmin };
