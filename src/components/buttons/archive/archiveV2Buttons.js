"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  searchArchives,
  findArchiveById,
  buildArchiveListEmbed,
  buildArchiveListButtons,
  buildArchiveViewEmbed,
  buildArchiveViewButtons,
  restoreArchiveAsNew,
  addResultToArchive,
} = require("../../../modules/scoreboards/archiveService");
const { requireFeature } = require("../../../lib/premiumGate");
const { getGuildSettings } = require("../../../lib/embedBuilder");
const logger = require("../../../lib/logger");

module.exports = [
  // ── Pagination buttons ────────────────────────────────
  {
    customIdPrefix: "archive_v2:page:",
    async execute(interaction) {
      // Premium check
      if (!(await requireFeature(interaction, "scoreboards.archive"))) return;

      const parts = interaction.customId.split(":");
      const page = parseInt(parts[2], 10);
      const filtersRaw = decodeURIComponent(parts.slice(3).join(":") || "{}");
      let filters = {};
      try {
        filters = JSON.parse(filtersRaw);
      } catch {}

      filters.page = Math.max(1, page);

      const result = await searchArchives(interaction.guildId, filters);
      const embed = buildArchiveListEmbed(interaction.guild, result, filters);
      const components = buildArchiveListButtons(result, filters);

      await interaction.update({ embeds: [embed], components }).catch(() => {});
    },
  },

  // ── Refresh button ─────────────────────────────────────
  {
    customIdPrefix: "archive_v2:refresh:",
    async execute(interaction) {
      if (!(await requireFeature(interaction, "scoreboards.archive"))) return;

      const parts = interaction.customId.split(":");
      const filtersRaw = decodeURIComponent(parts.slice(2).join(":") || "{}");
      let filters = {};
      try {
        filters = JSON.parse(filtersRaw);
      } catch {}

      filters.page = 1;
      const result = await searchArchives(interaction.guildId, filters);
      const embed = buildArchiveListEmbed(interaction.guild, result, filters);
      const components = buildArchiveListButtons(result, filters);

      await interaction.update({ embeds: [embed], components }).catch(() => {});
    },
  },

  // ── Restore button (from archive view) ─────────────────
  {
    customIdPrefix: "archive_v2:restore:",
    async execute(interaction) {
      if (!(await requireFeature(interaction, "scoreboards.archive"))) return;

      const boardId = interaction.customId.split(":")[2];
      if (!boardId) {
        return interaction.reply({
          content: "Invalid archive.",
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const restored = await restoreArchiveAsNew(
          boardId,
          interaction.guildId,
          null,
          interaction.user.id,
        );

        const board = await findArchiveById(interaction.guildId, boardId);
        const archiveLabel = board?.friendlyArchiveId || boardId;

        await interaction.editReply({
          content: `♻️ **Archive ${archiveLabel}** restored as live scoreboard **${restored.name}**!\nUse \`/scoreboard repair\` to attach a live channel.`,
        });
      } catch (err) {
        await interaction
          .editReply({ content: `❌ ${err.message}` })
          .catch(() => {});
      }
    },
  },

  // ── Add Result button (from archive view) ──────────────
  {
    customIdPrefix: "archive_v2:add_result:",
    async execute(interaction) {
      // This just tells them to use the slash command
      const boardId = interaction.customId.split(":")[2];
      const board = await findArchiveById(interaction.guildId, boardId);
      const label = board?.friendlyArchiveId || boardId;

      return interaction.reply({
        content: `Use \`/archive add-result archive_id:${label}\` to add results. (The button opens guidance for now.)`,
        ephemeral: true,
      });
    },
  },
];
