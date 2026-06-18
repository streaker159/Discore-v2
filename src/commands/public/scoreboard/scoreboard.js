const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
  buildScoreboardEmbed,
  pushLiveEmbed,
  pushEntryLiveEmbed,
  buildEntryEmbed,
  repairLiveEmbed,
  getScoreboardById,
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
  "archive",
  "restore",
  "merge",
  "set-theme",
  "set-description",
  "set-title",
  "set-image",
  "rename",
  "delete",
  "delete-entry",
  "edit",
  "repair",
];

// ── pagination button row ─────────────────────────────────────────────────────

function pageButtons(boardId, currentPage, totalPages) {
  const row = new ActionRowBuilder().addComponents(
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
  return row;
}

// ── archive confirmation buttons ──────────────────────────────────────────────

function archiveConfirmRow(boardId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`scoreboard:archive_confirm:${boardId}`)
      .setLabel("Archive")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`scoreboard:archive_cancel:${boardId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );
}

// ── leader-change announcement ────────────────────────────────────────────────

async function announceLeaderChange(interaction, board, newLeaderId) {
  const mention =
    board.type === "ROLE" ? `<@&${newLeaderId}>` : `<@${newLeaderId}>`;
  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("👑 New Leader!")
    .setDescription(
      `${mention} has taken the top spot on **${board.liveTitle || board.name}**!`,
    )
    .setTimestamp()
    .setFooter({ text: "Powered by Discore" });
  await interaction.channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("scoreboard")
    .setDescription("Create and manage Discore scoreboards.")

    // ── read-only ──────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("show")
        .setDescription("Show a scoreboard.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("page")
            .setDescription("Page number (default: 1)")
            .setMinValue(1),
        ),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription("List all active scoreboards."),
    )
    .addSubcommand((s) =>
      s
        .setName("view-archive")
        .setDescription("List all archived scoreboards."),
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
            .setDescription("Track users or roles")
            .addChoices(
              { name: "Users", value: "USER" },
              { name: "Roles", value: "ROLE" },
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
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("addwin")
        .setDescription("Add a win.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        )
        .addUserOption((o) => o.setName("user").setDescription("User target"))
        .addRoleOption((o) => o.setName("role").setDescription("Role target"))
        .addStringOption((o) => o.setName("reason").setDescription("Reason")),
    )
    .addSubcommand((s) =>
      s
        .setName("addloss")
        .setDescription("Add a loss.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        )
        .addUserOption((o) => o.setName("user").setDescription("User target"))
        .addRoleOption((o) => o.setName("role").setDescription("Role target"))
        .addStringOption((o) => o.setName("reason").setDescription("Reason")),
    )
    .addSubcommand((s) =>
      s
        .setName("addpoints")
        .setDescription("Add or subtract points.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("points")
            .setDescription("Points (negative = subtract)")
            .setRequired(true),
        )
        .addUserOption((o) => o.setName("user").setDescription("User target"))
        .addRoleOption((o) => o.setName("role").setDescription("Role target")),
    )
    .addSubcommand((s) =>
      s
        .setName("edit")
        .setDescription("Manually set a score entry.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        )
        .addUserOption((o) => o.setName("user").setDescription("User target"))
        .addRoleOption((o) => o.setName("role").setDescription("Role target"))
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
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        )
        .addUserOption((o) => o.setName("user").setDescription("User target"))
        .addRoleOption((o) => o.setName("role").setDescription("Role target")),
    )
    .addSubcommand((s) =>
      s
        .setName("set-theme")
        .setDescription("Set a custom colour for a scoreboard.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
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
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
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
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
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
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
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
        .setName("archive")
        .setDescription("Archive a scoreboard.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("note")
            .setDescription("Optional archive note (e.g. 'Season 1 final')"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("restore")
        .setDescription("Restore an archived scoreboard.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("merge")
        .setDescription("Merge one scoreboard into another.")
        .addStringOption((o) =>
          o
            .setName("source")
            .setDescription("Source scoreboard name")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("target")
            .setDescription("Target scoreboard name")
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("repair")
        .setDescription("Repair a live scoreboard's channel message.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription("Permanently delete a scoreboard.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
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
      const name = interaction.options.getString("name", true);
      const page = interaction.options.getInteger("page") ?? 1;
      const board = await getScoreboard(interaction.guildId, name);
      if (!board)
        return interaction.reply({
          content: "Scoreboard not found.",
          ephemeral: true,
        });

      const {
        embed,
        page: safePage,
        totalPages,
      } = buildScoreboardPage(board, page);
      const components =
        totalPages > 1 ? [pageButtons(board.id, safePage, totalPages)] : [];
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
        return `**${b.liveTitle || b.name}**${status} — ${modeLabel} · ${entries} entries${live}`;
      });
      const embed = await createDiscoreEmbed(interaction, {
        title: `📋 Active Scoreboards (${boards.length})`,
        description: lines.join("\n"),
      });
      return interaction.reply({ embeds: [embed] });
    }

    // ── view-archive ───────────────────────────────────────────────────────
    if (sub === "view-archive") {
      const archived = await getArchivedScoreboards(interaction.guildId);
      if (!archived.length)
        return interaction.reply({
          content: "📭 No archived scoreboards.",
          ephemeral: true,
        });

      const lines = archived.map((b) => {
        const d = b.archivedAt
          ? ` · ${new Date(b.archivedAt).toLocaleDateString()}`
          : "";
        const note = b.archiveNote ? ` — *${b.archiveNote}*` : "";
        return `**${b.name}** (${b.entries.length} entries · ${b.metric})${d}${note}`;
      });
      const embed = await createDiscoreEmbed(interaction, {
        title: `🗃️ Archived Scoreboards (${archived.length})`,
        description: lines.join("\n"),
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
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
      const name = interaction.options.getString("name", true);
      const metric = interaction.options.getString("metric", true);
      const type = interaction.options.getString("type") ?? "USER";
      const description = interaction.options.getString("description");
      const channel =
        interaction.options.getChannel("channel") ?? interaction.channel;

      const board = await createScoreboard({
        guildId: interaction.guildId,
        name,
        metric,
        type,
        channelId: channel.id,
        description,
        createdBy: interaction.user.id,
      });

      // Post the live embed immediately
      const { embed } = buildScoreboardPage({ ...board, entries: [] }, 1);
      const message = await channel.send({ embeds: [embed] }).catch(() => null);
      if (message) {
        await prisma.scoreboard
          .update({ where: { id: board.id }, data: { messageId: message.id } })
          .catch(() => {});
      }

      return interaction.reply({
        content: `✅ Scoreboard **${name}** created in ${channel}. ID: \`${board.publicId}\``,
        ephemeral: true,
      });
    }

    // ── addwin / addloss ───────────────────────────────────────────────────
    if (sub === "addwin" || sub === "addloss") {
      const action = sub === "addwin" ? "WIN" : "LOSS";
      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");
      if (!user && !role)
        return interaction.reply({
          content: "Provide a user or role.",
          ephemeral: true,
        });

      const target = user || role;
      const targetType = role ? "ROLE" : "USER";
      const result = await addResult({
        guildId: interaction.guildId,
        scoreboardName: interaction.options.getString("name", true),
        targetId: target.id,
        targetType,
        action,
        adminId: interaction.user.id,
        reason: interaction.options.getString("reason"),
      });

      // Get fresh entry with liveChannelId/liveMessageId
      const freshEntry = result.board.entries.find(
        (e) => e.targetId === target.id,
      );
      const targetColor = role
        ? (interaction.guild.roles.cache.get(role.id)?.color ?? 0)
        : 0;
      const targetName = user
        ? (interaction.guild.members.cache.get(user.id)?.displayName ??
          user.username)
        : role.name;
      const mention = role ? `<@&${role.id}>` : `<@${user.id}>`;
      const entryEmbed = buildEntryEmbed(
        result.board,
        freshEntry,
        mention,
        targetName,
        targetColor,
      );

      await pushLiveEmbed(interaction.client, result.board).catch(() => {});
      if (freshEntry)
        await pushEntryLiveEmbed(
          interaction.client,
          interaction.guild,
          result.board,
          freshEntry,
        ).catch(() => {});
      if (result.leaderChange)
        await announceLeaderChange(
          interaction,
          result.board,
          result.leaderChange.newLeaderId,
        );
      return interaction.reply({ embeds: [entryEmbed] });
    }

    // ── addpoints ──────────────────────────────────────────────────────────
    if (sub === "addpoints") {
      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");
      if (!user && !role)
        return interaction.reply({
          content: "Provide a user or role.",
          ephemeral: true,
        });

      const target = user || role;
      const targetType = role ? "ROLE" : "USER";
      const delta = interaction.options.getInteger("points", true);
      const result = await addResult({
        guildId: interaction.guildId,
        scoreboardName: interaction.options.getString("name", true),
        targetId: target.id,
        targetType,
        action: "POINT",
        delta,
        adminId: interaction.user.id,
      });

      const freshEntry = result.board.entries.find(
        (e) => e.targetId === target.id,
      );
      const targetColor = role
        ? (interaction.guild.roles.cache.get(role.id)?.color ?? 0)
        : 0;
      const targetName = user
        ? (interaction.guild.members.cache.get(user.id)?.displayName ??
          user.username)
        : role.name;
      const mention = role ? `<@&${role.id}>` : `<@${user.id}>`;
      const entryEmbed = buildEntryEmbed(
        result.board,
        freshEntry,
        mention,
        targetName,
        targetColor,
      );

      await pushLiveEmbed(interaction.client, result.board).catch(() => {});
      if (freshEntry)
        await pushEntryLiveEmbed(
          interaction.client,
          interaction.guild,
          result.board,
          freshEntry,
        ).catch(() => {});
      if (result.leaderChange)
        await announceLeaderChange(
          interaction,
          result.board,
          result.leaderChange.newLeaderId,
        );
      return interaction.reply({ embeds: [entryEmbed] });
    }

    // ── edit ───────────────────────────────────────────────────────────────
    if (sub === "edit") {
      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");
      if (!user && !role)
        return interaction.reply({
          content: "Provide a user or role.",
          ephemeral: true,
        });

      const target = user || role;
      const result = await editEntry({
        guildId: interaction.guildId,
        scoreboardName: interaction.options.getString("name", true),
        targetId: target.id,
        targetType: role ? "ROLE" : "USER",
        wins: interaction.options.getInteger("wins") ?? undefined,
        losses: interaction.options.getInteger("losses") ?? undefined,
        points: interaction.options.getInteger("points") ?? undefined,
        winStreak: interaction.options.getInteger("win_streak") ?? undefined,
        lossStreak: interaction.options.getInteger("loss_streak") ?? undefined,
        adminId: interaction.user.id,
      });

      const { embed } = buildScoreboardPage(result.board, 1);
      await pushLiveEmbed(interaction.client, result.board);
      return interaction.reply({
        content: `✅ Entry updated for **${user ? user.username : role.name}**.`,
        embeds: [embed],
        ephemeral: true,
      });
    }

    // ── delete-entry ───────────────────────────────────────────────────────
    if (sub === "delete-entry") {
      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");
      if (!user && !role)
        return interaction.reply({
          content: "Provide a user or role.",
          ephemeral: true,
        });

      const target = user || role;
      const board = await deleteEntry({
        guildId: interaction.guildId,
        scoreboardName: interaction.options.getString("name", true),
        targetId: target.id,
        adminId: interaction.user.id,
      });

      const { embed } = buildScoreboardPage(board, 1);
      await pushLiveEmbed(interaction.client, board);
      return interaction.reply({
        content: `✅ Entry for **${user ? user.username : role.name}** deleted.`,
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

      // Validate URL is HTTPS if provided
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

    // ── archive ────────────────────────────────────────────────────────────
    if (sub === "archive") {
      const name = interaction.options.getString("name", true);
      const note = interaction.options.getString("note");

      const board = await getScoreboard(interaction.guildId, name);
      if (!board)
        return interaction.reply({
          content: "Scoreboard not found.",
          ephemeral: true,
        });

      const { embed } = buildScoreboardPage(board, 1);
      const confirmEmbed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("📦 Archive this scoreboard?")
        .setDescription(
          `You are about to archive **${board.name}** (${board.entries.length} entries).\n` +
            (note ? `Archive note: *${note}*\n` : "") +
            `\nThe live message will be detached. You can restore this later with \`/scoreboard restore\`.`,
        )
        .setFooter({
          text: board.publicId ? `ID: ${board.publicId}` : "Powered by Discore",
        });

      // Store note in customId (up to 100 chars total, so keep note short)
      const safeNote = (note ?? "").substring(0, 40).replace(/:/g, "");
      return interaction.reply({
        embeds: [confirmEmbed],
        components: [archiveConfirmRow(`${board.id}:${safeNote}`)],
        ephemeral: true,
      });
    }

    // ── restore ────────────────────────────────────────────────────────────
    if (sub === "restore") {
      const board = await restoreScoreboard({
        guildId: interaction.guildId,
        name: interaction.options.getString("name", true),
      });
      return interaction.reply({
        content: `♻️ **${board.name}** restored. Set a live channel with \`/scoreboard start\` or use \`/scoreboard repair\` to reattach.`,
        ephemeral: true,
      });
    }

    // ── merge ──────────────────────────────────────────────────────────────
    if (sub === "merge") {
      const merged = await mergeScoreboards({
        guildId: interaction.guildId,
        sourceName: interaction.options.getString("source", true),
        targetName: interaction.options.getString("target", true),
        adminId: interaction.user.id,
      });
      const { embed } = buildScoreboardPage(merged, 1);
      await pushLiveEmbed(interaction.client, merged);
      return interaction.reply({
        content: `✅ Merged into **${merged.name}**.`,
        embeds: [embed],
        ephemeral: true,
      });
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
