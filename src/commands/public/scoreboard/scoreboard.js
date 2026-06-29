"use strict";

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const {
  createScoreboard,
  getScoreboard,
  getArchivedScoreboards,
  listActiveScoreboards,
  addResult,
  editEntry,
  deleteEntry,
  archiveScoreboard,
  restoreScoreboard,
  deleteScoreboard,
  renameScoreboard,
  mergeScoreboards,
  setTheme,
  setDescription,
  setTitle,
  setRoleImage,
  getTargetScores,
  buildScoreboardPage,
  buildScoreboardComponents,
  buildScoreboardEmbed,
  pushLiveEmbed,
  pushEntryLiveEmbed,
  buildEntryEmbed,
  repairLiveEmbed,
  getScoreboardById,
  buildInteractiveShowEmbed,
  buildShowComponents,
  batchRefreshLiveEmbeds,
  targetMention,
  targetDisplay,
} = require("../../../modules/scoreboards/service");
const { requireFeature } = require("../../../lib/premiumGate");
const {
  createDiscoreEmbed,
  getGuildSettings,
} = require("../../../lib/embedBuilder");

const ADMIN_SUBS = [
  "start",
  "addwin",
  "addloss",
  "addpoints",
  "edit",
  "delete-entry",
  "set-theme",
  "set-description",
  "set-title",
  "set-image",
  "rename",
  "merge",
  "delete",
  "repair",
];

// ── archive confirmation buttons ──────────────────────────────────────────────

function archiveConfirmRow(boardId, archiveNote, deleteEmbeds) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `sb:archive_confirm:${boardId}:${archiveNote}:${deleteEmbeds ? "1" : "0"}`,
      )
      .setLabel("Archive")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`sb:archive_cancel:${boardId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );
}

// ── leader-change announcement ────────────────────────────────────────────────

async function announceLeaderChange(interaction, board, newLeaderId) {
  const mention =
    board.type === "ROLE"
      ? `<@&${newLeaderId}>`
      : board.type === "USER"
        ? `<@${newLeaderId}>`
        : newLeaderId;
  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("👑 New Leader!")
    .setDescription(
      `${mention} has taken the top spot on **${board.liveTitle || board.name}**!`,
    )
    .setTimestamp()
    .setFooter({ text: "Powered by Discore" });

  const targetChannel = board.channelId
    ? await interaction.client.channels.fetch(board.channelId).catch(() => null)
    : null;
  await (targetChannel ?? interaction.channel)
    .send({ embeds: [embed] })
    .catch(() => {});
}

// ── autocomplete ─────────────────────────────────────────────────────────────

async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const sub = interaction.options.getSubcommand(false);
  const focusedOpt = interaction.options.getFocused(true);

  // ── target autocomplete: show roles or users based on selected board type ─
  if (focusedOpt?.name === "target") {
    const boardName = interaction.options.getString("name");
    if (!boardName) {
      return interaction.respond([]).catch(() => {});
    }

    // Find the selected board to determine its type
    const board = await prisma.scoreboard.findFirst({
      where: {
        guildId: interaction.guildId,
        name: { equals: boardName, mode: "insensitive" },
      },
    });
    if (!board) return interaction.respond([]).catch(() => {});

    const guild = interaction.guild;
    let choices = [];

    if (board.type === "ROLE") {
      // Show roles from the guild cache (Collection → array for slice)
      const filtered = guild.roles.cache
        .filter((r) => r.name !== "@everyone" && !r.managed)
        .filter(
          (r) =>
            r.name.toLowerCase().includes(focused) || r.id.includes(focused),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      choices = Array.from(filtered.first(25).values()).map((r) => ({
        name: `${r.name}  (${r.members?.size ?? 0} members)`,
        value: r.id,
      }));
    } else if (board.type === "USER") {
      // Show members from the guild cache
      const filtered = guild.members.cache
        .filter((m) => {
          const name = (m.displayName || m.user?.username || "").toLowerCase();
          return name.includes(focused) || m.id.includes(focused);
        })
        .sort((a, b) => {
          const aName = a.displayName || a.user?.username || "";
          const bName = b.displayName || b.user?.username || "";
          return aName.localeCompare(bName);
        });
      choices = Array.from(filtered.first(25).values()).map((m) => ({
        name: `${m.displayName || m.user?.username}  (${m.id})`,
        value: m.id,
      }));
    }
    // CUSTOM type gets no autocomplete — user types freely

    return interaction.respond(choices).catch(() => {});
  }

  // ── score_type autocomplete: show existing types for selected scoreboard ─
  if (focusedOpt?.name === "score_type") {
    const boardName = interaction.options.getString("name");
    if (!boardName) {
      return interaction.respond([]).catch(() => {});
    }

    const board = await prisma.scoreboard.findFirst({
      where: {
        guildId: interaction.guildId,
        name: { equals: boardName, mode: "insensitive" },
      },
    });
    if (!board) return interaction.respond([]).catch(() => {});

    const {
      getScoreTypes,
    } = require("../../../modules/scoreboards/scoreTypes");
    const types = await getScoreTypes(board.id);
    const choices = types
      .filter((t) => t.name.toLowerCase().includes(focused))
      .slice(0, 20)
      .map((t) => ({ name: t.name, value: t.name }));
    return interaction.respond(choices).catch(() => {});
  }

  // ── scoreboard name autocomplete (existing logic) ────────────────────────
  const includeArchived = false;

  let boards;
  if (includeArchived) {
    boards = await prisma.scoreboard.findMany({
      where: { guildId: interaction.guildId },
      include: { entries: true },
      orderBy: { name: "asc" },
    });
  } else {
    boards = await listActiveScoreboards(interaction.guildId).catch(() => []);
  }

  const metricFilter =
    sub === "addwin" || sub === "addloss"
      ? "WIN_LOSS"
      : sub === "addpoints"
        ? "POINTS"
        : null;

  const choices = boards
    .filter((b) => !metricFilter || b.metric === metricFilter)
    .filter((b) => b.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((b) => {
      const modeLabel = b.metric === "POINTS" ? "Points" : "Win/Loss";
      const typeLabel =
        b.type === "ROLE" ? "Roles" : b.type === "CUSTOM" ? "Custom" : "Users";
      const archivedLabel = b.isArchived ? " 📦" : "";
      return {
        name: `${b.liveTitle || b.name}${archivedLabel}  (${modeLabel} · ${typeLabel} · ${b.entries.length} entries)`,
        value: b.name,
      };
    });
  await interaction.respond(choices).catch(() => {});
}

module.exports = {
  scope: "PUBLIC",
  autocomplete,
  data: new SlashCommandBuilder()
    .setName("scoreboard")
    .setDescription("Create and manage Discore scoreboards.")

    // ── read-only ──────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("show")
        .setDescription(
          "Show a scoreboard. Leave name blank to pick from a list.",
        )
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription(
              "Scoreboard name (optional — omit to pick from list)",
            )
            .setRequired(false)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription("List all active scoreboards."),
    )
    .addSubcommand((s) =>
      s
        .setName("scores")
        .setDescription("See a user or role's scores across all scoreboards.")
        .addUserOption((o) => o.setName("user").setDescription("Discord user"))
        .addRoleOption((o) => o.setName("role").setDescription("Discord role")),
    )

    // ── write (require ManageGuild or scoreboard manager role) ─────────────
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("Create a live scoreboard.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("metric")
            .setDescription("Ranking metric")
            .setRequired(true)
            .addChoices(
              {
                name: "Win / Loss  (tracks wins, losses, ratio, streaks)",
                value: "WIN_LOSS",
              },
              { name: "Points  (add/subtract point totals)", value: "POINTS" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Track users, roles, or custom targets")
            .addChoices(
              { name: "Users", value: "USER" },
              { name: "Roles", value: "ROLE" },
              { name: "Custom Text", value: "CUSTOM" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("description")
            .setDescription("Short description / season info"),
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Live scoreboard channel")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addBooleanOption((o) =>
          o
            .setName("categories")
            .setDescription("Enable category support? (default: false)"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("addwin")
        .setDescription("Add a win to a scoreboard.")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Scoreboard name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("target")
            .setDescription(
              "Target to add the win to (matches the scoreboard's type)",
            )
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("category")
            .setDescription("Category name (for category boards)"),
        )
        .addStringOption((o) =>
          o
            .setName("score_type")
            .setDescription(
              "Score category/type (e.g. WW3 4x, Apocalypse) — premium feature",
            )
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("addloss")
        .setDescription("Add a loss to a scoreboard.")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Scoreboard name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("target")
            .setDescription(
              "Target to add the loss to (matches the scoreboard's type)",
            )
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("category")
            .setDescription("Category name (for category boards)"),
        )
        .addStringOption((o) =>
          o
            .setName("score_type")
            .setDescription(
              "Score category/type (e.g. WW3 4x, Apocalypse) — premium feature",
            )
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("addpoints")
        .setDescription("Add or subtract points.")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Scoreboard name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("target")
            .setDescription(
              "Target to add points to (matches the scoreboard's type)",
            )
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("points")
            .setDescription("Points (negative = subtract)")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("category")
            .setDescription("Category name (for category boards)"),
        )
        .addStringOption((o) =>
          o
            .setName("score_type")
            .setDescription(
              "Score category/type (e.g. WW3 4x, Apocalypse) — premium feature",
            )
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("edit")
        .setDescription("Manually set a score entry.")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Scoreboard name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((o) => o.setName("user").setDescription("User target"))
        .addRoleOption((o) => o.setName("role").setDescription("Role target"))
        .addStringOption((o) =>
          o.setName("custom").setDescription("Custom target name"),
        )
        .addIntegerOption((o) => o.setName("wins").setDescription("Wins"))
        .addIntegerOption((o) => o.setName("losses").setDescription("Losses"))
        .addIntegerOption((o) =>
          o.setName("win_streak").setDescription("Win streak"),
        )
        .addIntegerOption((o) =>
          o.setName("loss_streak").setDescription("Loss streak"),
        )
        .addIntegerOption((o) => o.setName("points").setDescription("Points")),
    )
    .addSubcommand((s) =>
      s
        .setName("delete-entry")
        .setDescription("Delete a score entry from a scoreboard.")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Scoreboard name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((o) => o.setName("user").setDescription("User target"))
        .addRoleOption((o) => o.setName("role").setDescription("Role target"))
        .addStringOption((o) =>
          o.setName("custom").setDescription("Custom target name"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("set-theme")
        .setDescription("Set a custom colour for a scoreboard.")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Scoreboard name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("color")
            .setDescription("Hex colour, e.g. #FF5733")
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("set-description")
        .setDescription("Set the description/season info of a scoreboard.")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Scoreboard name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("description")
            .setDescription("New description")
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("set-title")
        .setDescription("Set the live embed title of a scoreboard.")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Scoreboard name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o.setName("title").setDescription("New title text").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("set-image")
        .setDescription(
          "Set a team or role image for a scoreboard (shown as thumbnail).",
        )
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Scoreboard name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("url")
            .setDescription("Image URL (https://...)")
            .setRequired(false),
        )
        .addBooleanOption((o) =>
          o.setName("remove").setDescription("Remove the current image"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("rename")
        .setDescription("Rename a scoreboard.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Current name").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("new_name").setDescription("New name").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("merge")
        .setDescription("Merge one scoreboard into another. (Premium feature)")
        .addStringOption((o) =>
          o
            .setName("merging_board")
            .setDescription(
              "The scoreboard whose scores will be copied into the base board",
            )
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("base_board")
            .setDescription(
              "The destination scoreboard that will receive the merged scores (keeps history)",
            )
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("after_merge")
            .setDescription(
              "What should happen to the merging board after scores are copied?",
            )
            .setRequired(true)
            .addChoices(
              {
                name: "📦 Archive — Save merging board to archives (recommended)",
                value: "merge_archive",
              },
              {
                name: "🗑️ Delete — Permanently remove the merging board",
                value: "merge_delete",
              },
              {
                name: "🧹 Clear & Keep Live — Wipe scores but keep board active for re-use",
                value: "merge_clear_keep_live",
              },
              {
                name: "📋 Keep Live & Keep Scores — Copy scores without changing the merging board",
                value: "merge_keep_live_keep_scores",
              },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("repair")
        .setDescription("Repair a live scoreboard's channel message.")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Scoreboard name")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription("Permanently delete a scoreboard.")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Scoreboard name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("confirm")
            .setDescription('Type "DELETE" to confirm')
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    const guildIconUrl =
      interaction.guild?.iconURL({ size: 128, extension: "png" }) ?? undefined;
    const discoreIconUrl =
      interaction.client.user?.displayAvatarURL({
        size: 64,
        extension: "png",
      }) ?? undefined;
    const embedOpts = { guildIconUrl, discoreIconUrl };

    // ── permission check for write operations ──────────────────────────────
    if (ADMIN_SUBS.includes(sub)) {
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

    // ── show ───────────────────────────────────────────────────────────────
    if (sub === "show") {
      const name = interaction.options.getString("name");

      if (!name) {
        // Show dropdown of active scoreboards
        const boards = await listActiveScoreboards(interaction.guildId);
        if (!boards.length) {
          return interaction.reply({
            content:
              "⚠️ No active scoreboards. Create one with `/scoreboard start`.",
            ephemeral: true,
          });
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("sb:show_select:")
          .setPlaceholder("Select a scoreboard to view...")
          .addOptions(
            boards.map((b) => {
              const modeLabel = b.metric === "POINTS" ? "Points" : "Win/Loss";
              const typeLabel =
                b.type === "ROLE"
                  ? "Roles"
                  : b.type === "CUSTOM"
                    ? "Custom"
                    : "Users";
              return new StringSelectMenuOptionBuilder()
                .setLabel((b.liveTitle || b.name).substring(0, 25))
                .setDescription(
                  `${modeLabel} · ${typeLabel} · ${b.entries.length} entries${b.hasCategories ? " · Categories" : ""}`,
                )
                .setValue(b.id);
            }),
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        return interaction.reply({
          content:
            "✨ **Select a scoreboard from the list below to view details:**",
          components: [row],
          ephemeral: true,
        });
      }

      // Direct show
      const board = await getScoreboard(interaction.guildId, name);
      if (!board)
        return interaction.reply({
          content: "Scoreboard not found.",
          ephemeral: true,
        });

      const viewMode = board.hasCategories ? "combined" : "flat";
      const {
        embed,
        page: safePage,
        totalPages,
      } = buildInteractiveShowEmbed(board, viewMode, 1, "WINS", embedOpts);
      const components = buildShowComponents(
        board.id,
        safePage,
        totalPages,
        board.metric,
        "WINS",
        viewMode,
        board,
      );
      return interaction.reply({ embeds: [embed], components });
    }

    // ── list ───────────────────────────────────────────────────────────────
    if (sub === "list") {
      const boards = await listActiveScoreboards(interaction.guildId);
      if (!boards.length)
        return interaction.reply({
          content:
            "No active scoreboards. Create one with `/scoreboard start`.",
          ephemeral: true,
        });

      const lines = boards.map((b) => {
        const entries = b.entries.length;
        const status = b.repairStatus !== "OK" ? " ⚠️" : "";
        const live = b.channelId ? ` · <#${b.channelId}>` : "";
        const modeLabel = b.metric === "POINTS" ? "Points" : "Win / Loss";
        const catLabel = b.hasCategories ? " · Categories" : "";
        return `**${b.liveTitle || b.name}**${status} — ${modeLabel}${catLabel} · ${entries} entries${live}`;
      });
      const embed = await createDiscoreEmbed(interaction, {
        title: `📋 Active Scoreboards (${boards.length})`,
        description: lines.join("\n"),
      });
      return interaction.reply({ embeds: [embed] });
    }

    // ── scores ─────────────────────────────────────────────────────────────
    if (sub === "scores") {
      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");
      if (!user && !role)
        return interaction.reply({
          content: "Provide a user or role.",
          ephemeral: true,
        });

      const targetId = (user || role).id;
      const results = await getTargetScores({
        guildId: interaction.guildId,
        targetId,
      });
      if (!results.length)
        return interaction.reply({
          content: "No scores found.",
          ephemeral: true,
        });

      const active = results.filter((r) => !r.board.isArchived);
      const archived = results.filter((r) => r.board.isArchived);
      const fmt = ({ board, entry }) => {
        const name = board.liveTitle || board.name;
        if (board.metric === "POINTS")
          return `**${name}**: ${entry.points} pts`;
        return `**${name}**: ${entry.wins}W / ${entry.losses}L (${((entry.wins / Math.max(1, entry.wins + entry.losses)) * 100).toFixed(0)}% win)`;
      };

      const embed = await createDiscoreEmbed(interaction, {
        title: `📊 Score Summary — ${user ? (user.displayName ?? user.username) : role.name}`,
        fields: [
          active.length
            ? {
                name: "🟢 Active",
                value: active.map(fmt).join("\n"),
                inline: false,
              }
            : null,
          archived.length
            ? {
                name: "📦 Archived",
                value: archived.map(fmt).join("\n"),
                inline: false,
              }
            : null,
        ].filter(Boolean),
      });
      return interaction.reply({ embeds: [embed] });
    }

    // ── start ──────────────────────────────────────────────────────────────
    if (sub === "start") {
      await interaction.deferReply({ flags: 64 });
      const name = interaction.options.getString("name", true);
      const metric = interaction.options.getString("metric", true);
      const type = interaction.options.getString("type") ?? "USER";
      const description = interaction.options.getString("description");
      const channel =
        interaction.options.getChannel("channel") ?? interaction.channel;
      const hasCategories =
        interaction.options.getBoolean("categories") ?? false;

      const board = await createScoreboard({
        guildId: interaction.guildId,
        name,
        metric,
        type,
        channelId: channel.id,
        description,
        createdBy: interaction.user.id,
        hasCategories,
      });

      // Post the live embed immediately
      const { embed } = buildScoreboardPage(
        { ...board, entries: [] },
        1,
        embedOpts,
      );
      const message = await channel.send({ embeds: [embed] }).catch(() => null);
      if (message) {
        await prisma.scoreboard
          .update({ where: { id: board.id }, data: { messageId: message.id } })
          .catch(() => {});
      }

      const typeLabel =
        type === "ROLE"
          ? "roles"
          : type === "CUSTOM"
            ? "custom targets"
            : "users";
      const catInfo = hasCategories ? " · Categories enabled" : "";
      return interaction.editReply({
        content: `✅ Scoreboard **${name}** created in ${channel} (tracking ${typeLabel}).${catInfo}\nID: \`${board.publicId}\``,
      });
    }

    // ── addwin / addloss ───────────────────────────────────────────────────
    if (sub === "addwin" || sub === "addloss") {
      const action = sub === "addwin" ? "WIN" : "LOSS";
      const boardName = interaction.options.getString("name", true);
      const targetInput = interaction.options.getString("target", true);
      const category = interaction.options.getString("category");

      // Validate board
      const boardCheck = await getScoreboard(interaction.guildId, boardName);
      if (!boardCheck)
        return interaction.reply({
          content: `❌ Scoreboard **${boardName}** not found.`,
          flags: 64,
        });
      if (boardCheck.metric !== "WIN_LOSS")
        return interaction.reply({
          content: `❌ **${boardCheck.liveTitle || boardCheck.name}** is a Points board — use \`/scoreboard addpoints\`.`,
          flags: 64,
        });

      // Auto-resolve target based on scoreboard type
      let targetId, targetType, targetName, targetLabel;
      if (boardCheck.type === "USER") {
        // Try to parse as user mention/ID
        const match = targetInput.match(/^<@!?(\d+)>$/);
        const userId = match ? match[1] : targetInput.replace(/\D/g, "");
        targetId = userId || targetInput;
        targetType = "USER";
        targetLabel = `<@${targetId}>`;
      } else if (boardCheck.type === "ROLE") {
        const match = targetInput.match(/^<@&(\d+)>$/);
        const roleId = match ? match[1] : targetInput.replace(/\D/g, "");
        targetId = roleId || targetInput;
        targetType = "ROLE";
        targetName = targetInput;
        targetLabel = `<@&${targetId}>`;
      } else {
        // CUSTOM
        targetId = targetInput;
        targetType = "CUSTOM";
        targetName = targetInput;
        targetLabel = `**${targetInput}**`;
      }

      const scoreType = interaction.options.getString("score_type");
      await interaction.deferReply({ flags: 64 });

      try {
        const result = await addResult({
          guildId: interaction.guildId,
          scoreboardName: boardName,
          targetId,
          targetType,
          targetName: targetName || null,
          action,
          adminId: interaction.user.id,
          guild: interaction.guild,
          category,
          scoreType,
        });

        const freshEntry = result.board.entries.find(
          (e) => e.targetId === targetId,
        );
        const actionLabel = action === "WIN" ? "win 🏆" : "loss ☠️";

        pushLiveEmbed(interaction.client, result.board).catch(() => {});
        if (freshEntry)
          pushEntryLiveEmbed(
            interaction.client,
            interaction.guild,
            result.board,
            freshEntry,
          ).catch(() => {});
        if (result.leaderChange)
          announceLeaderChange(
            interaction,
            result.board,
            result.leaderChange.newLeaderId,
          );

        const e = freshEntry;
        return interaction.editReply({
          content: [
            `✅ **1 ${actionLabel}** added for ${targetLabel} on **${result.board.liveTitle || result.board.name}**`,
            e
              ? `> \`${e.wins}W\` / \`${e.losses}L\`${e.winStreak > 1 ? `  ·  🔥 ${e.winStreak} win streak` : e.lossStreak > 1 ? `  ·  💀 ${e.lossStreak} loss streak` : ""}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        });
      } catch (err) {
        return interaction.editReply({ content: `❌ ${err.message}` });
      }
    }

    // ── addpoints ──────────────────────────────────────────────────────
    if (sub === "addpoints") {
      const boardName = interaction.options.getString("name", true);
      const targetInput = interaction.options.getString("target", true);
      const delta = interaction.options.getInteger("points", true);
      const category = interaction.options.getString("category");

      const boardCheck = await getScoreboard(interaction.guildId, boardName);
      if (!boardCheck)
        return interaction.reply({
          content: `❌ Scoreboard **${boardName}** not found.`,
          flags: 64,
        });
      if (boardCheck.metric !== "POINTS")
        return interaction.reply({
          content: `❌ **${boardCheck.liveTitle || boardCheck.name}** is a Win/Loss board. Use \`/scoreboard addwin\` or \`addloss\`.`,
          flags: 64,
        });

      // Auto-resolve target based on scoreboard type
      let targetId, targetType, targetName, targetLabel;
      if (boardCheck.type === "USER") {
        const match = targetInput.match(/^<@!?(\d+)>$/);
        const userId = match ? match[1] : targetInput.replace(/\D/g, "");
        targetId = userId || targetInput;
        targetType = "USER";
        targetLabel = `<@${targetId}>`;
      } else if (boardCheck.type === "ROLE") {
        const match = targetInput.match(/^<@&(\d+)>$/);
        const roleId = match ? match[1] : targetInput.replace(/\D/g, "");
        targetId = roleId || targetInput;
        targetType = "ROLE";
        targetName = targetInput;
        targetLabel = `<@&${targetId}>`;
      } else {
        targetId = targetInput;
        targetType = "CUSTOM";
        targetName = targetInput;
        targetLabel = `**${targetInput}**`;
      }

      await interaction.deferReply({ flags: 64 });

      try {
        const scoreType = interaction.options.getString("score_type");
        const result = await addResult({
          guildId: interaction.guildId,
          scoreboardName: boardName,
          targetId,
          targetType,
          targetName: targetName || null,
          action: "POINT",
          delta,
          adminId: interaction.user.id,
          guild: interaction.guild,
          category,
          scoreType,
        });

        const freshEntry = result.board.entries.find(
          (e) => e.targetId === targetId,
        );

        pushLiveEmbed(interaction.client, result.board).catch(() => {});
        if (freshEntry)
          pushEntryLiveEmbed(
            interaction.client,
            interaction.guild,
            result.board,
            freshEntry,
          ).catch(() => {});
        if (result.leaderChange)
          announceLeaderChange(
            interaction,
            result.board,
            result.leaderChange.newLeaderId,
          );

        const sign = delta >= 0 ? `+${delta}` : String(delta);
        return interaction.editReply({
          content: [
            `✅ **${sign} points** recorded for ${targetLabel} on **${result.board.liveTitle || result.board.name}**`,
            freshEntry ? `> Total: \`${freshEntry.points}\` points` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        });
      } catch (err) {
        return interaction.editReply({ content: `❌ ${err.message}` });
      }
    }

    // ── edit ───────────────────────────────────────────────────────────────
    if (sub === "edit") {
      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");
      const customName = interaction.options.getString("custom");
      if (!user && !role && !customName)
        return interaction.reply({
          content: "Provide a user, role, or custom target.",
          ephemeral: true,
        });

      const targetType = role ? "ROLE" : user ? "USER" : "CUSTOM";
      const targetId = role ? role.id : user ? user.id : customName;

      const result = await editEntry({
        guildId: interaction.guildId,
        scoreboardName: interaction.options.getString("name", true),
        targetId,
        targetType,
        wins: interaction.options.getInteger("wins") ?? undefined,
        losses: interaction.options.getInteger("losses") ?? undefined,
        points: interaction.options.getInteger("points") ?? undefined,
        winStreak: interaction.options.getInteger("win_streak") ?? undefined,
        lossStreak: interaction.options.getInteger("loss_streak") ?? undefined,
        adminId: interaction.user.id,
      });

      const { embed } = buildScoreboardPage(result.board, 1);
      await pushLiveEmbed(interaction.client, result.board);
      const displayName = user ? user.username : role ? role.name : customName;
      return interaction.reply({
        content: `✅ Entry updated for **${displayName}**.`,
        embeds: [embed],
        ephemeral: true,
      });
    }

    // ── delete-entry ───────────────────────────────────────────────────────
    if (sub === "delete-entry") {
      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");
      const customName = interaction.options.getString("custom");
      if (!user && !role && !customName)
        return interaction.reply({
          content: "Provide a user, role, or custom target.",
          ephemeral: true,
        });

      const targetId = role ? role.id : user ? user.id : customName;

      const board = await deleteEntry({
        guildId: interaction.guildId,
        scoreboardName: interaction.options.getString("name", true),
        targetId,
        adminId: interaction.user.id,
      });

      const { embed } = buildScoreboardPage(board, 1);
      await pushLiveEmbed(interaction.client, board);
      const displayName = user ? user.username : role ? role.name : customName;
      return interaction.reply({
        content: `✅ Entry for **${displayName}** deleted.`,
        embeds: [embed],
        ephemeral: true,
      });
    }

    // ── set-theme ──────────────────────────────────────────────────────────
    if (sub === "set-theme") {
      const color = interaction.options.getString("color", true).trim();
      if (!/^#[0-9A-Fa-f]{6}$/.test(color))
        return interaction.reply({
          content: "Invalid hex color. Use format `#FF5733`.",
          ephemeral: true,
        });

      const board = await setTheme({
        guildId: interaction.guildId,
        name: interaction.options.getString("name", true),
        color,
      });
      return interaction.reply({
        content: `✅ Theme for **${board.name}** set to \`${color}\`.`,
        ephemeral: true,
      });
    }

    // ── set-description ────────────────────────────────────────────────────
    if (sub === "set-description") {
      const board = await setDescription({
        guildId: interaction.guildId,
        name: interaction.options.getString("name", true),
        description: interaction.options.getString("description", true),
      });
      return interaction.reply({
        content: `✅ Description for **${board.name}** updated.`,
        ephemeral: true,
      });
    }

    // ── set-title ──────────────────────────────────────────────────────────
    if (sub === "set-title") {
      const board = await setTitle({
        guildId: interaction.guildId,
        name: interaction.options.getString("name", true),
        title: interaction.options.getString("title", true),
      });
      return interaction.reply({
        content: `✅ Live title for **${board.name}** set to **${board.liveTitle}**.`,
        ephemeral: true,
      });
    }

    // ── set-image ──────────────────────────────────────────────────────────
    if (sub === "set-image") {
      const remove = interaction.options.getBoolean("remove") ?? false;
      const urlInput = interaction.options.getString("url");

      if (!remove && !urlInput)
        return interaction.reply({
          content: "Provide an image URL or use `remove: True` to clear it.",
          ephemeral: true,
        });

      if (urlInput && !urlInput.startsWith("https://"))
        return interaction.reply({
          content: "Image URL must start with `https://`.",
          ephemeral: true,
        });

      const imageUrl = remove ? null : urlInput;
      await setRoleImage({
        guildId: interaction.guildId,
        name: interaction.options.getString("name", true),
        imageUrl,
      });
      return interaction.reply({
        content: remove
          ? "✅ Image removed from scoreboard."
          : `✅ Image set. It will appear as a thumbnail on the scoreboard embed.`,
        ephemeral: true,
      });
    }

    // ── rename ─────────────────────────────────────────────────────────────
    if (sub === "rename") {
      const board = await renameScoreboard({
        guildId: interaction.guildId,
        oldName: interaction.options.getString("name", true),
        newName: interaction.options.getString("new_name", true),
      });
      return interaction.reply({
        content: `✅ Scoreboard renamed to **${board.name}**.`,
        ephemeral: true,
      });
    }

    // ── merge ──────────────────────────────────────────────────────────────
    if (sub === "merge") {
      if (!(await requireFeature(interaction, "scoreboards.merge"))) return;
      const sourceName = interaction.options.getString("merging_board", true);
      const targetName = interaction.options.getString("base_board", true);
      const afterMerge = interaction.options.getString("after_merge", true);

      await interaction.deferReply({ ephemeral: true });

      try {
        const result = await mergeScoreboards({
          guildId: interaction.guildId,
          sourceName,
          targetName,
          afterMerge,
          adminId: interaction.user.id,
        });

        // Fire-and-forget background embed updates
        const client = interaction.client;
        pushLiveEmbed(client, result.board).catch(() => {});

        // For clear_keep_live, also update source embed and warn about timing
        if (afterMerge === "merge_clear_keep_live") {
          const sourceBoard = await prisma.scoreboard.findUnique({
            where: { id: result.sourceId },
          });
          if (sourceBoard) {
            pushLiveEmbed(client, { ...sourceBoard, entries: [] }).catch(
              () => {},
            );
          }
          return interaction.editReply({
            content:
              `✅ Merged **${result.sourceName}** into **${result.board.liveTitle || result.board.name}** ` +
              `(${result.entriesMerged} entries).\n\n` +
              `⚠️ Merge complete. Source scoreboard has been cleared and kept live. ` +
              `Live embeds may take up to 10 minutes to fully update.`,
          });
        }

        if (afterMerge === "merge_delete") {
          return interaction.editReply({
            content:
              `✅ Merged **${result.sourceName}** into **${result.board.liveTitle || result.board.name}** ` +
              `(${result.entriesMerged} entries). Source scoreboard has been permanently deleted.`,
          });
        }

        return interaction.editReply({
          content:
            `✅ Merged **${result.sourceName}** into **${result.board.liveTitle || result.board.name}** ` +
            `(${result.entriesMerged} entries).\nSource action: ${result.sourceAction}`,
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ Merge failed: ${err.message}`,
        });
      }
    }

    // ── repair ─────────────────────────────────────────────────────────────
    if (sub === "repair") {
      const name = interaction.options.getString("name", true);
      const board = await getScoreboard(interaction.guildId, name);
      if (!board)
        return interaction.reply({
          content: "Scoreboard not found.",
          ephemeral: true,
        });

      await interaction.deferReply({ ephemeral: true });
      const status = await repairLiveEmbed(interaction.client, board.id);

      const msgs = {
        REPAIRED: `✅ Scoreboard **${name}** repaired — live message recreated.`,
        OK: `✅ Scoreboard **${name}** is healthy. Nothing to repair.`,
        NO_CHANNEL: `⚠️ No live channel set for **${name}**. Use \`/scoreboard start\` to set one.`,
        CHANNEL_MISSING: `❌ The channel for **${name}** no longer exists. Set a new live channel with \`/scoreboard start\`.`,
        NO_PERMS: `❌ Missing **Send Messages** permission in the scoreboard channel for **${name}**.`,
      };
      return interaction.editReply({
        content: msgs[status] ?? `Repair result: ${status}`,
      });
    }

    // ── delete ─────────────────────────────────────────────────────────────
    if (sub === "delete") {
      if (interaction.options.getString("confirm", true) !== "DELETE")
        return interaction.reply({
          content:
            "⚠️ Type `DELETE` in the confirm field to permanently delete a scoreboard.",
          ephemeral: true,
        });

      const board = await deleteScoreboard({
        guildId: interaction.guildId,
        name: interaction.options.getString("name", true),
      });
      return interaction.reply({
        content: `🗑️ Scoreboard **${board.name}** and all its entries permanently deleted.`,
        ephemeral: true,
      });
    }
  },
};
