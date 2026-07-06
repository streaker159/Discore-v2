"use strict";

const {
  getScoreboardById,
  buildInteractiveShowEmbed,
  buildShowComponents,
} = require("../../../modules/scoreboards/service");

module.exports = {
  customIdPrefix: "sb:archive_select:",
  async execute(interaction) {
    const boardId = interaction.values[0];
    const board = await getScoreboardById(boardId);
    if (!board)
      return interaction.update({
        content: "That archived scoreboard no longer exists.",
        components: [],
        embeds: [],
      });

    const guildIconUrl =
      interaction.guild?.iconURL({ size: 128, extension: "png" }) ?? undefined;
    const discoreIconUrl =
      interaction.client.user?.displayAvatarURL({
        size: 64,
        extension: "png",
      }) ?? undefined;

    const viewMode = board.hasCategories ? "combined" : "flat";

    const { embed, page, totalPages } = await buildInteractiveShowEmbed(
      board,
      viewMode,
      1,
      "WINS",
      { guildIconUrl, discoreIconUrl },
    );
    const components = buildShowComponents(
      board.id,
      page,
      totalPages,
      board.metric,
      "WINS",
      viewMode,
      board,
    );

    // Clear the ephemeral select menu, then post the result publicly
    await interaction.update({
      content: `📦 Opened archived scoreboard: **${board.name}**`,
      components: [],
      embeds: [],
    });
    return interaction.followUp({
      content: null,
      embeds: [embed],
      components,
    });
  },
};
