const { PermissionFlagsBits } = require("discord.js");

function hasManageGuild(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

async function requireManageGuild(interaction) {
  if (!hasManageGuild(interaction)) {
    await interaction.reply({
      content: "You need Manage Server permission to use this.",
      flags: 64,
    });
    return false;
  }
  return true;
}

module.exports = { hasManageGuild, requireManageGuild };
