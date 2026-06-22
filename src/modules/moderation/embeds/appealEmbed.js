"use strict";

const { EmbedBuilder } = require("discord.js");
const { formatDuration } = require("../utils/durationParser");
const { formatDiscordTime } = require("../../../lib/embedBuilder");

/**
 * Create appeal embed for admin channel
 */
async function createAppealEmbed(appeal, moderationCase, guild) {
  const user = await guild.client.users.fetch(appeal.userId).catch(() => null);
  const moderator = await guild.client.users
    .fetch(moderationCase.moderatorId)
    .catch(() => null);

  // Get previous moderation summary
  const previousCases =
    await require("../repositories/moderationCaseRepository").getUserCases(
      moderationCase.guildId,
      moderationCase.userId,
      { limit: 10 },
    );

  const prevSummary =
    previousCases.length > 1
      ? previousCases
          .slice(0, 5)
          .map((c) => `• ${c.publicId} - ${c.actionType} - ${c.status}`)
          .join("\n")
      : "No previous cases";

  const embed = new EmbedBuilder()
    .setTitle(`🧾 Appeal Opened — ${appeal.publicId}`)
    .setColor("#3498db")
    .addFields(
      {
        name: "User",
        value: user ? `${user.tag} (<@${user.id}>)` : `<@${appeal.userId}>`,
        inline: true,
      },
      { name: "User ID", value: appeal.userId, inline: true },
      { name: "Case ID", value: moderationCase.publicId, inline: true },
      {
        name: "Original Action",
        value: moderationCase.actionType,
        inline: true,
      },
      {
        name: "Reason",
        value: moderationCase.reason || "No reason provided",
        inline: false,
      },
      {
        name: "Duration / Expires",
        value: moderationCase.expiresAt
          ? `${formatDuration(moderationCase.durationSeconds)} (${formatDiscordTime(moderationCase.expiresAt).full})`
          : "Permanent",
        inline: true,
      },
      {
        name: "Moderator",
        value: moderator
          ? `${moderator.tag} (<@${moderator.id}>)`
          : `<@${moderationCase.moderatorId}>`,
        inline: true,
      },
      {
        name: "Appeal Text",
        value:
          appeal.appealText.length > 1024
            ? appeal.appealText.substring(0, 1021) + "..."
            : appeal.appealText,
      },
      { name: "Current Status", value: appeal.status, inline: true },
      {
        name: "Previous Moderation",
        value: prevSummary.substring(0, 1024),
        inline: false,
      },
    )
    .setFooter({ text: `Appeal ID: ${appeal.publicId}` })
    .setTimestamp();

  if (user) {
    embed.setThumbnail(user.displayAvatarURL());
  }

  return embed;
}

/**
 * Create appeal outcome DM embed
 */
function createAppealOutcomeEmbed(appeal, outcome, guildName) {
  const statusEmojis = {
    ACCEPTED: "✅",
    REJECTED: "❌",
    REDUCED: "🔁",
    CLOSED: "🔒",
  };

  const statusColors = {
    ACCEPTED: "#2ecc71",
    REJECTED: "#e74c3c",
    REDUCED: "#f39c12",
    CLOSED: "#95a5a6",
  };

  const statusTitles = {
    ACCEPTED: "Appeal Accepted",
    REJECTED: "Appeal Rejected",
    REDUCED: "Appeal Partially Accepted",
    CLOSED: "Appeal Closed",
  };

  const emoji = statusEmojis[appeal.status] || "📝";
  const color = statusColors[appeal.status] || "#3498db";
  const title = statusTitles[appeal.status] || "Appeal Update";

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${title}`)
    .setDescription(
      `Your appeal for case **${appeal.case?.publicId || "Unknown"}** in **${guildName}** has been reviewed.`,
    )
    .setColor(color)
    .addFields(
      { name: "Appeal ID", value: appeal.publicId, inline: true },
      { name: "Status", value: appeal.status, inline: true },
      {
        name: "Outcome",
        value: outcome || appeal.outcome || "No additional information",
      },
    )
    .setFooter({ text: `Powered by Discore • ${appeal.publicId}` })
    .setTimestamp();

  return embed;
}

/**
 * Update appeal embed in channel
 */
async function updateAppealChannelEmbed(channel, appeal, moderationCase) {
  try {
    const messages = await channel.messages.fetch({ limit: 10 });
    const appealMessage = messages.find(
      (m) => m.author.id === channel.client.user.id && m.embeds.length > 0,
    );

    if (appealMessage) {
      const embed = await createAppealEmbed(
        appeal,
        moderationCase,
        channel.guild,
      );

      // Add status update field
      const statusUpdate = {
        name: "📌 Status Update",
        value: `**${appeal.status}**${appeal.outcome ? `\n${appeal.outcome}` : ""}`,
      };

      embed.data.fields = embed.data.fields || [];
      embed.data.fields.push(statusUpdate);

      await appealMessage.edit({ embeds: [embed] });
    }
  } catch (error) {
    console.error("[Appeal] Could not update embed:", error);
  }
}

module.exports = {
  createAppealEmbed,
  createAppealOutcomeEmbed,
  updateAppealChannelEmbed,
};
