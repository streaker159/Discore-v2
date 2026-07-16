"use strict";

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const {
  getPlayerProfileStats,
} = require("../../../modules/player/services/playerProfileService");
const { createProfileXpCard } = require("../../../modules/xp/profileXpCard");
const {
  getUserXpStats,
  getUserXpRank,
  getUserPeriodXp,
} = require("../../../modules/xp/xpService");

const AUTO_DELETE_MS = 10 * 60 * 1000;

function scheduleAutoDelete(interaction) {
  if (!interaction) return;
  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, AUTO_DELETE_MS);
}

// ── Plain-text date helpers for the canvas profile card ──────────────────
// The card is a rendered PNG, so Discord markdown timestamps (e.g. "<t:123:F>"
// from formatDiscordTime()) can't be used here — they only render inside
// actual Discord message text/embeds, not on a drawn image. Draw plain text
// instead.
function formatCardDate(date) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCardRelative(date) {
  if (!date) return null;
  const diffSec = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear}y ago`;
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
          ? formatCardRelative(activity.lastActiveAt)
          : null;
        const activeStreak = activity.activeDayStreak || 0;
        // Canvas can't render Discord's "<#id>" channel mention markdown —
        // resolve the actual channel name for the card instead.
        const mostActiveChannel = activity.mostActiveChannelId
          ? `#${
              interaction.guild.channels.cache.get(activity.mostActiveChannelId)
                ?.name || "unknown"
            }`
          : null;

        const joinedServer = member.joinedAt
          ? formatCardDate(member.joinedAt)
          : null;
        const accountCreated = formatCardDate(targetUser.createdAt);

        const roles = member.roles.cache
          .filter((r) => r.id !== member.guild.id)
          .sort((a, b) => b.position - a.position)
          .map((r) => r.name);

        // ── Generate profile card (roles are drawn on the card itself) ──
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
            roles,
          });
        } catch {
          // Canvas failed — fallback embed below
        }

        // ── Build response ─────────────────────────────────────────────
        const payload = {
          content: `-# This profile auto-deletes in 10 minutes. Run the command again for live stats.`,
        };

        if (profileCardBuffer) {
          payload.files = [
            {
              attachment: profileCardBuffer,
              name: `profile-${userId}.png`,
            },
          ];
        } else {
          // Canvas unavailable on this host — minimal text fallback so the
          // command still returns useful info instead of just the notice.
          const { EmbedBuilder } = require("discord.js");
          const roleText =
            roles.slice(0, 15).join(", ").substring(0, 1024) || "No roles";
          const fallbackEmbed = new EmbedBuilder()
            .setTitle(`📊 Player Profile — ${displayName}`)
            .setColor(0xd4af37)
            .addFields(
              { name: "Level", value: String(xpStatsRaw.level), inline: true },
              {
                name: "Rank",
                value: rank > 0 ? `#${rank}` : "—",
                inline: true,
              },
              {
                name: `Roles (${roles.length})`,
                value: roleText,
                inline: false,
              },
            )
            .setTimestamp();
          payload.embeds = [fallbackEmbed];
        }

        await interaction.editReply(payload);
        scheduleAutoDelete(interaction);
      } catch (error) {
        console.error("[Player Profile Error]", error);
        return interaction.editReply({
          content: `⚠️ Error loading profile: ${error.message}`,
        });
      }
    }
  },
};
