"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const {
  getScoreboardById,
  buildScoreboardPage,
} = require("../../../modules/scoreboards/service");

function pageButtons(boardId, currentPage, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`scoreboard:page:${boardId}:${currentPage - 1}`)
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 1),
    new ButtonBuilder()
      .setCustomId(`scoreboard:page:${boardId}:${currentPage + 1}`)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages),
    new ButtonBuilder()
      .setCustomId(`scoreboard:refresh:${boardId}:1`)
      .setLabel("🔄 Refresh")
      .setStyle(ButtonStyle.Primary),
  );
}

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
    });
    const components =
      totalPages > 1 ? [pageButtons(board.id, page, totalPages)] : [];

    // Update the ephemeral picker → replace with a public reply
    await interaction
      .update({ content: null, components: [], embeds: [], flags: 64 })
      .catch(() => {});
    return interaction.followUp({ embeds: [embed], components });
  },
};
