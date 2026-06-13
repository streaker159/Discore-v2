const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const {
  createScoreboard,
  getScoreboard,
  getArchivedScoreboards,
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
  getTargetScores,
  buildScoreboardEmbed,
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
  "rename",
  "delete",
  "delete-entry",
  "edit",
];

async function pushLiveEmbed(interaction, board) {
  if (!board.messageId || !board.channelId) return;
  const ch = await interaction.client.channels
    .fetch(board.channelId)
    .catch(() => null);
  if (!ch) return;
  const msg = await ch.messages.fetch(board.messageId).catch(() => null);
  if (!msg) return;
  const embed = await buildScoreboardEmbed(interaction, board);
  await msg.edit({ embeds: [embed] }).catch(() => {});
}

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
        ),
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

    // ── write (require ManageGuild) ────────────────────────────────────────
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
              { name: "Wins", value: "WINS" },
              { name: "Losses", value: "LOSSES" },
              { name: "Points", value: "POINTS" },
              { name: "Ratio", value: "RATIO" },
              { name: "Win streak", value: "WIN_STREAK" },
              { name: "Loss streak", value: "LOSS_STREAK" },
              { name: "Season", value: "SEASON" },
              { name: "All-time", value: "ALL_TIME" },
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
        .addIntegerOption((o) =>
          o.setName("wins").setDescription("Wins (win/loss boards)"),
        )
        .addIntegerOption((o) =>
          o.setName("losses").setDescription("Losses (win/loss boards)"),
        )
        .addIntegerOption((o) =>
          o.setName("win_streak").setDescription("Current win streak"),
        )
        .addIntegerOption((o) =>
          o.setName("loss_streak").setDescription("Current loss streak"),
        )
        .addIntegerOption((o) =>
          o.setName("points").setDescription("Points (points boards)"),
        ),
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
        .setName("rename")
        .setDescription("Rename a scoreboard.")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Current scoreboard name")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("new_name").setDescription("New name").setRequired(true),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName("archive")
        .setDescription("Archive a scoreboard (PRO).")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName("restore")
        .setDescription("Restore an archived scoreboard (PRO).")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName("merge")
        .setDescription("Merge one scoreboard into another (PRO).")
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

    // ── show ──────────────────────────────────────────────────────────────
    if (sub === "show") {
      const board = await getScoreboard(
        interaction.guildId,
        interaction.options.getString("name", true),
      );
      if (!board)
        return interaction.reply({
          content: "Scoreboard not found.",
          ephemeral: true,
        });
      const embed = await buildScoreboardEmbed(interaction, board);
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
      const lines = archived.map(
        (b) => `**${b.name}** — ${b.entries.length} entries • ${b.metric}`,
      );
      const embed = await createDiscoreEmbed(interaction, {
        title: "🗃️ Archived Scoreboards",
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
        return `**${name}**: ${entry.wins}W / ${entry.losses}L`;
      };
      const embed = await createDiscoreEmbed(interaction, {
        title: `📊 Score Summary — ${user ? user.username : role.name}`,
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
      const type = interaction.options.getString("type") || "USER";
      const description = interaction.options.getString("description");
      const channel =
        interaction.options.getChannel("channel") || interaction.channel;
      const board = await createScoreboard({
        guildId: interaction.guildId,
        name,
        metric,
        type,
        channelId: channel.id,
        description,
        createdBy: interaction.user.id,
      });
      const embed = await buildScoreboardEmbed(interaction, {
        ...board,
        entries: [],
      });
      const message = await channel.send({ embeds: [embed] });
      await prisma.scoreboard
        .update({ where: { id: board.id }, data: { messageId: message.id } })
        .catch(() => {});
      return interaction.reply({
        content: `✅ Scoreboard **${name}** created in ${channel}.`,
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
      const embed = await buildScoreboardEmbed(interaction, result.board);
      await pushLiveEmbed(interaction, result.board);
      if (result.leaderChange)
        await announceLeaderChange(
          interaction,
          result.board,
          result.leaderChange.newLeaderId,
        );
      return interaction.reply({ embeds: [embed] });
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
      const embed = await buildScoreboardEmbed(interaction, result.board);
      await pushLiveEmbed(interaction, result.board);
      if (result.leaderChange)
        await announceLeaderChange(
          interaction,
          result.board,
          result.leaderChange.newLeaderId,
        );
      return interaction.reply({ embeds: [embed] });
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
      const embed = await buildScoreboardEmbed(interaction, result.board);
      await pushLiveEmbed(interaction, result.board);
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
      const embed = await buildScoreboardEmbed(interaction, board);
      await pushLiveEmbed(interaction, board);
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
      const ok = await requireFeature(interaction, "scoreboards.archive");
      if (!ok) return;
      const board = await archiveScoreboard({
        guildId: interaction.guildId,
        name: interaction.options.getString("name", true),
      });
      const embed = await createDiscoreEmbed(interaction, {
        title: "📦 Scoreboard archived",
        description: `**${board.name}** is now archived.`,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── restore ────────────────────────────────────────────────────────────
    if (sub === "restore") {
      const ok = await requireFeature(interaction, "scoreboards.restore");
      if (!ok) return;
      const board = await restoreScoreboard({
        guildId: interaction.guildId,
        name: interaction.options.getString("name", true),
      });
      const embed = await createDiscoreEmbed(interaction, {
        title: "♻️ Scoreboard restored",
        description: `**${board.name}** is now active again.`,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── merge ──────────────────────────────────────────────────────────────
    if (sub === "merge") {
      const ok = await requireFeature(interaction, "scoreboards.merge");
      if (!ok) return;
      const merged = await mergeScoreboards({
        guildId: interaction.guildId,
        sourceName: interaction.options.getString("source", true),
        targetName: interaction.options.getString("target", true),
        adminId: interaction.user.id,
      });
      const embed = await buildScoreboardEmbed(interaction, merged);
      await pushLiveEmbed(interaction, merged);
      return interaction.reply({
        content: `✅ Merged into **${merged.name}**.`,
        embeds: [embed],
        ephemeral: true,
      });
    }

    // ── delete ─────────────────────────────────────────────────────────────
    if (sub === "delete") {
      if (interaction.options.getString("confirm", true) !== "DELETE") {
        return interaction.reply({
          content:
            "⚠️ Type `DELETE` in the confirm field to permanently delete a scoreboard.",
          ephemeral: true,
        });
      }
      const board = await deleteScoreboard({
        guildId: interaction.guildId,
        name: interaction.options.getString("name", true),
      });
      return interaction.reply({
        content: `🗑️ Scoreboard **${board.name}** and all its entries have been permanently deleted.`,
        ephemeral: true,
      });
    }
  },
};
