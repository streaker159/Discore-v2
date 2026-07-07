"use strict";

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const automodService = require("../../../modules/automod/service");
const {
  buildDashboardEmbed,
  buildDashboardButtons,
} = require("../../../modules/automod/embeds");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Manage Discore Automod rules and actions.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!automodService.checkAutomodAccess(interaction)) {
      return interaction.reply({
        content:
          "🔒 You need **Manage Guild**, **Manage Messages**, **Moderate Members**, or **Administrator** permission to use Automod.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId;
    const [settings, rules, hasAdvanced] = await Promise.all([
      automodService.getGuildAutomodSettings(guildId),
      automodService.getRules(guildId),
      automodService.hasAdvancedAccess(guildId),
    ]);

    const embed = await buildDashboardEmbed({
      guild: interaction.guild,
      settings,
      rules,
      hasAdvanced,
    });

    return interaction.editReply({
      embeds: [embed],
      components: buildDashboardButtons(),
    });
  },
};
