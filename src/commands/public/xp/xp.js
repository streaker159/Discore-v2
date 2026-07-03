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
    )

    // ── /xp wipe ─────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("wipe")
        .setDescription(
          "Wipe all server XP or a specific user's XP (admin only)",
        )
        .addUserOption((o) =>
          o
            .setName("user")
            .setDescription(
              "User to wipe XP for (leave blank to wipe entire server)",
            ),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /xp setup ─ Open the Control Panel ────────────────────────────
    if (sub === "setup") {
      if (!(await isAdmin(interaction))) {
        return interaction.reply({
          content:
            "🚫 You need Administrator, Manage Guild, or the configured Discore admin role to use this command.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const config = await getXpConfig(interaction.guildId);
      const {
        buildPanelEmbed,
        buildPanelRows,
        buildPanelRows2,
      } = require("../../../components/buttons/xp/xpSetupButtons");

      return interaction.editReply({
        embeds: [buildPanelEmbed(config)],
        components: [...buildPanelRows(), ...buildPanelRows2()],
      });
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

      const reply = await interaction.editReply(payload);
      scheduleAutoDelete(reply);
      return;
    }

    // ── /xp wipe ────────────────────────────────────────────────────────
    if (sub === "wipe") {
      if (!(await isAdmin(interaction))) {
        return interaction.reply({
          content:
            "🚫 You need Administrator, Manage Guild, or the configured Discore admin role to use this command.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const targetUser = interaction.options.getUser("user");
      const guildId = interaction.guildId;

      try {
        if (targetUser) {
          // Wipe a single user's XP
          const deletedUser = await prisma.userXp.deleteMany({
            where: { guildId, userId: targetUser.id },
          });
          const deletedEvents = await prisma.userXpEvent.deleteMany({
            where: { guildId, userId: targetUser.id },
          });

          const embed = new EmbedBuilder()
            .setTitle("🗑️ User XP Wiped")
            .setDescription(
              `XP data wiped for ${targetUser}.\n` +
                `Removed ${deletedUser.count} XP record(s) and ${deletedEvents.count} event(s).`,
            )
            .setColor(0xd4af37)
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        } else {
          // Wipe entire server XP
          const deletedUsers = await prisma.userXp.deleteMany({
            where: { guildId },
          });
          const deletedEvents = await prisma.userXpEvent.deleteMany({
            where: { guildId },
          });

          const embed = new EmbedBuilder()
            .setTitle("🗑️ Server XP Wiped")
            .setDescription(
              `All XP data wiped for this server.\n` +
                `Removed ${deletedUsers.count} user record(s) and ${deletedEvents.count} event(s).`,
            )
            .setColor(0xd4af37)
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        }
      } catch (err) {
        return interaction.editReply({
          content: `⚠️ Failed to wipe XP: ${err.message}`,
        });
      }
    }
  },
};
