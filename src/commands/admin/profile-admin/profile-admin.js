/**
 * /profile-admin — Server admin tools for managing profiles, leaderboards,
 * and posting schedules.
 *
 * Requires: Manage Server permission.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const { requireManageGuild } = require("../../../lib/permissionGuard");
const { requireBotOwner } = require("../../../lib/ownerGuard");
const {
  updatePlayerFromParsed,
  updatePlayerManual,
} = require("../../../modules/profiles/playerService");
const {
  updateAllianceManual,
} = require("../../../modules/profiles/allianceProfileService");
const {
  buildLeaderboardEmbed,
  postOrUpdateLeaderboard,
} = require("../../../modules/profiles/leaderboardService");

const LEADERBOARD_TYPES = [
  { name: "Top Players — Elo", value: "TOP_PLAYERS_ELO" },
  { name: "Top Players — K/D", value: "TOP_PLAYERS_KD" },
  { name: "Top Players — Wins", value: "TOP_PLAYERS_WINS" },
  { name: "Top Alliances — Elo", value: "TOP_ALLIANCES_ELO" },
  { name: "Top Alliances — Wins", value: "TOP_ALLIANCES_WINS" },
  { name: "Top Alliances — Official Rank", value: "TOP_ALLIANCES_RANK" },
];

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("profile-admin")
    .setDescription("Manage profiles and leaderboard channels.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    // ── set-leaderboard-channel ────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("set-leaderboard-channel")
        .setDescription(
          "Set a channel to auto-post a specific leaderboard type.",
        )
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Which leaderboard to post")
            .setRequired(true)
            .addChoices(...LEADERBOARD_TYPES),
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Target channel")
            .setRequired(true),
        ),
    )

    // ── remove-leaderboard-channel ─────────────────────────
    .addSubcommand((s) =>
      s
        .setName("remove-leaderboard-channel")
        .setDescription("Remove an auto-post leaderboard channel.")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Which leaderboard to remove")
            .setRequired(true)
            .addChoices(...LEADERBOARD_TYPES),
        ),
    )

    // ── set-schedule ───────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("set-schedule")
        .setDescription("Set leaderboard auto-post frequency and time (UTC).")
        .addIntegerOption((o) =>
          o
            .setName("frequency-hours")
            .setDescription("How often to post (hours, e.g. 24)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(168),
        )
        .addIntegerOption((o) =>
          o
            .setName("hour")
            .setDescription("UTC hour to post (0-23, default 9)")
            .setMinValue(0)
            .setMaxValue(23),
        )
        .addIntegerOption((o) =>
          o
            .setName("minute")
            .setDescription("UTC minute to post (0-59, default 0)")
            .setMinValue(0)
            .setMaxValue(59),
        ),
    )

    // ── toggle-schedule ────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("toggle-schedule")
        .setDescription(
          "Enable or disable scheduled leaderboard posts for this server.",
        )
        .addStringOption((o) =>
          o
            .setName("state")
            .setDescription("Enable or disable")
            .setRequired(true)
            .addChoices(
              { name: "Enable", value: "enable" },
              { name: "Disable", value: "disable" },
            ),
        ),
    )

    // ── post-now ───────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("post-now")
        .setDescription("Immediately post a leaderboard to a channel.")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Which leaderboard")
            .setRequired(true)
            .addChoices(...LEADERBOARD_TYPES),
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription(
              "Channel to post in (uses saved channel if omitted)",
            ),
        ),
    )

    // ── view-settings ──────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("view-settings")
        .setDescription(
          "Show current leaderboard configuration for this server.",
        ),
    )

    // ── force-update-player ───────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("force-update-player")
        .setDescription(
          "(Admin) Force update a player profile, bypassing rate limit.",
        )
        .addUserOption((o) =>
          o.setName("user").setDescription("Discord user").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("username").setDescription("Game username"),
        )
        .addStringOption((o) =>
          o.setName("rank").setDescription("In-game rank"),
        )
        .addStringOption((o) =>
          o.setName("role").setDescription("Player role / playstyle"),
        )
        .addIntegerOption((o) =>
          o.setName("elo").setDescription("Discore Elo override"),
        )
        .addIntegerOption((o) =>
          o.setName("ava-wins").setDescription("Verified AvA wins"),
        )
        .addIntegerOption((o) =>
          o.setName("ava-losses").setDescription("Verified AvA losses"),
        ),
    )

    // ── force-update-alliance ─────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("force-update-alliance")
        .setDescription(
          "(Admin) Force update an alliance profile, bypassing rate limit.",
        )
        .addStringOption((o) =>
          o.setName("tag").setDescription("Alliance tag").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("game").setDescription("Game slug").setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName("elo").setDescription("Discore Elo override"),
        )
        .addIntegerOption((o) =>
          o.setName("wins").setDescription("Discore wins"),
        )
        .addIntegerOption((o) =>
          o.setName("losses").setDescription("Discore losses"),
        )
        .addStringOption((o) =>
          o.setName("rank").setDescription("Alliance rank override"),
        ),
    ),

  async execute(interaction) {
    if (!(await requireManageGuild(interaction))) return;

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // ── set-leaderboard-channel ────────────────────────────
    if (sub === "set-leaderboard-channel") {
      const type = interaction.options.getString("type", true);
      const channel = interaction.options.getChannel("channel", true);

      await prisma.leaderboardChannel.upsert({
        where: { guildId_type: { guildId, type } },
        update: { channelId: channel.id, enabled: true, messageId: null },
        create: { guildId, type, channelId: channel.id, enabled: true },
      });

      return interaction.reply({
        content: `✅ **${type}** leaderboard will be posted to ${channel}.`,
        ephemeral: true,
      });
    }

    // ── remove-leaderboard-channel ─────────────────────────
    if (sub === "remove-leaderboard-channel") {
      const type = interaction.options.getString("type", true);

      await prisma.leaderboardChannel.updateMany({
        where: { guildId, type },
        data: { enabled: false },
      });

      return interaction.reply({
        content: `🗑️ **${type}** leaderboard channel removed.`,
        ephemeral: true,
      });
    }

    // ── set-schedule ───────────────────────────────────────
    if (sub === "set-schedule") {
      const freqH = interaction.options.getInteger("frequency-hours", true);
      const hour = interaction.options.getInteger("hour") ?? 9;
      const minute = interaction.options.getInteger("minute") ?? 0;

      await prisma.leaderboardSettings.upsert({
        where: { guildId },
        update: {
          frequencyHours: freqH,
          scheduleHour: hour,
          scheduleMinute: minute,
        },
        create: {
          guildId,
          frequencyHours: freqH,
          scheduleHour: hour,
          scheduleMinute: minute,
          enabled: true,
        },
      });

      return interaction.reply({
        content: `✅ Leaderboards will post every **${freqH}h** at **${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} UTC**.`,
        ephemeral: true,
      });
    }

    // ── toggle-schedule ────────────────────────────────────
    if (sub === "toggle-schedule") {
      const enabled = interaction.options.getString("state", true) === "enable";

      await prisma.leaderboardSettings.upsert({
        where: { guildId },
        update: { enabled },
        create: {
          guildId,
          enabled,
          frequencyHours: 24,
          scheduleHour: 9,
          scheduleMinute: 0,
        },
      });

      return interaction.reply({
        content: enabled
          ? "✅ Scheduled leaderboard posts are now **enabled** for this server."
          : "⛔ Scheduled leaderboard posts are now **disabled** for this server.",
        ephemeral: true,
      });
    }

    // ── post-now ───────────────────────────────────────────
    if (sub === "post-now") {
      const type = interaction.options.getString("type", true);
      const targetChannel = interaction.options.getChannel("channel");

      await interaction.deferReply({ ephemeral: true });

      if (targetChannel) {
        const embed = await buildLeaderboardEmbed(type);
        await targetChannel.send({ embeds: [embed] });
        return interaction.editReply({
          content: `✅ Leaderboard posted to ${targetChannel}.`,
        });
      }

      // Use saved channel
      const saved = await prisma.leaderboardChannel.findUnique({
        where: { guildId_type: { guildId, type } },
      });

      if (!saved) {
        return interaction.editReply({
          content: `⚠️ No channel set for **${type}**. Use \`/profile-admin set-leaderboard-channel\` first, or specify a channel.`,
        });
      }

      await postOrUpdateLeaderboard(interaction.client, saved);
      return interaction.editReply({
        content: `✅ Leaderboard updated in <#${saved.channelId}>.`,
      });
    }

    // ── view-settings ──────────────────────────────────────
    if (sub === "view-settings") {
      const [settings, channels] = await Promise.all([
        prisma.leaderboardSettings.findUnique({ where: { guildId } }),
        prisma.leaderboardChannel.findMany({ where: { guildId } }),
      ]);

      const chanLines = channels.length
        ? channels.map(
            (c) =>
              `• **${c.type}** → <#${c.channelId}> ${c.enabled ? "✅" : "❌"}`,
          )
        : ["*None configured.*"];

      const embed = new EmbedBuilder()
        .setColor(0x1a3a5c)
        .setTitle("⚙️ Leaderboard Settings")
        .addFields(
          {
            name: "Schedule",
            value: settings
              ? `Every **${settings.frequencyHours}h** at **${String(settings.scheduleHour).padStart(2, "0")}:${String(settings.scheduleMinute).padStart(2, "0")} UTC** — ${settings.enabled ? "**Enabled**" : "**Disabled**"}`
              : "*Not configured.*",
            inline: false,
          },
          {
            name: "Last Posted",
            value: settings?.lastPostedAt
              ? `<t:${Math.floor(settings.lastPostedAt.getTime() / 1000)}:R>`
              : "*Never*",
            inline: false,
          },
          {
            name: "Leaderboard Channels",
            value: chanLines.join("\n"),
            inline: false,
          },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── force-update-player ───────────────────────────────
    if (sub === "force-update-player") {
      const user = interaction.options.getUser("user", true);
      const parsed = {};

      const username = interaction.options.getString("username");
      if (username) parsed.gameUsername = username;
      const rank = interaction.options.getString("rank");
      if (rank) parsed.inGameRank = rank;
      const role = interaction.options.getString("role");
      if (role) parsed.role = role;
      const elo = interaction.options.getInteger("elo");
      if (elo != null) parsed.discoreElo = elo;
      const avaWins = interaction.options.getInteger("ava-wins");
      if (avaWins != null) parsed.avaWins = avaWins;
      const avaLosses = interaction.options.getInteger("ava-losses");
      if (avaLosses != null) parsed.avaLosses = avaLosses;

      await updatePlayerManual(user.id, parsed);
      return interaction.reply({
        content: `✅ Player profile for <@${user.id}> updated by admin.`,
        ephemeral: true,
      });
    }

    // ── force-update-alliance ─────────────────────────────
    if (sub === "force-update-alliance") {
      const tag = interaction.options.getString("tag", true).toUpperCase();
      const game = interaction.options.getString("game", true);
      const fields = {};

      const elo = interaction.options.getInteger("elo");
      if (elo != null) fields.discoreElo = elo;
      const wins = interaction.options.getInteger("wins");
      if (wins != null) fields.discoreWins = wins;
      const losses = interaction.options.getInteger("losses");
      if (losses != null) fields.discoreLosses = losses;
      const rank = interaction.options.getString("rank");
      if (rank) fields.discoreRank = parseInt(rank, 10) || null;

      // Recalculate win rate
      if (fields.discoreWins != null || fields.discoreLosses != null) {
        const existing = await prisma.allianceProfile.findUnique({
          where: { tag_game: { tag, game } },
          select: { discoreWins: true, discoreLosses: true },
        });
        const w = fields.discoreWins ?? existing?.discoreWins ?? 0;
        const l = fields.discoreLosses ?? existing?.discoreLosses ?? 0;
        if (w + l > 0) {
          fields.winRate = parseFloat(((w / (w + l)) * 100).toFixed(1));
          fields.seasonRecord = `${w}W – ${l}L`;
        }
      }

      await updateAllianceManual(tag, game, fields, interaction.user.id);
      return interaction.reply({
        content: `✅ Alliance **[${tag}]** updated by admin.`,
        ephemeral: true,
      });
    }
  },
};
