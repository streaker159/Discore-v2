"use strict";

const {
  getScoreboardById,
  buildScoreboardPage,
  buildScoreboardComponents,
} = require("../../../modules/scoreboards/service");

module.exports = {
  customIdPrefix: "scoreboard:show_select:",
  async execute(interaction) {
    const boardId = interaction.values[0];
    const board = await getScoreboardById(boardId);
    if (!board)
      return interaction.update({
        content: "That scoreboard no longer exists.",
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

    const { embed, page, totalPages } = buildScoreboardPage(board, 1, {
      guildIconUrl,
      discoreIconUrl,
      sortBy: "WINS",
    });
    const components = buildScoreboardComponents(
      board.id,
      page,
      totalPages,
      board.metric,
      "WINS",
    );

    await interaction
      .update({ content: null, components: [], embeds: [], flags: 64 })
      .catch(() => {});
    return interaction.followUp({ embeds: [embed], components });
  },
};
