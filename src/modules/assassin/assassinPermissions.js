"use strict";

const { PermissionFlagsBits } = require("discord.js");
const { isBotOwner } = require("../../lib/ownerGuard");

/**
 * Check if a user is authorized to manage the Assassin game.
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
function isAssassinAdmin(interaction) {
  if (interaction.guild?.ownerId === interaction.user.id) return true;

  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))
    return true;

  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
    return true;

  if (isBotOwner(interaction.user.id)) return true;

  return false;
}

/**
 * Guard: replies with an ephemeral error if the user is NOT an assassin admin.
 * Returns true if allowed, false if blocked.
 *
 * @param {Interaction} interaction
 * @returns {Promise<boolean>}
 */
async function requireAssassinAdmin(interaction) {
  if (isAssassinAdmin(interaction)) return true;

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "🔒 Only server admins can manage the Assassin game.",
        flags: 64,
      });
    } else {
      await interaction.reply({
        content: "🔒 Only server admins can manage the Assassin game.",
        flags: 64,
      });
    }
  } catch {
    // Interaction may have expired
  }

  return false;
}

module.exports = { isAssassinAdmin, requireAssassinAdmin };
