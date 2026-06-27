"use strict";

const {
  getScoreboardById,
  archiveScoreboard,
  buildScoreboardPage,
  buildScoreboardComponents,
  buildInteractiveShowEmbed,
  buildShowComponents,
  pushLiveEmbed,
  pushEntryLiveEmbed,
} = require("../../../modules/scoreboards/service");

// ─── shared handler helper ────────────────────────────────────────────────────

async function handleShow(interaction, boardId, page, sortBy, viewMode) {
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
  } = buildInteractiveShowEmbed(board, viewMode || "flat", page, sortBy, {
    guildIconUrl,
    discoreIconUrl,
  });
  const components = buildShowComponents(
    board.id,
    safePage,
    totalPages,
    board.metric,
    sortBy,
    viewMode || "flat",
    board,
  );
  return interaction.update({ embeds: [embed], components });
}

// ─── handlers ─────────────────────────────────────────────────────────────────

module.exports = [
  // ── pagination ─────────────────────────────────────────────────────────
  {
    customIdPrefix: "sb:page:",
    async execute(interaction) {
      // customId: sb:page:{boardId}:{page}:{sortBy}:{viewMode}
      const parts = interaction.customId.split(":");
      const boardId = parts[2];
      const page = parseInt(parts[3], 10) || 1;
      const sortBy = parts[4] || "WINS";
      const viewMode = parts[5] || "flat";
      return handleShow(interaction, boardId, page, sortBy, viewMode);
    },
  },

  // ── sort buttons ───────────────────────────────────────────────────────
  {
    customIdPrefix: "sb:sort:",
    async execute(interaction) {
      // customId: sb:sort:{boardId}:{page}:{sortBy}:{viewMode}
      const parts = interaction.customId.split(":");
      const boardId = parts[2];
      const page = parseInt(parts[3], 10) || 1;
      const sortBy = parts[4] || "WINS";
      const viewMode = parts[5] || "flat";
      return handleShow(interaction, boardId, page, sortBy, viewMode);
    },
  },

  // ── refresh ────────────────────────────────────────────────────────────
  {
    customIdPrefix: "sb:refresh:",
    async execute(interaction) {
      // customId: sb:refresh:{boardId}:{page}:{sortBy}:{viewMode}
      const parts = interaction.customId.split(":");
      const boardId = parts[2];
      const page = parseInt(parts[3], 10) || 1;
      const sortBy = parts[4] || "WINS";
      const viewMode = parts[5] || "flat";

      // Refresh from DB
      const board = await getScoreboardById(boardId);
      return handleShow(interaction, boardId, page, sortBy, viewMode);
    },
  },

  // ── archive confirm ────────────────────────────────────────────────────
  {
    customIdPrefix: "sb:archive_confirm:",
    async execute(interaction) {
      // customId: sb:archive_confirm:{boardId}:{note}:{deleteEmbeds}
      const raw = interaction.customId.slice("sb:archive_confirm:".length);
      const parts = raw.split(":");
      const boardId = parts[0];
      const note = parts[1] || "";
      const deleteEmbeds = parts[2] === "1";

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
        deleteLiveEmbeds: deleteEmbeds,
      });

      return interaction.update({
        content: `📦 **${board.name}** archived. (${board.entries.length} entries preserved)`,
        embeds: [],
        components: [],
      });
    },
  },

  // ── archive cancel ─────────────────────────────────────────────────────
  {
    customIdPrefix: "sb:archive_cancel:",
    async execute(interaction) {
      return interaction.update({
        content: "Archive cancelled.",
        embeds: [],
        components: [],
      });
    },
  },
];
