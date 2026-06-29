"use strict";

const {
  getScoreboardById,
  buildInteractiveShowEmbed,
  buildShowComponents,
} = require("../../../modules/scoreboards/service");

module.exports = {
  customIdPrefix: "sb:scoretype:",
  async execute(interaction) {
    // customId: sb:scoretype:{boardId}:{page}:{sortBy}
    const parts = interaction.customId.split(":");
    const boardId = parts[2];
    const page = parseInt(parts[3], 10) || 1;
    const sortBy = parts[4] || "WINS";
    const viewMode = interaction.values[0]; // "overall" or "type:<scoreTypeId>"

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

    // Map "overall" → "flat" for the standard display path
    const effectiveViewMode = viewMode === "overall" ? "flat" : viewMode;
    const {
      embed,
      page: safePage,
      totalPages,
      scoreTypes,
      hasScoreTypes,
    } = await buildInteractiveShowEmbed(
      board,
      effectiveViewMode,
      page,
      sortBy,
      {
        guildIconUrl,
        discoreIconUrl,
      },
    );
    const components = buildShowComponents(
      board.id,
      safePage,
      totalPages,
      board.metric,
      sortBy,
      effectiveViewMode,
      board,
      { scoreTypes, hasScoreTypes },
    );

    return interaction.update({ embeds: [embed], components });
  },
};
