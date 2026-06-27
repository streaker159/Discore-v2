"use strict";

const {
  getScoreboardById,
  archiveScoreboard,
  deleteScoreboard,
  pushLiveEmbed,
  buildInteractiveShowEmbed,
  buildShowComponents,
} = require("../../../modules/scoreboards/service");

module.exports = [
  // ── archive_delete_embeds_yes ────────────────────────────────
  {
    customIdPrefix: "archive:archive_delete_embeds_yes:",
    async execute(interaction) {
      const raw = interaction.customId.slice(
        "archive:archive_delete_embeds_yes:".length,
      );
      const parts = raw.split(":");
      const boardId = parts[0];
      const note = parts[1] || null;

      const board = await getScoreboardById(boardId);
      if (!board || board.guildId !== interaction.guildId)
        return interaction.update({
          content: "Scoreboard no longer exists.",
          components: [],
          embeds: [],
        });

      await archiveScoreboard({
        guildId: board.guildId,
        name: board.name,
        archivedBy: interaction.user.id,
        archiveNote: note,
        deleteLiveEmbeds: true,
      });

      // Delete live embeds in background
      if (board.channelId && board.messageId) {
        try {
          const ch = await interaction.client.channels
            .fetch(board.channelId)
            .catch(() => null);
          if (ch) {
            const msg = await ch.messages
              .fetch(board.messageId)
              .catch(() => null);
            if (msg) await msg.delete().catch(() => {});
          }
        } catch {}
      }

      return interaction.update({
        content: `📦 **${board.name}** archived. (${board.entries.length} entries preserved)`,
        embeds: [],
        components: [],
      });
    },
  },

  // ── archive_delete_embeds_no ─────────────────────────────────
  {
    customIdPrefix: "archive:archive_delete_embeds_no:",
    async execute(interaction) {
      const raw = interaction.customId.slice(
        "archive:archive_delete_embeds_no:".length,
      );
      const parts = raw.split(":");
      const boardId = parts[0];
      const note = parts[1] || null;

      const board = await getScoreboardById(boardId);
      if (!board || board.guildId !== interaction.guildId)
        return interaction.update({
          content: "Scoreboard no longer exists.",
          components: [],
          embeds: [],
        });

      await archiveScoreboard({
        guildId: board.guildId,
        name: board.name,
        archivedBy: interaction.user.id,
        archiveNote: note,
        deleteLiveEmbeds: false,
      });

      return interaction.update({
        content: `📦 **${board.name}** archived with live embeds kept. (${board.entries.length} entries preserved)`,
        embeds: [],
        components: [],
      });
    },
  },

  // ── archive cancel ───────────────────────────────────────────
  {
    customIdPrefix: "archive:archive_cancel:",
    async execute(interaction) {
      return interaction.update({
        content: "Archive cancelled.",
        embeds: [],
        components: [],
      });
    },
  },

  // ── delete confirm ───────────────────────────────────────────
  {
    customIdPrefix: "archive:delete_confirm:",
    async execute(interaction) {
      const boardId = interaction.customId.slice(
        "archive:delete_confirm:".length,
      );
      const board = await getScoreboardById(boardId);
      if (!board || board.guildId !== interaction.guildId)
        return interaction.update({
          content: "Scoreboard no longer exists.",
          components: [],
          embeds: [],
        });

      await deleteScoreboard({ guildId: board.guildId, name: board.name });

      return interaction.update({
        content: `🗑️ Archived scoreboard **${board.name}** permanently deleted.`,
        embeds: [],
        components: [],
      });
    },
  },

  // ── delete cancel ────────────────────────────────────────────
  {
    customIdPrefix: "archive:delete_cancel:",
    async execute(interaction) {
      return interaction.update({
        content: "Delete cancelled.",
        embeds: [],
        components: [],
      });
    },
  },
];
