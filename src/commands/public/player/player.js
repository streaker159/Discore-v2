"use strict";

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const {
  getPlayerProfileStats,
} = require("../../../modules/player/services/playerProfileService");
const {
  createPlayerProfileEmbed,
} = require("../../../modules/player/embeds/playerProfileEmbed");
const { createProfileXpCard } = require("../../../modules/xp/profileXpCard");
const {
  getUserXpStats,
  getUserXpRank,
  getUserPeriodXp,
} = require("../../../modules/xp/xpService");
const { formatDiscordTime } = require("../../../lib/embedBuilder");

const AUTO_DELETE_MS = 10 * 60 * 1000;

function scheduleAutoDelete(message) {
  if (!message?.deletable) return;
  setTimeout(() => {
    message.delete().catch(() => {});
  }, AUTO_DELETE_MS);
}

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("player")
    .setDescription("Player profile commands.")
    .addSubcommand((s) =>
      s
        .setName("profile")
        .setDescription("View a player profile (server stats and activity)")
        .addUserOption((o) =>
          o
            .setName("user")
            .setDescription("User to view (leave blank for yourself)"),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "profile") {
      await interaction.deferReply();

      try {
        const targetUser =
          interaction.options.getUser("user") ?? interaction.user;

        const member = await interaction.guild.members
          .fetch(targetUser.id)
          .catch(() => null);

        if (!member) {
          return interaction.editReply({
            content: "⚠️ User is not in this server.",
          });
        }

        const guildId = interaction.guildId;
        const userId = targetUser.id;

        // ── Fetch all profile data in parallel ─────────────────────────
        const [profileStats, xpStatsRaw, rank, dailyXp, weeklyXp, monthlyXp] =
          await Promise.all([
            getPlayerProfileStats(guildId, userId, member),
            getUserXpStats(guildId, userId),
            getUserXpRank(guildId, userId),
            getUserPeriodXp(guildId, userId, "daily"),
            getUserPeriodXp(guildId, userId, "weekly"),
            getUserPeriodXp(guildId, userId, "monthly"),
          ]);

        // ── Build display info ────────────────────────────────────────
        const displayName =
          member.displayName || targetUser.globalName || targetUser.username;

        const avatarUrl = member.displayAvatarURL({
          extension: "png",
          size: 256,
          forceStatic: true,
        });

        const activity = profileStats.activity || {};

        // Activity strings for the card
        const lastActive = activity.lastActiveAt
          ? formatDiscordTime(activity.lastActiveAt).relative
          : null;
        const activeStreak = activity.activeDayStreak || 0;
        const mostActiveChannel = activity.mostActiveChannelId
          ? `<#${activity.mostActiveChannelId}>`
          : null;

        const joinedServer = member.joinedAt
          ? formatDiscordTime(member.joinedAt).full
          : null;
        const accountCreated = formatDiscordTime(targetUser.createdAt).full;

        // ── Generate profile card ──────────────────────────────────────
        let profileCardBuffer = null;
        try {
          profileCardBuffer = await createProfileXpCard({
            avatarUrl,
            displayName,
            username: targetUser.username,
            level: xpStatsRaw.level,
            totalXp: xpStatsRaw.totalXp,
            currentXp: xpStatsRaw.progress?.progressXp || 0,
            nextLevelXp: xpStatsRaw.progress?.nextLevelXp || 100,
            rank,
            progressPercent: xpStatsRaw.progress?.progressPercent || 0,
            messagesCounted: xpStatsRaw.messagesCounted || 0,
            reactionsCounted: xpStatsRaw.reactionsCounted || 0,
            dailyXp,
            weeklyXp,
            monthlyXp,
            joinedServer,
            accountCreated,
            lastActive,
            activeStreak,
            mostActiveChannel,
          });
        } catch {
          // Canvas failed — fallback below
        }

        // ── Create slim embed (roles only) ──────────────────────────────
        const embed = await createPlayerProfileEmbed(member);

        // ── Build response ─────────────────────────────────────────────
        const payload = {
          content: `-# This profile auto-deletes in 10 minutes. Run the command again for live stats.`,
          embeds: [embed],
        };

        if (profileCardBuffer) {
          payload.files = [
            {
              attachment: profileCardBuffer,
              name: `profile-${userId}.png`,
            },
          ];
        }

        const reply = await interaction.editReply(payload);
        scheduleAutoDelete(reply);
      } catch (error) {
        console.error("[Player Profile Error]", error);
        return interaction.editReply({
          content: `⚠️ Error loading profile: ${error.message}`,
        });
      }
    }
  },
};
