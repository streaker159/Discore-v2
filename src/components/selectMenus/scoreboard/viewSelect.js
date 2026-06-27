"use strict";

const {
  getScoreboardById,
  buildInteractiveShowEmbed,
  buildShowComponents,
} = require("../../../modules/scoreboards/service");

module.exports = {
  customIdPrefix: "sb:view:",
  async execute(interaction) {
    // customId: sb:view:{boardId}:{page}:{sortBy}
    const parts = interaction.customId.split(":");
    const boardId = parts[2];
    const page = parseInt(parts[3], 10) || 1;
    const sortBy = parts[4] || "WINS";
    const viewMode = interaction.values[0];

    const board = await getScoreboardById(boardId);
    if (!board)
      return interaction.update({
        content: "Scoreboard no longer exists.",
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

    const {
      embed,
      page: safePage,
      totalPages,
    } = buildInteractiveShowEmbed(board, viewMode, page, sortBy, {
      guildIconUrl,
      discoreIconUrl,
    });
    const components = buildShowComponents(
      board.id,
      safePage,
      totalPages,
      board.metric,
      sortBy,
      viewMode,
      board,
    );

    return interaction.update({ embeds: [embed], components });
  },
};
