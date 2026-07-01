"use strict";

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const prisma = require("../../lib/prisma");
const {
  archiveScoreboard,
  restoreScoreboard,
  deleteScoreboard,
  getScoreboard,
  buildInteractiveShowEmbed,
  buildShowComponents,
} = require("../../modules/scoreboards/service");
const {
  searchArchives,
  findArchiveById,
  buildArchiveListEmbed,
  buildArchiveListButtons,
  buildArchiveViewEmbed,
  buildArchiveViewButtons,
  backfillAllArchives,
} = require("../../modules/scoreboards/archiveService");
const { requireFeature } = require("../../lib/premiumGate");
const { getGuildSettings } = require("../../lib/embedBuilder");

const MANAGEMENT_SUBS = ["restore", "add-result", "edit", "delete"];

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("archive")
    .setDescription(
      "Browse, search, and manage archived scoreboards. (Premium)",
    )

    // ── list ────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("list")
        .setDescription("List archived scoreboards with pagination.")
        .addStringOption((o) =>
          o
            .setName("month")
            .setDescription("Filter by month (YYYY-MM)")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("query")
            .setDescription("Search by name, ID, or champion")
            .setRequired(false),
        ),
    )

    // ── search ──────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("search")
        .setDescription("Search archived scoreboards.")
        .addStringOption((o) =>
          o
            .setName("query")
            .setDescription("Search by name, ID, or text")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("month")
            .setDescription("Filter by month (YYYY-MM)")
            .setRequired(false),
        ),
    )

    // ── view ────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("view")
        .setDescription("View an archived scoreboard by its archive ID.")
        .addStringOption((o) =>
          o
            .setName("archive_id")
            .setDescription("Archive ID (e.g. A-202606-001)")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )

    // ── restore ─────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("restore")
        .setDescription("Restore an archive as a new live scoreboard.")
        .addStringOption((o) =>
          o
            .setName("archive_id")
            .setDescription("Archive ID to restore")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("new_name")
            .setDescription("Optional new name for the restored board")
            .setRequired(false),
        ),
    )

    // ── add-result ──────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("add-result")
        .setDescription("Add a win, loss, or points to an archived scoreboard.")
        .addStringOption((o) =>
          o
            .setName("archive_id")
            .setDescription("Archive ID")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("target")
            .setDescription("User, role, or name to add the result to")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("result")
            .setDescription("Type of result to add")
            .setRequired(true)
            .addChoices(
              { name: "🏆 Win", value: "win" },
              { name: "💔 Loss", value: "loss" },
              { name: "💯 Points", value: "points" },
            ),
        )
        .addIntegerOption((o) =>
          o
            .setName("amount")
            .setDescription("Number of wins/losses/points (default: 1)")
            .setRequired(false),
        ),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const guildId = interaction.guildId;

    // archive_id autocomplete
    if (interaction.options.getFocused(true)?.name === "archive_id") {
      const boards = await prisma.scoreboard.findMany({
        where: { guildId, isArchived: true },
        select: {
          id: true,
          friendlyArchiveId: true,
          name: true,
          publicId: true,
        },
        orderBy: { archivedAt: "desc" },
      });

      const choices = boards
        .filter((b) => {
          const aid = (b.friendlyArchiveId || "").toLowerCase();
          const name = (b.name || "").toLowerCase();
          const pid = (b.publicId || "").toLowerCase();
          return (
            aid.includes(focused) ||
            name.includes(focused) ||
            pid.includes(focused)
          );
        })
        .slice(0, 25)
        .map((b) => ({
          name: `${b.friendlyArchiveId || b.publicId || b.id.slice(0, 8)} · ${b.name}`,
          value: b.friendlyArchiveId || b.id,
        }));

      return interaction.respond(choices).catch(() => {});
    }

    // target autocomplete for add-result
    if (interaction.options.getFocused(true)?.name === "target") {
      const archiveId = interaction.options.getString("archive_id");
      if (!archiveId) return interaction.respond([]).catch(() => {});

      const board = await findArchiveById(guildId, archiveId);
      if (!board) return interaction.respond([]).catch(() => {});

      const guild = interaction.guild;
      let choices = [];

      if (board.type === "ROLE") {
        choices = guild.roles.cache
          .filter((r) => r.name !== "@everyone" && !r.managed)
          .filter(
            (r) =>
              r.name.toLowerCase().includes(focused) || r.id.includes(focused),
          )
          .sort((a, b) => a.name.localeCompare(b.name))
          .first(25)
          .map((r) => ({
            name: `${r.name} (${r.members?.size ?? 0} members)`,
            value: r.id,
          }));
      } else if (board.type === "USER") {
        choices = guild.members.cache
          .filter((m) => {
            const n = (m.displayName || m.user?.username || "").toLowerCase();
            return n.includes(focused) || m.id.includes(focused);
          })
          .sort((a, b) =>
            (a.displayName || "").localeCompare(b.displayName || ""),
          )
          .first(25)
          .map((m) => ({
            name: `${m.displayName || m.user?.username} (${m.id})`,
            value: m.id,
          }));
      } else {
        // CUSTOM — match existing entries
        choices = board.entries
          .filter((e) => (e.targetName || "").toLowerCase().includes(focused))
          .slice(0, 25)
          .map((e) => ({
            name: e.targetName || e.targetId,
            value: e.targetName || e.targetId,
          }));
      }

      return interaction.respond(choices).catch(() => {});
    }

    return interaction.respond([]).catch(() => {});
  },

  async execute(interaction) {
    // Premium gate
    if (!(await requireFeature(interaction, "scoreboards.archive"))) return;

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // Permission check for management
    if (MANAGEMENT_SUBS.includes(sub)) {
      const settings = await getGuildSettings(guildId);
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
            "You need the **Scoreboard Manager** role (or Manage Server permission) to manage archives.",
          ephemeral: true,
        });
      }
    }

    // Backfill archives on first access
    await backfillAllArchives(guildId).catch(() => {});

    try {
      switch (sub) {
        case "list":
        case "search": {
          const month = interaction.options.getString("month");
          const query = interaction.options.getString("query");
          const filters = { month, query, page: 1 };

          const result = await searchArchives(guildId, filters);
          const embed = buildArchiveListEmbed(
            interaction.guild,
            result,
            filters,
          );
          const components = buildArchiveListButtons(result, filters);

          return interaction.reply({
            embeds: [embed],
            components: components.length > 0 ? components : [],
          });
        }

        case "view": {
          const archiveId = interaction.options.getString("archive_id", true);
          const board = await findArchiveById(guildId, archiveId);
          if (!board)
            return interaction.reply({
              content: `📭 Archive not found: \`${archiveId}\`. Use \`/archive list\` to browse.`,
              ephemeral: true,
            });

          const embed = buildArchiveViewEmbed(board, interaction.guild);
          const components = buildArchiveViewButtons(board);

          // Also show interactive scoreboard if needed
          return interaction.reply({
            embeds: [embed],
            components,
          });
        }

        case "restore": {
          const archiveId = interaction.options.getString("archive_id", true);
          const newName = interaction.options.getString("new_name");

          const {
            restoreArchiveAsNew,
          } = require("../../modules/scoreboards/archiveService");

          try {
            const board = await findArchiveById(guildId, archiveId);
            if (!board)
              return interaction.reply({
                content: `📭 Archive not found: \`${archiveId}\`.`,
                ephemeral: true,
              });

            const restored = await restoreArchiveAsNew(
              board.id,
              guildId,
              newName,
              interaction.user.id,
            );

            return interaction.reply({
              content: `♻️ **Archive ${board.friendlyArchiveId || archiveId}** restored as live scoreboard **${restored.name}**!\nUse \`/scoreboard repair\` to attach a live channel.`,
            });
          } catch (err) {
            return interaction.reply({
              content: `❌ ${err.message}`,
              ephemeral: true,
            });
          }
        }

        case "add-result": {
          const archiveId = interaction.options.getString("archive_id", true);
          const target = interaction.options.getString("target", true);
          const resultType = interaction.options.getString("result", true);
          const amount = interaction.options.getInteger("amount") || 1;

          const {
            addResultToArchive,
          } = require("../../modules/scoreboards/archiveService");

          try {
            const board = await findArchiveById(guildId, archiveId);
            if (!board)
              return interaction.reply({
                content: `📭 Archive not found: \`${archiveId}\`.`,
                ephemeral: true,
              });

            await addResultToArchive(
              guildId,
              board.id,
              target,
              board.type,
              resultType,
              amount,
              interaction.user.id,
            );

            const resultLabel =
              resultType === "win"
                ? `🏆 +${amount} win(s)`
                : resultType === "loss"
                  ? `💔 +${amount} loss(es)`
                  : `💯 +${amount} point(s)`;

            return interaction.reply({
              content: `${resultLabel} added to archive **${board.friendlyArchiveId || archiveId}** — **${board.name}**`,
            });
          } catch (err) {
            return interaction.reply({
              content: `❌ ${err.message}`,
              ephemeral: true,
            });
          }
        }

        default:
          return interaction.reply({
            content: "Unknown archive subcommand.",
            ephemeral: true,
          });
      }
    } catch (error) {
      console.error("[Archive Command Error]", error);
      return interaction
        .reply({
          content: `⚠️ Archive command failed: ${error.message}`,
          ephemeral: true,
        })
        .catch(() => {});
    }
  },
};
