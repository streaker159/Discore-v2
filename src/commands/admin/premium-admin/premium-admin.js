const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { requireBotOwner } = require("../../../lib/ownerGuard");
const {
  buildPremiumAdminDashboard,
} = require("../../../modules/premium/adminDashboard");

module.exports = {
  scope: "BOT_OWNER",
  data: new SlashCommandBuilder()
    .setName("premium-admin")
    .setDescription("Open the owner-only premium dashboard.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName("guild_id")
        .setDescription("Optional guild ID to manage")
        .setRequired(false),
    ),
  async execute(interaction) {
    if (!(await requireBotOwner(interaction))) return;
    const guildId =
      interaction.options.getString("guild_id") || interaction.guildId;
    return interaction.reply(
      await buildPremiumAdminDashboard(interaction, guildId),
    );
  },
};
