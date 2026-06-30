"use strict";

const {
  getScoreboardById,
  buildInteractiveShowEmbed,
  buildShowComponents,
} = require("../../../modules/scoreboards/service");

module.exports = [
  // ── archive:show_select ──────────────────────────────────────
  {
    customIdPrefix: "archive:show_select:",
    async execute(interaction) {
      const boardId = interaction.values[0];
      const board = await getScoreboardById(boardId);
      if (!board)
        return interaction.update({
          content: "That archived scoreboard no longer exists.",
          components: [],
          embeds: [],
        });

      const guildIconUrl =
        interaction.guild?.iconURL({ size: 128, extension: "png" }) ??
        undefined;
      const discoreIconUrl =
        interaction.client.user?.displayAvatarURL({
          size: 64,
          extension: "png",
        }) ?? undefined;

      const viewMode = board.hasCategories ? "combined" : "flat";
      const { embed, page, totalPages } = await buildInteractiveShowEmbed(
        board,
        viewMode,
        1,
        "WINS",
        { guildIconUrl, discoreIconUrl },
      );
      const components = buildShowComponents(
        board.id,
        page,
        totalPages,
        board.metric,
        "WINS",
        viewMode,
        board,
      );

      await interaction.update({
        content: `📦 Opened archived scoreboard: **${board.name}**`,
        components: [],
        embeds: [],
      });
      return interaction.followUp({
        content: null,
        embeds: [embed],
        components,
        ephemeral: false,
      });
    },
  },

  // ── archive:archive_live_select ──────────────────────────────
  {
    customIdPrefix: "archive:archive_live_select:",
    async execute(interaction) {
      const boardId = interaction.values[0];
      const board = await getScoreboardById(boardId);
      if (!board)
        return interaction.update({
          content: "That scoreboard no longer exists.",
          components: [],
          embeds: [],
        });

      const confirmEmbed = new (require("discord.js").EmbedBuilder)()
        .setColor(0xe67e22)
        .setTitle("📦 Archive this scoreboard?")
        .setDescription(
          `You are about to archive **${board.name}** (${board.entries.length} entries).\n` +
            `Choose whether to delete or keep the live embeds.\n` +
            `You can restore this later with \`/archive action:♻️ Restore\`.`,
        )
        .setFooter({
          text: board.publicId ? `ID: ${board.publicId}` : "Powered by Discore",
        });

      return interaction.update({
        content: null,
        embeds: [confirmEmbed],
        components: [
          new (require("discord.js").ActionRowBuilder)().addComponents(
            new (require("discord.js").ButtonBuilder)()
              .setCustomId(`archive:archive_delete_embeds_yes:${board.id}:`)
              .setLabel("Archive & Delete Embeds")
              .setStyle(require("discord.js").ButtonStyle.Danger),
            new (require("discord.js").ButtonBuilder)()
              .setCustomId(`archive:archive_delete_embeds_no:${board.id}:`)
              .setLabel("Archive & Keep Embeds")
              .setStyle(require("discord.js").ButtonStyle.Secondary),
            new (require("discord.js").ButtonBuilder)()
              .setCustomId(`archive:archive_cancel:${board.id}`)
              .setLabel("Cancel")
              .setStyle(require("discord.js").ButtonStyle.Secondary),
          ),
        ],
      });
    },
  },

  // ── archive:restore_select ───────────────────────────────────
  {
    customIdPrefix: "archive:restore_select:",
    async execute(interaction) {
      const boardId = interaction.values[0];
      const board = await getScoreboardById(boardId);
      if (!board)
        return interaction.update({
          content: "That scoreboard no longer exists.",
          components: [],
          embeds: [],
        });

      const {
        restoreScoreboard,
      } = require("../../../modules/scoreboards/service");
      const restored = await restoreScoreboard({
        guildId: board.guildId,
        name: board.name,
      });

      return interaction.update({
        content: `♻️ **${restored.name}** restored. Use \`/scoreboard repair\` to reattach the live embed if needed.`,
        embeds: [],
        components: [],
      });
    },
  },

  // ── archive:delete_select ────────────────────────────────────
  {
    customIdPrefix: "archive:delete_select:",
    async execute(interaction) {
      const boardId = interaction.values[0];
      const board = await getScoreboardById(boardId);
      if (!board)
        return interaction.update({
          content: "That scoreboard no longer exists.",
          components: [],
          embeds: [],
        });

      const confirmEmbed = new (require("discord.js").EmbedBuilder)()
        .setColor(0xff0000)
        .setTitle("⚠️ Permanently delete?")
        .setDescription(
          `Delete archived scoreboard **${board.name}**?\n` +
            `(${board.entries.length} entries)\n\n` +
            `⚠️ This cannot be undone.`,
        )
        .setFooter({ text: board.publicId ? `ID: ${board.publicId}` : "" });

      return interaction.update({
        content: null,
        embeds: [confirmEmbed],
        components: [
          new (require("discord.js").ActionRowBuilder)().addComponents(
            new (require("discord.js").ButtonBuilder)()
              .setCustomId(`archive:delete_confirm:${board.id}`)
              .setLabel("Delete Forever")
              .setStyle(require("discord.js").ButtonStyle.Danger),
            new (require("discord.js").ButtonBuilder)()
              .setCustomId(`archive:delete_cancel:${board.id}`)
              .setLabel("Cancel")
              .setStyle(require("discord.js").ButtonStyle.Secondary),
          ),
        ],
      });
    },
  },
];
