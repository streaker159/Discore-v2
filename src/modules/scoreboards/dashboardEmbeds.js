"use strict";

const { EmbedBuilder } = require("discord.js");
const { getGuildTier } = require("../../lib/premiumGate");

/**
 * Build the main dashboard embed when /scoreboard is used.
 * @param {object} opts
 * @param {Array} opts.activeBoards - Active scoreboard array (with entry counts)
 * @param {number} opts.archivedCount - Count of archived scoreboards
 * @param {string} opts.guildId
 * @param {object} [opts.guildIconUrl]
 * @param {object} [opts.discoreIconUrl]
 * @returns {EmbedBuilder}
 */
async function buildDashboardEmbed({
  activeBoards,
  archivedCount,
  guildId,
  guildIconUrl,
  discoreIconUrl,
}) {
  const tier = await getGuildTier(guildId);
  const premiumBadge = tier === "FREE" ? "" : `✨ **${tier}**`;

  const embed = new EmbedBuilder()
    .setColor(0x1a7a9e)
    .setTitle("🏆 Scoreboard Control Centre")
    .setDescription(
      "Manage your server's scoreboards with ease. Select a board below or create a new one.",
    )
    .setFooter({ text: "Powered by Discore", iconURL: discoreIconUrl })
    .setTimestamp();

  if (guildIconUrl) embed.setThumbnail(guildIconUrl);

  // Stats section
  const activeCount = activeBoards.length;
  let statsField = `📊 **Active Scoreboards:** ${activeCount}`;
  if (archivedCount > 0) statsField += `\n📦 **Archived:** ${archivedCount}`;
  if (premiumBadge) statsField += `\n${premiumBadge}`;
  if (activeCount === 0)
    statsField +=
      "\n\n⚠️ No active scoreboards. Click **Create Scoreboard** to get started!";

  embed.addFields({
    name: "📊 Server Status",
    value: statsField,
    inline: false,
  });

  // Quick help
  embed.addFields({
    name: "💡 Quick Help",
    value:
      "1. **Select a scoreboard** from the dropdown below\n" +
      "2. Use the control panel to add wins/losses/points\n" +
      "3. **Show Public** to display the live scoreboard\n" +
      (premiumBadge
        ? "✨ Premium features unlocked: merge, categories, archives\n"
        : "🔒 Upgrade to **PRO** for merge, categories, and archives\n"),
    inline: false,
  });

  return embed;
}

/**
 * Build the board control panel embed.
 * @param {object} opts
 */
async function buildBoardPanelEmbed({
  board,
  entryCount,
  scoreTypeCount,
  selectedScoreTypeName,
  selectedTargetId,
  selectedTargetLabel,
  canManage,
  guildIconUrl,
  discoreIconUrl,
}) {
  const metricLabel = board.metric === "POINTS" ? "Points" : "Win / Loss";
  const typeLabel =
    board.type === "ROLE"
      ? "Roles"
      : board.type === "CUSTOM"
        ? "Custom"
        : "Users";
  const statusIcon = board.repairStatus !== "OK" ? " ⚠️" : "";

  const embed = new EmbedBuilder()
    .setColor(parseInt(board.theme?.replace("#", "") || "1a7a9e", 16))
    .setTitle(
      `🏆 Scoreboard Manager — ${board.liveTitle || board.name}${statusIcon}`,
    )
    .setFooter({ text: "Powered by Discore", iconURL: discoreIconUrl })
    .setTimestamp();

  if (board.roleImageUrl) embed.setThumbnail(board.roleImageUrl);
  else if (guildIconUrl) embed.setThumbnail(guildIconUrl);

  // Board Status
  let statusValue = `📋 **Name:** \`${board.name}\``;
  if (board.liveTitle) statusValue += `\n📝 **Title:** ${board.liveTitle}`;
  if (board.description) statusValue += `\n📄 **Info:** ${board.description}`;
  statusValue += `\n📊 **Metric:** ${metricLabel}`;
  statusValue += `\n👥 **Entries:** ${entryCount}`;
  if (scoreTypeCount > 0)
    statusValue += `\n🏷️ **Score Types:** ${scoreTypeCount}`;
  if (board.channelId) statusValue += `\n📢 **Live:** <#${board.channelId}>`;
  if (board.lastUpdatedAt)
    statusValue += `\n🕐 **Updated:** <t:${Math.floor(new Date(board.lastUpdatedAt).getTime() / 1000)}:R>`;

  embed.addFields({
    name: "📊 Board Status",
    value: statusValue,
    inline: false,
  });

  // Target Mode
  const targetValue = `🎯 **Mode:** ${typeLabel}${selectedTargetLabel ? `\n✅ **Selected:** ${selectedTargetLabel}` : "\n⚠️ No target selected"}`;
  embed.addFields({ name: "🎯 Target", value: targetValue, inline: true });

  // Score Type
  const scoreTypeValue =
    scoreTypeCount > 0
      ? `🏷️ **Current:** ${selectedScoreTypeName || "Overall"}`
      : "📋 **General** (no categories)";
  embed.addFields({
    name: "🏷️ Score Type",
    value: scoreTypeValue,
    inline: true,
  });

  // Actions hint
  if (canManage) {
    embed.addFields({
      name: "⚡ Quick Actions",
      value:
        "Use the buttons below to manage this scoreboard.\n" +
        "Target selection is available via the user/role dropdowns.",
      inline: false,
    });
  } else {
    embed.addFields({
      name: "🔒 Read-Only",
      value:
        "You can view this scoreboard but need **Scoreboard Manager** role to make changes.",
      inline: false,
    });
  }

  return embed;
}

/**
 * Build a confirmation embed for destructive actions.
 */
function buildConfirmationEmbed({
  title,
  description,
  warning,
  color = 0xff0000,
}) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "This action cannot be easily undone." })
    .setTimestamp();
  if (warning) {
    embed.addFields({ name: "⚠️ Warning", value: warning });
  }
  return embed;
}

/**
 * Build a success embed.
 */
function buildSuccessEmbed({ title, description }) {
  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle(title || "✅ Success")
    .setDescription(description)
    .setTimestamp();
}

module.exports = {
  buildDashboardEmbed,
  buildBoardPanelEmbed,
  buildConfirmationEmbed,
  buildSuccessEmbed,
};
