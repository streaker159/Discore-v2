"use strict";

const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");

const { formatDuration } = require("../utils/durationParser");

/**
 * Create DM embed for moderation action.
 */
function createModerationDmEmbed(options) {
  const {
    guildName,
    actionType,
    reason,
    caseId,
    durationSeconds,
    moderatorName,
    canAppeal = true,
  } = options;

  const actionEmojis = {
    WARN: "⚠️",
    MUTE: "🔇",
    TIMEOUT: "⏳",
    BAN: "🔨",
    TEMP_BAN: "🔨",
    PROBATION: "🟡",
  };

  const actionTitles = {
    WARN: "You have received a warning",
    MUTE: "You have been muted",
    TIMEOUT: "You have been timed out",
    BAN: "You have been banned",
    TEMP_BAN: "You have been temporarily banned",
    PROBATION: "You have been placed on probation",
  };

  const actionColors = {
    WARN: "#f39c12",
    MUTE: "#e67e22",
    TIMEOUT: "#e67e22",
    BAN: "#e74c3c",
    TEMP_BAN: "#e74c3c",
    PROBATION: "#f1c40f",
  };

  const emoji = actionEmojis[actionType] || "⚠️";
  const title = `${emoji} ${actionTitles[actionType] || "Moderation Action"}`;
  const color = actionColors[actionType] || "#95a5a6";

  const durationText = durationSeconds
    ? formatDuration(durationSeconds)
    : "Permanent / no set expiry";

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      `You have received a moderation action in **${guildName}**.`,
    )
    .setColor(color)
    .addFields(
      {
        name: "Server",
        value: guildName || "Unknown server",
        inline: true,
      },
      {
        name: "Action",
        value: actionType || "UNKNOWN",
        inline: true,
      },
      {
        name: "Case ID",
        value: caseId || "Unknown",
        inline: true,
      },
      {
        name: "Reason",
        value: reason || "No reason provided",
      },
      {
        name: "Duration",
        value: durationText,
        inline: true,
      },
      {
        name: "Moderator",
        value: moderatorName || "Unknown",
        inline: true,
      },
    )
    .setFooter({ text: `Powered by Discore • ID: ${caseId}` })
    .setTimestamp();

  if (canAppeal) {
    embed.addFields({
      name: "Appeal",
      value:
        "You can appeal this action using the button below. Staff will review your appeal in a private moderation ticket.",
    });
  }

  const components = [];

  if (canAppeal) {
    const appealButton = new ButtonBuilder()
      .setCustomId(`appeal_open:${caseId}`)
      .setLabel("Appeal")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Primary);

    components.push(new ActionRowBuilder().addComponents(appealButton));
  }

  return { embed, components };
}

/**
 * Create log embed for moderation channel.
 */
function createModerationLogEmbed(options) {
  const {
    actionType,
    userId,
    userName,
    moderatorId,
    moderatorName,
    reason,
    caseId,
    durationSeconds,
    dmSent,
    actionSuccess,
    actionError,
  } = options;

  const embed = new EmbedBuilder()
    .setTitle(`🛡️ Moderation Action: ${actionType}`)
    .setColor(actionSuccess === false ? "#e74c3c" : "#3498db")
    .addFields(
      {
        name: "User",
        value: `<@${userId}> (${userName || "Unknown"})`,
        inline: true,
      },
      {
        name: "Moderator",
        value: `<@${moderatorId}> (${moderatorName || "Unknown"})`,
        inline: true,
      },
      {
        name: "Case ID",
        value: caseId || "Unknown",
        inline: true,
      },
      {
        name: "Reason",
        value: reason || "No reason provided",
      },
      {
        name: "Duration",
        value: durationSeconds
          ? formatDuration(durationSeconds)
          : "Permanent / no set expiry",
        inline: true,
      },
      {
        name: "User DM",
        value: dmSent ? "✅ Sent" : "⚠️ Failed or unavailable",
        inline: true,
      },
      {
        name: "Discord Action",
        value:
          actionSuccess === false
            ? `⚠️ Failed: ${actionError || "Unknown error"}`
            : "✅ Completed",
      },
    )
    .setFooter({ text: `Powered by Discore • ID: ${caseId}` })
    .setTimestamp();

  return embed;
}

module.exports = {
  createModerationDmEmbed,
  createModerationLogEmbed,
};
