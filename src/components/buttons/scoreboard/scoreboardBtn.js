"use strict";

const {
  getScoreboardById,
  archiveScoreboard,
  buildScoreboardPage,
  buildScoreboardComponents,
} = require("../../../modules/scoreboards/service");

// ─── shared handler helper ────────────────────────────────────────────────────

async function handleShow(interaction, boardId, page, sortBy) {
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
    interaction.client.user?.displayAvatarURL({ size: 64, extension: "png" }) ??
    undefined;

  const {
    embed,
    page: safePage,
    totalPages,
  } = buildScoreboardPage(board, page, {
    guildIconUrl,
    discoreIconUrl,
    sortBy,
  });
  const components = buildScoreboardComponents(
    board.id,
    safePage,
    totalPages,
    board.metric,
    sortBy,
  );
  return interaction.update({ embeds: [embed], components });
}

// ─── handlers ─────────────────────────────────────────────────────────────────

module.exports = [
  {
    customIdPrefix: "scoreboard:page:",
    async execute(interaction) {
      // customId: scoreboard:page:{boardId}:{page}:{sortBy?}
      const parts = interaction.customId.split(":");
      const boardId = parts[2];
      const page = parseInt(parts[3], 10) || 1;
      const sortBy = parts[4] || "WINS";
      return handleShow(interaction, boardId, page, sortBy);
    },
  },

  {
    customIdPrefix: "scoreboard:sort:",
    async execute(interaction) {
      // customId: scoreboard:sort:{boardId}:{page}:{sortBy}
      const parts = interaction.customId.split(":");
      const boardId = parts[2];
      const page = parseInt(parts[3], 10) || 1;
      const sortBy = parts[4] || "WINS";
      return handleShow(interaction, boardId, page, sortBy);
    },
  },

  {
    customIdPrefix: "scoreboard:refresh:",
    async execute(interaction) {
      // customId: scoreboard:refresh:{boardId}:{page}:{sortBy?}
      const parts = interaction.customId.split(":");
      const boardId = parts[2];
      const page = parseInt(parts[3], 10) || 1;
      const sortBy = parts[4] || "WINS";
      return handleShow(interaction, boardId, page, sortBy);
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

      if (board.guildId !== interaction.guildId)
        return interaction.update({ content: "Unauthorised.", components: [] });

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
