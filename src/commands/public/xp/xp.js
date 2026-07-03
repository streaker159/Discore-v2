"use strict";

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");
const {
  getUserXpStats,
  getUserXpRank,
  getUserPeriodXp,
} = require("../../../modules/xp/xpService");
const {
  getXpConfig,
  updateXpConfig,
  invalidateXpConfigCache,
} = require("../../../modules/xp/xpConfigService");
const { formatXp } = require("../../../modules/xp/xpFormula");
const { createProfileXpCard } = require("../../../modules/xp/profileXpCard");
const {
  buildLeaderboardPayload,
} = require("../../../modules/xp/leaderboardPayload");
const prisma = require("../../../lib/prisma");

const AUTO_DELETE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Schedule auto-delete for a message (profile/rank responses)
 * Safe — ignores if already deleted or lacks permission
 */
function scheduleAutoDelete(message) {
  if (!message?.deletable) return;
  setTimeout(() => {
    message.delete().catch(() => {});
  }, AUTO_DELETE_MS);
}

// ── Permission helpers ─────────────────────────────────────────────────────
async function isAdmin(interaction) {
  const member = interaction.member;
  if (
    member.permissions?.has(PermissionFlagsBits.Administrator) ||
    member.permissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    return true;
  }

  const guild = await prisma.guild.findUnique({
    where: { id: interaction.guildId },
    select: { disAdminRoleId: true, discoreManagerRoleId: true },
  });
  if (guild?.disAdminRoleId && member.roles.cache.has(guild.disAdminRoleId)) {
    return true;
  }
  if (
    guild?.discoreManagerRoleId &&
    member.roles.cache.has(guild.discoreManagerRoleId)
  ) {
    return true;
  }
  return false;
}

// ── Validation helpers ─────────────────────────────────────────────────────
function validateSetupData(data) {
  const errors = [];

  if (data.minMessageXp !== undefined && data.minMessageXp < 0) {
    errors.push("Minimum message XP cannot be negative.");
  }
  if (data.maxMessageXp !== undefined && data.maxMessageXp < 0) {
    errors.push("Maximum message XP cannot be negative.");
  }
  if (
    data.minMessageXp !== undefined &&
    data.maxMessageXp !== undefined &&
    data.minMessageXp > data.maxMessageXp
  ) {
    errors.push("Minimum message XP cannot be higher than maximum.");
  }
  if (
    data.minReactionXp !== undefined &&
    data.maxReactionXp !== undefined &&
    data.minReactionXp > data.maxReactionXp
  ) {
    errors.push("Minimum reaction XP cannot be higher than maximum.");
  }
  if (
    data.messageCooldownSeconds !== undefined &&
    data.messageCooldownSeconds < 5
  ) {
    errors.push("Message cooldown cannot be less than 5 seconds.");
  }
  if (
    data.reactionCooldownSeconds !== undefined &&
    data.reactionCooldownSeconds < 10
  ) {
    errors.push("Reaction cooldown cannot be less than 10 seconds.");
  }
  if (data.maxMessageXp !== undefined && data.maxMessageXp > 10000) {
    errors.push("Maximum message XP cannot exceed 10,000.");
  }
  if (data.maxReactionXp !== undefined && data.maxReactionXp > 1000) {
    errors.push("Maximum reaction XP cannot exceed 1,000.");
  }

  return errors;
}

function makeProgressBar(percent) {
  const filled = Math.floor(percent / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("xp")
    .setDescription("Discore XP system - leveling, leaderboard, and ranks.")

    // ── /xp setup ────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("setup")
        .setDescription("Configure the XP system (admin only)")
        .addBooleanOption((o) =>
          o.setName("enabled").setDescription("Enable/disable XP system"),
        )
        .addChannelOption((o) =>
          o
            .setName("level_up_channel")
            .setDescription("Channel for level-up announcements")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            ),
        )
        .addChannelOption((o) =>
          o
            .setName("weekly_leaderboard_channel")
            .setDescription("Channel for weekly top 10 posts")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            ),
        )
        .addBooleanOption((o) =>
          o
            .setName("message_xp_enabled")
            .setDescription("Enable/disable message XP"),
        )
        .addBooleanOption((o) =>
          o
            .setName("reaction_xp_enabled")
            .setDescription("Enable/disable reaction XP"),
        )
        .addIntegerOption((o) =>
          o
            .setName("min_message_xp")
            .setDescription("Minimum XP per message (default 15)")
            .setMinValue(1)
            .setMaxValue(10000),
        )
        .addIntegerOption((o) =>
          o
            .setName("max_message_xp")
            .setDescription("Maximum XP per message (default 40)")
            .setMinValue(1)
            .setMaxValue(10000),
        )
        .addIntegerOption((o) =>
          o
            .setName("message_cooldown_seconds")
            .setDescription("Cooldown between message XP (default 60)")
            .setMinValue(5)
            .setMaxValue(3600),
        )
        .addIntegerOption((o) =>
          o
            .setName("min_reaction_xp")
            .setDescription("Minimum XP per reaction (default 5)")
            .setMinValue(1)
            .setMaxValue(1000),
        )
        .addIntegerOption((o) =>
          o
            .setName("max_reaction_xp")
            .setDescription("Maximum XP per reaction (default 10)")
            .setMinValue(1)
            .setMaxValue(1000),
        )
        .addIntegerOption((o) =>
          o
            .setName("reaction_cooldown_seconds")
            .setDescription("Cooldown between reaction XP (default 300)")
            .setMinValue(10)
            .setMaxValue(3600),
        )
        .addBooleanOption((o) =>
          o
            .setName("announce_level_ups")
            .setDescription("Send level-up announcements"),
        )
        .addBooleanOption((o) =>
          o
            .setName("weekly_top10_enabled")
            .setDescription("Enable weekly top 10 leaderboard post"),
        ),
    )

    // ── /xp rank ─────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("rank")
        .setDescription("View your XP rank or another user's")
        .addUserOption((o) =>
          o
            .setName("user")
            .setDescription("User to view (leave blank for yourself)"),
        ),
    )

    // ── /xp leaderboard ──────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("leaderboard")
        .setDescription("View XP leaderboard")
        .addStringOption((o) =>
          o
            .setName("period")
            .setDescription("Leaderboard period")
            .setRequired(false)
            .addChoices(
              { name: "🏆 Overall XP", value: "overall" },
              { name: "📅 Daily XP", value: "daily" },
              { name: "🗓️ Weekly XP", value: "weekly" },
              { name: "🌙 Monthly XP", value: "monthly" },
              { name: "💬 Most Messages", value: "messages" },
              { name: "❤️ Most Reactions", value: "reactions" },
            ),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /xp setup ──────────────────────────────────────────────────────
    if (sub === "setup") {
      if (!(await isAdmin(interaction))) {
        return interaction.reply({
          content:
            "🚫 You need Administrator, Manage Guild, or the configured Discore admin role to use this command.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const data = {};

      const enabled = interaction.options.getBoolean("enabled");
      if (enabled !== null) data.enabled = enabled;

      const levelUpChannel = interaction.options.getChannel("level_up_channel");
      if (levelUpChannel !== null) data.levelUpChannelId = levelUpChannel.id;

      const weeklyChannel = interaction.options.getChannel(
        "weekly_leaderboard_channel",
      );
      if (weeklyChannel !== null)
        data.weeklyLeaderboardChannelId = weeklyChannel.id;

      const msgXpEnabled = interaction.options.getBoolean("message_xp_enabled");
      if (msgXpEnabled !== null) data.messageXpEnabled = msgXpEnabled;

      const rxnXpEnabled = interaction.options.getBoolean(
        "reaction_xp_enabled",
      );
      if (rxnXpEnabled !== null) data.reactionXpEnabled = rxnXpEnabled;

      const minMsg = interaction.options.getInteger("min_message_xp");
      if (minMsg !== null) data.minMessageXp = minMsg;

      const maxMsg = interaction.options.getInteger("max_message_xp");
      if (maxMsg !== null) data.maxMessageXp = maxMsg;

      const msgCd = interaction.options.getInteger("message_cooldown_seconds");
      if (msgCd !== null) data.messageCooldownSeconds = msgCd;

      const minRxn = interaction.options.getInteger("min_reaction_xp");
      if (minRxn !== null) data.minReactionXp = minRxn;

      const maxRxn = interaction.options.getInteger("max_reaction_xp");
      if (maxRxn !== null) data.maxReactionXp = maxRxn;

      const rxnCd = interaction.options.getInteger("reaction_cooldown_seconds");
      if (rxnCd !== null) data.reactionCooldownSeconds = rxnCd;

      const announceLevelUps =
        interaction.options.getBoolean("announce_level_ups");
      if (announceLevelUps !== null) data.announceLevelUps = announceLevelUps;

      const weeklyTop10 = interaction.options.getBoolean(
        "weekly_top10_enabled",
      );
      if (weeklyTop10 !== null) data.weeklyTop10Enabled = weeklyTop10;

      if (Object.keys(data).length === 0) {
        const config = await getXpConfig(interaction.guildId);
        const embed = new EmbedBuilder()
          .setTitle("⚙️ Discore XP Setup")
          .setDescription(
            "Current XP configuration. Use options to change settings.",
          )
          .setColor(0x00cccc)
          .addFields(
            {
              name: "Enabled",
              value: config.enabled ? "✅ Yes" : "❌ No",
              inline: true,
            },
            {
              name: "Level-Up Channel",
              value: config.levelUpChannelId
                ? `<#${config.levelUpChannelId}>`
                : "Not set",
              inline: true,
            },
            {
              name: "Weekly Top 10 Channel",
              value: config.weeklyLeaderboardChannelId
                ? `<#${config.weeklyLeaderboardChannelId}>`
                : "Not set",
              inline: true,
            },
            {
              name: "Message XP",
              value: config.messageXpEnabled
                ? `✅ ${config.minMessageXp}–${config.maxMessageXp} XP (${config.messageCooldownSeconds}s cooldown)`
                : "❌ Disabled",
              inline: true,
            },
            {
              name: "Reaction XP",
              value: config.reactionXpEnabled
                ? `✅ ${config.minReactionXp}–${config.maxReactionXp} XP (${config.reactionCooldownSeconds}s cooldown)`
                : "❌ Disabled",
              inline: true,
            },
            {
              name: "Level-Up Announcements",
              value: config.announceLevelUps ? "✅ Yes" : "❌ No",
              inline: true,
            },
            {
              name: "Weekly Top 10",
              value: config.weeklyTop10Enabled ? "✅ Yes" : "❌ No",
              inline: true,
            },
          )
          .setFooter({ text: "Use /xp setup with options to change" })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // Validate
      const errors = validateSetupData(data);
      if (errors.length > 0) {
        return interaction.editReply({
          content: `⚠️ ${errors.join("\n")}`,
        });
      }

      const config = await updateXpConfig(interaction.guildId, data);
      invalidateXpConfigCache(interaction.guildId);

      const embed = new EmbedBuilder()
        .setTitle("✅ XP Settings Updated")
        .setDescription("The XP system has been configured.")
        .setColor(0x00cccc)
        .addFields(
          {
            name: "Enabled",
            value: config.enabled ? "✅ Yes" : "❌ No",
            inline: true,
          },
          {
            name: "Level-Up Channel",
            value: config.levelUpChannelId
              ? `<#${config.levelUpChannelId}>`
              : "Not set",
            inline: true,
          },
          {
            name: "Weekly Top 10 Channel",
            value: config.weeklyLeaderboardChannelId
              ? `<#${config.weeklyLeaderboardChannelId}>`
              : "Not set",
            inline: true,
          },
          {
            name: "Message XP",
            value: `${config.minMessageXp}–${config.maxMessageXp} XP / ${config.messageCooldownSeconds}s cooldown`,
            inline: true,
          },
          {
            name: "Reaction XP",
            value: `${config.minReactionXp}–${config.maxReactionXp} XP / ${config.reactionCooldownSeconds}s cooldown`,
            inline: true,
          },
        )
        .setFooter({ text: "Discore XP" })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── /xp rank ────────────────────────────────────────────────────────
    if (sub === "rank") {
      await interaction.deferReply();

      const targetUser =
        interaction.options.getUser("user") ?? interaction.user;

      const member = await interaction.guild.members
        .fetch(targetUser.id)
        .catch(() => null);

      if (!member && targetUser.id !== interaction.user.id) {
        return interaction.editReply({
          content: "⚠️ User is not in this server.",
        });
      }

      const userId = targetUser.id;
      const guildId = interaction.guildId;

      const [xpStats, rank, dailyXp, weeklyXp, monthlyXp] = await Promise.all([
        getUserXpStats(guildId, userId),
        getUserXpRank(guildId, userId),
        getUserPeriodXp(guildId, userId, "daily"),
        getUserPeriodXp(guildId, userId, "weekly"),
        getUserPeriodXp(guildId, userId, "monthly"),
      ]);

      // Try to generate profile card with full data
      let profileCardBuffer = null;
      const displayName = member
        ? member.displayName || targetUser.globalName || targetUser.username
        : targetUser.globalName || targetUser.username;
      const avatarUrl = member
        ? member.displayAvatarURL({
            extension: "png",
            size: 256,
            forceStatic: true,
          })
        : targetUser.displayAvatarURL({
            extension: "png",
            size: 256,
            forceStatic: true,
          });

      try {
        profileCardBuffer = await createProfileXpCard({
          avatarUrl,
          displayName,
          username: targetUser.username,
          level: xpStats.level,
          totalXp: xpStats.totalXp,
          currentXp: xpStats.progress?.progressXp || 0,
          nextLevelXp: xpStats.progress?.nextLevelXp || 100,
          rank,
          progressPercent: xpStats.progress?.progressPercent || 0,
          messagesCounted: xpStats.messagesCounted || 0,
          reactionsCounted: xpStats.reactionsCounted || 0,
          dailyXp,
          weeklyXp,
          monthlyXp,
        });
      } catch {
        // Fallback to embed
      }

      if (profileCardBuffer) {
        const reply = await interaction.editReply({
          content: `-# This profile auto-deletes in 10 minutes. Run the command again for live stats.`,
          files: [
            {
              attachment: profileCardBuffer,
              name: `xp-profile-${userId}.png`,
            },
          ],
        });
        scheduleAutoDelete(reply);
        return;
      }

      // Slim fallback embed — card handles details, embed is minimal
      const { EmbedBuilder } = require("discord.js");
      const fallbackEmbed = new EmbedBuilder()
        .setTitle(`📊 XP Rank — ${displayName}`)
        .setColor(0xd4af37)
        .addFields(
          { name: "Level", value: String(xpStats.level), inline: true },
          { name: "Rank", value: rank > 0 ? `#${rank}` : "—", inline: true },
          {
            name: "Progress",
            value: `${xpStats.progress?.progressPercent || 0}%`,
            inline: true,
          },
        )
        .setFooter({
          text: "Discore XP • This profile auto-deletes in 10 minutes.",
        })
        .setTimestamp();

      const reply = await interaction.editReply({ embeds: [fallbackEmbed] });
      scheduleAutoDelete(reply);
      return;
    }

    // ── /xp leaderboard ─────────────────────────────────────────────────
    if (sub === "leaderboard") {
      await interaction.deferReply();

      const period = interaction.options.getString("period") || "overall";
      const member = interaction.member;

      const payload = await buildLeaderboardPayload({
        guild: interaction.guild,
        period,
        viewer: {
          id: interaction.user.id,
          displayName:
            member?.displayName ||
            interaction.user.globalName ||
            interaction.user.username,
          avatarUrl: (member || interaction.user).displayAvatarURL({
            extension: "png",
            size: 256,
            forceStatic: true,
          }),
        },
      });

      return interaction.editReply(payload);
    }
  },
};
