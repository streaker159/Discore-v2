"use strict";

const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");
const { formatDuration } = require("../utils/durationParser");

/**
 * Create DM embed for moderation action
 * @param {Object} options
 * @param {string} options.guildName
 * @param {string} options.actionType - WARN, MUTE, TIMEOUT, BAN, PROBATION
 * @param {string} options.reason
 * @param {string} options.caseId - MOD-xxxxx
 * @param {number} options.durationSeconds
 * @param {string} options.moderatorName
 * @param {boolean} options.canAppeal
 * @returns {{embed: EmbedBuilder, components: ActionRowBuilder[]}}
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
    PROBATION: "🟡",
  };

  const actionTitles = {
    WARN: "You have received a warning",
    MUTE: "You have been muted",
    TIMEOUT: "You have been timed out",
    BAN: "You have been banned",
    PROBATION: "You have been placed on probation",
  };

  const actionColors = {
    WARN: "#f39c12",
    MUTE: "#e67e22",
    TIMEOUT: "#e67e22",
    BAN: "#e74c3c",
    PROBATION: "#95a5a6",
  };

  const emoji = actionEmojis[actionType] || "⚠️";
  const title = `${emoji} ${actionTitles[actionType] || "Moderation Action"}`;
  const color = actionColors[actionType] || "#95a5a6";

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`You have received a moderation action in **${guildName}**`)
    .setColor(color)
    .addFields(
      { name: "Reason", value: reason || "No reason provided" },
      {
        name: "Duration",
        value: durationSeconds ? formatDuration(durationSeconds) : "Permanent",
      },
      { name: "Moderator", value: moderatorName || "Unknown" },
      { name: "Case ID", value: caseId },
    )
    .setFooter({ text: `Powered by Discore • ID: ${caseId}` })
    .setTimestamp();

  // Add appeal info if applicable
  if (canAppeal && actionType !== "WARN") {
    embed.addFields({
      name: "Appeals",
      value: "You may appeal this action using the button below.",
    });
  }

  const components = [];

  // Add appeal button if allowed
  if (canAppeal && actionType !== "WARN") {
    const appealButton = new ButtonBuilder()
      .setCustomId(`appeal_open:${caseId}`)
      .setLabel("📝 Appeal")
      .setStyle(ButtonStyle.Primary);

    components.push(new ActionRowBuilder().addComponents(appealButton));
  }

  return { embed, components };
}

/**
 * Create log embed for mod channel
 * @param {Object} options
 * @returns {EmbedBuilder}
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
  } = options;

  const embed = new EmbedBuilder()
    .setTitle(`🛡️ Moderation Action: ${actionType}`)
    .setColor("#3498db")
    .addFields(
      { name: "User", value: `<@${userId}> (${userName})`, inline: true },
      {
        name: "Moderator",
        value: `<@${moderatorId}> (${moderatorName})`,
        inline: true,
      },
      { name: "Case ID", value: caseId, inline: true },
      { name: "Reason", value: reason || "No reason provided" },
      {
        name: "Duration",
        value: durationSeconds ? formatDuration(durationSeconds) : "Permanent",
      },
    )
    .setFooter({ text: `Case ID: ${caseId}` })
    .setTimestamp();

  return embed;
}

module.exports = {
  createModerationDmEmbed,
  createModerationLogEmbed,
};
