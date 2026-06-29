"use strict";

const {
  getScoreboardById,
  buildInteractiveShowEmbed,
  buildShowComponents,
} = require("../../../modules/scoreboards/service");

module.exports = {
  customIdPrefix: "sb:show_select:",
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

    const {
      getScoreTypes,
    } = require("../../../modules/scoreboards/scoreTypes");
    const scoreTypes = await getScoreTypes(board.id);
    const hasScoreTypes = scoreTypes.length > 0;

    const viewMode = hasScoreTypes
      ? "flat"
      : board.hasCategories
        ? "combined"
        : "flat";

    const result = await buildInteractiveShowEmbed(board, viewMode, 1, "WINS", {
      guildIconUrl,
      discoreIconUrl,
    });
    const {
      embed,
      page,
      totalPages,
      scoreTypes: resultScoreTypes,
      hasScoreTypes: resultHasScoreTypes,
    } = result;
    const components = buildShowComponents(
      board.id,
      page,
      totalPages,
      board.metric,
      "WINS",
      viewMode,
      board,
      {
        scoreTypes: resultScoreTypes || scoreTypes,
        hasScoreTypes: resultHasScoreTypes ?? hasScoreTypes,
      },
    );

    return interaction.update({
      content: null,
      embeds: [embed],
      components,
    });
  },
};
