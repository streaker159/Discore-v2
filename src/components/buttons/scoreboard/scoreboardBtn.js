const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const {
  getScoreboardById,
  archiveScoreboard,
  buildScoreboardPage,
} = require("../../../modules/scoreboards/service");

// ─── page button row builder ──────────────────────────────────────────────────

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
      .setCustomId(`scoreboard:refresh:${boardId}:${currentPage}`)
      .setLabel("🔄 Refresh")
      .setStyle(ButtonStyle.Primary),
  );
}

// ─── pagination handler ───────────────────────────────────────────────────────

module.exports = [
  {
    customIdPrefix: "scoreboard:page:",
    async execute(interaction) {
      // customId: scoreboard:page:{boardId}:{page}
      const parts = interaction.customId.split(":");
      const boardId = parts[2];
      const page = parseInt(parts[3], 10) || 1;

      const board = await getScoreboardById(boardId);
      if (!board)
        return interaction.update({
          content: "Scoreboard no longer exists.",
          components: [],
        });

      const {
        embed,
        page: safePage,
        totalPages,
      } = buildScoreboardPage(board, page);
      const components =
        totalPages > 1 ? [pageButtons(boardId, safePage, totalPages)] : [];
      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customIdPrefix: "scoreboard:refresh:",
    async execute(interaction) {
      // customId: scoreboard:refresh:{boardId}:{page}
      const parts = interaction.customId.split(":");
      const boardId = parts[2];
      const page = parseInt(parts[3], 10) || 1;

      const board = await getScoreboardById(boardId);
      if (!board)
        return interaction.update({
          content: "Scoreboard no longer exists.",
          components: [],
        });

      const {
        embed,
        page: safePage,
        totalPages,
      } = buildScoreboardPage(board, page);
      const components =
        totalPages > 1 ? [pageButtons(boardId, safePage, totalPages)] : [];
      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customIdPrefix: "scoreboard:archive_confirm:",
    async execute(interaction) {
      // customId: scoreboard:archive_confirm:{boardId}:{note}
      const raw = interaction.customId.slice(
        "scoreboard:archive_confirm:".length,
      );
      const colonIdx = raw.indexOf(":");
      const boardId = colonIdx >= 0 ? raw.slice(0, colonIdx) : raw;
      const note = colonIdx >= 0 ? raw.slice(colonIdx + 1) : undefined;

      const board = await getScoreboardById(boardId);
      if (!board)
        return interaction.update({
          content: "Scoreboard no longer exists.",
          components: [],
        });

      if (board.guildId !== interaction.guildId) {
        return interaction.update({ content: "Unauthorised.", components: [] });
      }

      await archiveScoreboard({
        guildId: board.guildId,
        name: board.name,
        archivedBy: interaction.user.id,
        archiveNote: note || null,
      });

      return interaction.update({
        content: `📦 **${board.name}** archived. (${board.entries.length} entries preserved)`,
        embeds: [],
        components: [],
      });
    },
  },

  {
    customIdPrefix: "scoreboard:archive_cancel:",
    async execute(interaction) {
      return interaction.update({
        content: "Archive cancelled.",
        embeds: [],
        components: [],
      });
    },
  },
];
