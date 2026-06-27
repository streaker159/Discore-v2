"use strict";

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require("discord.js");
const prisma = require("../../lib/prisma");
const {
  getScoreboard,
  getScoreboardById,
  getArchivedScoreboards,
  archiveScoreboard,
  restoreScoreboard,
  deleteScoreboard,
  buildInteractiveShowEmbed,
  buildShowComponents,
  pushLiveEmbed,
} = require("../../modules/scoreboards/service");
const { requireFeature } = require("../../lib/premiumGate");
const { getGuildSettings } = require("../../lib/embedBuilder");

const MANAGEMENT_ACTIONS = [
  "archive_live_scoreboard",
  "restore_archived_scoreboard",
  "delete_archived_scoreboard",
];

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("archive")
    .setDescription("Manage archived scoreboards. (Premium feature)")
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Choose what to do with the archive system")
        .setRequired(true)
        .addChoices(
          {
            name: "📋 Show archived scoreboards",
            value: "show_archived_scoreboards",
          },
          {
            name: "📦 Archive a live scoreboard",
            value: "archive_live_scoreboard",
          },
          {
            name: "♻️ Restore an archived scoreboard",
            value: "restore_archived_scoreboard",
          },
          {
            name: "🗑️ Delete an archived scoreboard",
            value: "delete_archived_scoreboard",
          },
        ),
    )
    .addStringOption((o) =>
      o
        .setName("name")
        .setDescription("Scoreboard name")
        .setRequired(false)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const action = interaction.options.getString("action");

    const isArchived = action === "archive_live_scoreboard" ? false : true;

    const boards = await prisma.scoreboard.findMany({
      where: { guildId: interaction.guildId, isArchived },
      include: { entries: true },
      orderBy: { name: "asc" },
    });

    const choices = boards
      .filter((b) => b.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((b) => {
        const modeLabel = b.metric === "POINTS" ? "Points" : "Win/Loss";
        const typeLabel =
          b.type === "ROLE"
            ? "Roles"
            : b.type === "CUSTOM"
              ? "Custom"
              : "Users";
        const extra =
          isArchived && b.archivedAt
            ? ` · Archived ${new Date(b.archivedAt).toLocaleDateString()}`
            : "";
        return {
          name: `${b.name}  (${modeLabel} · ${typeLabel} · ${b.entries.length} entries${extra})`,
          value: b.name,
        };
      });
    await interaction.respond(choices).catch(() => {});
  },

  async execute(interaction) {
    // Premium gate first
    if (!(await requireFeature(interaction, "scoreboards.archive"))) return;

    const action = interaction.options.getString("action", true);

    // Permission check for management actions
    if (MANAGEMENT_ACTIONS.includes(action)) {
      const settings = await getGuildSettings(interaction.guildId);
      const hasManagerRole = settings?.scoreboardManagerRoleId
        ? interaction.member?.roles?.cache?.has(
            settings.scoreboardManagerRoleId,
          )
        : false;
      const hasPermission =
        hasManagerRole ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
      if (!hasPermission) {
        return interaction.reply({
          content:
            "You need the **Scoreboard Manager** role (or Manage Server permission) to use this.",
          ephemeral: true,
        });
      }
    }

    // ── show_archived_scoreboards ─────────────────────────────────────────
    if (action === "show_archived_scoreboards") {
      const archived = await getArchivedScoreboards(interaction.guildId);
      if (!archived.length)
        return interaction.reply({
          content: "📭 No archived scoreboards found.",
          ephemeral: true,
        });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("archive:show_select:")
        .setPlaceholder("Select an archived scoreboard to view...")
        .addOptions(
          archived.slice(0, 25).map((b) => {
            const modeLabel = b.metric === "POINTS" ? "Points" : "Win/Loss";
            const d = b.archivedAt
              ? new Date(b.archivedAt).toLocaleDateString()
              : "";
            return new StringSelectMenuOptionBuilder()
              .setLabel(b.name.substring(0, 25))
              .setDescription(
                `${modeLabel} · ${b.entries.length} entries · Archived ${d}`,
              )
              .setValue(b.id);
          }),
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);
      return interaction.reply({
        content: `🗃️ **Archived Scoreboards (${archived.length})**\nSelect one to view:`,
        components: [row],
        ephemeral: true,
      });
    }

    // ── archive_live_scoreboard ───────────────────────────────────────────
    if (action === "archive_live_scoreboard") {
      const name = interaction.options.getString("name");
      if (!name) {
        // Show dropdown of live boards
        const live = await prisma.scoreboard.findMany({
          where: { guildId: interaction.guildId, isArchived: false },
          include: { entries: true },
          orderBy: { name: "asc" },
        });
        if (!live.length)
          return interaction.reply({
            content: "📭 No live scoreboards available to archive.",
            ephemeral: true,
          });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("archive:archive_live_select:")
          .setPlaceholder("Select a live scoreboard to archive...")
          .addOptions(
            live.slice(0, 25).map((b) => {
              const modeLabel = b.metric === "POINTS" ? "Points" : "Win/Loss";
              return new StringSelectMenuOptionBuilder()
                .setLabel(b.name.substring(0, 25))
                .setDescription(`${modeLabel} · ${b.entries.length} entries`)
                .setValue(b.id);
            }),
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        return interaction.reply({
          content: `📋 **Live Scoreboards (${live.length})**\nSelect one to archive:`,
          components: [row],
          ephemeral: true,
        });
      }

      // Direct archive with name from autocomplete — show button confirmation
      const board = await getScoreboard(interaction.guildId, name);
      if (!board)
        return interaction.reply({
          content: "Scoreboard not found.",
          ephemeral: true,
        });

      const confirmEmbed = new EmbedBuilder()
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

      return interaction.reply({
        embeds: [confirmEmbed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`archive:archive_delete_embeds_yes:${board.id}:`)
              .setLabel("Archive & Delete Embeds")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`archive:archive_delete_embeds_no:${board.id}:`)
              .setLabel("Archive & Keep Embeds")
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`archive:archive_cancel:${board.id}`)
              .setLabel("Cancel")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
        ephemeral: true,
      });
    }

    // ── restore_archived_scoreboard ───────────────────────────────────────
    if (action === "restore_archived_scoreboard") {
      const name = interaction.options.getString("name");
      if (!name) {
        const archived = await getArchivedScoreboards(interaction.guildId);
        if (!archived.length)
          return interaction.reply({
            content: "📭 No archived scoreboards available to restore.",
            ephemeral: true,
          });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("archive:restore_select:")
          .setPlaceholder("Select an archived scoreboard to restore...")
          .addOptions(
            archived.slice(0, 25).map((b) => {
              const modeLabel = b.metric === "POINTS" ? "Points" : "Win/Loss";
              const d = b.archivedAt
                ? new Date(b.archivedAt).toLocaleDateString()
                : "";
              return new StringSelectMenuOptionBuilder()
                .setLabel(b.name.substring(0, 25))
                .setDescription(
                  `${modeLabel} · ${b.entries.length} entries · Archived ${d}`,
                )
                .setValue(b.id);
            }),
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        return interaction.reply({
          content: `📋 **Archived Scoreboards (${archived.length})**\nSelect one to restore:`,
          components: [row],
          ephemeral: true,
        });
      }

      try {
        const board = await restoreScoreboard({
          guildId: interaction.guildId,
          name,
        });
        return interaction.reply({
          content: `♻️ **${board.name}** restored. Use \`/scoreboard repair\` to reattach the live embed if needed.`,
          ephemeral: true,
        });
      } catch (err) {
        return interaction.reply({
          content: `❌ ${err.message}`,
          ephemeral: true,
        });
      }
    }

    // ── delete_archived_scoreboard ────────────────────────────────────────
    if (action === "delete_archived_scoreboard") {
      const name = interaction.options.getString("name");
      if (!name) {
        const archived = await getArchivedScoreboards(interaction.guildId);
        if (!archived.length)
          return interaction.reply({
            content: "📭 No archived scoreboards available to delete.",
            ephemeral: true,
          });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("archive:delete_select:")
          .setPlaceholder("Select an archived scoreboard to delete...")
          .addOptions(
            archived.slice(0, 25).map((b) => {
              const modeLabel = b.metric === "POINTS" ? "Points" : "Win/Loss";
              const d = b.archivedAt
                ? new Date(b.archivedAt).toLocaleDateString()
                : "";
              return new StringSelectMenuOptionBuilder()
                .setLabel(b.name.substring(0, 25))
                .setDescription(
                  `${modeLabel} · ${b.entries.length} entries · Archived ${d}`,
                )
                .setValue(b.id);
            }),
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        return interaction.reply({
          content: `🗑️ **Archived Scoreboards (${archived.length})**\nSelect one to delete permanently:`,
          components: [row],
          ephemeral: true,
        });
      }

      // Confirm deletion
      const board = await prisma.scoreboard.findFirst({
        where: {
          guildId: interaction.guildId,
          name: { equals: name, mode: "insensitive" },
          isArchived: true,
        },
      });
      if (!board)
        return interaction.reply({
          content: "⚠️ That scoreboard is not archived or no longer exists.",
          ephemeral: true,
        });

      const confirmEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("⚠️ Permanently delete?")
        .setDescription(
          `Delete archived scoreboard **${board.name}**?\n` +
            `(${board.entries.length} entries)\n\n` +
            `⚠️ This cannot be undone.`,
        )
        .setFooter({ text: board.publicId ? `ID: ${board.publicId}` : "" });

      return interaction.reply({
        embeds: [confirmEmbed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`archive:delete_confirm:${board.id}`)
              .setLabel("Delete Forever")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`archive:delete_cancel:${board.id}`)
              .setLabel("Cancel")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
        ephemeral: true,
      });
    }
  },
};
