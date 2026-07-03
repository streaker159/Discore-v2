"use strict";

/**
 * Builds the full interaction payload (rendered card + period dropdown) for
 * `/xp leaderboard`, shared between the slash command and the dropdown's
 * select-menu handler so both stay perfectly in sync.
 */

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const { getLeaderboard, getUserLeaderboardStanding } = require("./xpService");
const { createLeaderboardCard } = require("./leaderboardCard");
const { createLeaderboardEmbed } = require("./xpEmbeds");

const PERIODS = [
  {
    value: "overall",
    label: "Overall XP",
    emoji: "🏆",
    title: "XP Leaderboard — Overall",
  },
  {
    value: "daily",
    label: "Daily XP",
    emoji: "📅",
    title: "XP Leaderboard — Daily",
  },
  {
    value: "weekly",
    label: "Weekly XP",
    emoji: "🗓️",
    title: "XP Leaderboard — Weekly",
  },
  {
    value: "monthly",
    label: "Monthly XP",
    emoji: "🌙",
    title: "XP Leaderboard — Monthly",
  },
  {
    value: "messages",
    label: "Most Messages",
    emoji: "💬",
    title: "Most Messages",
  },
  {
    value: "reactions",
    label: "Most Reactions",
    emoji: "❤️",
    title: "Most Reactions",
  },
];

const VALID_PERIODS = new Set(PERIODS.map((p) => p.value));

const AUTO_DELETE_NOTICE =
  "-# This leaderboard auto-deletes in 10 minutes. Run the command again for live stats.";

function buildSelectRow(period) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`xp:lb:${period}`)
    .setPlaceholder("Change leaderboard type...")
    .addOptions(
      PERIODS.map((p) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(p.label)
          .setValue(p.value)
          .setEmoji(p.emoji)
          .setDefault(p.value === period),
      ),
    );
  return new ActionRowBuilder().addComponents(menu);
}

/**
 * @param {object} opts
 * @param {import("discord.js").Guild} opts.guild
 * @param {string} opts.period
 * @param {{ id: string, displayName: string, avatarUrl: string }} opts.viewer
 * @returns {Promise<object>} interaction reply/update payload
 */
async function buildLeaderboardPayload({ guild, period, viewer }) {
  const safePeriod = VALID_PERIODS.has(period) ? period : "overall";
  const meta = PERIODS.find((p) => p.value === safePeriod);

  const entries = await getLeaderboard(guild.id, safePeriod, 10);
  const standing = await getUserLeaderboardStanding(
    guild.id,
    viewer.id,
    safePeriod,
    entries,
  );

  const components = [buildSelectRow(safePeriod)];

  let cardBuffer = null;
  try {
    cardBuffer = await createLeaderboardCard({
      title: meta.title,
      guildName: guild.name,
      period: safePeriod,
      entries,
      viewer: {
        userId: viewer.id,
        displayName: viewer.displayName,
        avatarUrl: viewer.avatarUrl,
        level: standing.level,
        value: standing.value,
        rank: standing.rank,
        inTop: standing.inTop,
      },
    });
  } catch {
    cardBuffer = null;
  }

  if (cardBuffer) {
    return {
      content: AUTO_DELETE_NOTICE,
      embeds: [],
      files: [
        {
          attachment: cardBuffer,
          name: `xp-leaderboard-${safePeriod}.png`,
        },
      ],
      components,
    };
  }

  // Canvas unavailable — fall back to a text embed (still fully functional)
  const embed = createLeaderboardEmbed({
    leaderboard: entries,
    period: safePeriod,
    guildName: guild.name,
    userRank: standing.rank,
    userXp: standing.value,
    userLevel: standing.level,
  });

  return {
    content: AUTO_DELETE_NOTICE,
    embeds: [embed],
    files: [],
    components,
  };
}

module.exports = { buildLeaderboardPayload, PERIODS };
