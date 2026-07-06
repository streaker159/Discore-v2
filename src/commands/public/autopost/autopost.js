"use strict";

const {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  checkAdmin,
  checkPremiumActive,
} = require("../../../modules/autopost/autoPostService");
const {
  buildDashboardEmbed,
  buildPremiumLockedEmbed,
} = require("../../../modules/autopost/autoPostEmbeds");
const {
  buildDashboardButtons,
} = require("../../../modules/autopost/autoPostEmbeds");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("autopost")
    .setDescription(
      "Manage Discore Auto Posts — premium automated posting system.",
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;

    // Check admin permission
    if (!(await checkAdmin(interaction))) {
      return interaction.reply({
        content:
          "🔒 You need **Manage Guild** or **Administrator** permission to manage Auto Posts.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Check premium
    const isPremium = await checkPremiumActive(guildId);
    if (!isPremium) {
      return interaction.reply({
        embeds: [buildPremiumLockedEmbed()],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel("Upgrade / Manage Premium")
              .setStyle(ButtonStyle.Link)
              .setURL(
                "https://discord.com/application-directory/1095716768077590568",
              ),
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const embed = await buildDashboardEmbed(guildId, interaction.guild);

    await interaction.editReply({
      embeds: [embed],
      components: buildDashboardButtons(),
    });
  },
};
