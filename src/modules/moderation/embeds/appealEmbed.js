"use strict";

const { EmbedBuilder } = require("discord.js");
const { formatDuration } = require("../utils/durationParser");
const { formatDiscordTime } = require("../../../lib/embedBuilder");

function safeValue(value, fallback = "Not set") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function trimField(value, max = 1024) {
  const text = safeValue(value, "None");
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function statusStyle(status) {
  const styles = {
    OPEN: { emoji: "🧾", color: "#3498db", title: "Appeal Opened" },
    PENDING: { emoji: "🧾", color: "#3498db", title: "Appeal Pending" },
    ACCEPTED: { emoji: "✅", color: "#2ecc71", title: "Appeal Accepted" },
    REJECTED: { emoji: "❌", color: "#e74c3c", title: "Appeal Rejected" },
    REDUCED: { emoji: "🔁", color: "#f39c12", title: "Punishment Reduced" },
    CLOSED: { emoji: "🔒", color: "#95a5a6", title: "Appeal Closed" },
  };

  return styles[status] || styles.OPEN;
}

async function resolveUsers(guild, appeal, moderationCase) {
  const user = await guild.client.users.fetch(appeal.userId).catch(() => null);
  const moderator = await guild.client.users
    .fetch(moderationCase.moderatorId)
    .catch(() => null);

  return { user, moderator };
}

async function getPreviousModerationSummary(moderationCase) {
  const previousCases =
    await require("../repositories/moderationCaseRepository").getUserCases(
      moderationCase.guildId,
      moderationCase.userId,
      { limit: 10 },
    );

  const filtered = previousCases.filter(
    (c) => c.id !== moderationCase.id && c.status !== "REVOKED",
  );

  if (!filtered.length) return "No previous visible cases";

  return filtered
    .slice(0, 5)
    .map((c) => `• ${c.publicId} — ${c.actionType} — ${c.status}`)
    .join("\n");
}

function durationText(moderationCase) {
  if (!moderationCase.expiresAt) return "Permanent";

  return `${formatDuration(moderationCase.durationSeconds)} (${formatDiscordTime(moderationCase.expiresAt).full})`;
}

/**
 * Main staff-control embed for the configured #appeals channel.
 * This is the ONLY appeal message that should have Accept/Reject/Reduce buttons.
 */
async function createAppealControlEmbed(
  appeal,
  moderationCase,
  guild,
  ticketChannel = null,
) {
  const { user, moderator } = await resolveUsers(guild, appeal, moderationCase);
  const prevSummary = await getPreviousModerationSummary(moderationCase);
  const style = statusStyle(appeal.status);

  const embed = new EmbedBuilder()
    .setTitle(`${style.emoji} ${style.title} — ${appeal.publicId}`)
    .setColor(style.color)
    .addFields(
      {
        name: "User",
        value: user ? `${user.tag} (<@${user.id}>)` : `<@${appeal.userId}>`,
        inline: true,
      },
      { name: "Case ID", value: moderationCase.publicId, inline: true },
      {
        name: "Ticket",
        value: ticketChannel
          ? `<#${ticketChannel.id}>`
          : appeal.channelId
            ? `<#${appeal.channelId}>`
            : "Not created",
        inline: true,
      },
      {
        name: "Original Action",
        value: moderationCase.actionType,
        inline: true,
      },
      {
        name: "Current Status",
        value: appeal.status,
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
        name: "Original Reason",
        value: trimField(moderationCase.reason || "No reason provided"),
        inline: false,
      },
      {
        name: "Duration / Expires",
        value: durationText(moderationCase),
        inline: true,
      },
      {
        name: "Appeal Text",
        value: trimField(appeal.appealText),
        inline: false,
      },
      {
        name: "Previous Moderation",
        value: trimField(prevSummary),
        inline: false,
      },
    )
    .setFooter({
      text: `Appeal ID: ${appeal.publicId} • Case ID: ${moderationCase.publicId}`,
    })
    .setTimestamp();

  if (appeal.outcome) {
    embed.addFields({
      name: "📌 Decision / Outcome",
      value: trimField(appeal.outcome),
      inline: false,
    });
  }

  if (appeal.closedBy) {
    embed.addFields({
      name: "Handled By",
      value: `<@${appeal.closedBy}>`,
      inline: true,
    });
  }

  if (user) {
    embed.setThumbnail(user.displayAvatarURL());
  }

  return embed;
}

/**
 * Info-only ticket embed.
 * No decision buttons belong in the ticket channel.
 */
async function createAppealTicketEmbed(appeal, moderationCase, guild) {
  const { user, moderator } = await resolveUsers(guild, appeal, moderationCase);
  const style = statusStyle(appeal.status);

  const embed = new EmbedBuilder()
    .setTitle(`🎟️ Appeal Ticket — ${appeal.publicId}`)
    .setColor(style.color)
    .setDescription(
      "This channel is for staff discussion and, if staff choose, direct discussion with the member. Decisions are controlled from the main appeals channel.",
    )
    .addFields(
      {
        name: "User",
        value: user ? `${user.tag} (<@${user.id}>)` : `<@${appeal.userId}>`,
        inline: true,
      },
      { name: "Case ID", value: moderationCase.publicId, inline: true },
      { name: "Action", value: moderationCase.actionType, inline: true },
      {
        name: "Original Reason",
        value: trimField(moderationCase.reason || "No reason provided"),
        inline: false,
      },
      {
        name: "Duration / Expires",
        value: durationText(moderationCase),
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
        value: trimField(appeal.appealText),
        inline: false,
      },
      {
        name: "Status",
        value: appeal.status,
        inline: true,
      },
    )
    .setFooter({ text: `Appeal ID: ${appeal.publicId} • Ticket info only` })
    .setTimestamp();

  if (user) {
    embed.setThumbnail(user.displayAvatarURL());
  }

  return embed;
}

/**
 * Backwards-compatible old name.
 */
async function createAppealEmbed(appeal, moderationCase, guild) {
  return createAppealControlEmbed(appeal, moderationCase, guild);
}

/**
 * Visible decision embed posted in the ticket before it deletes.
 */
function createAppealDecisionEmbed(
  appeal,
  decision,
  note,
  guildName,
  handledById = null,
) {
  const style = statusStyle(decision);

  const embed = new EmbedBuilder()
    .setTitle(`${style.emoji} ${style.title} — ${appeal.publicId}`)
    .setDescription(
      `A decision has been made for appeal **${appeal.publicId}** in **${guildName}**.`,
    )
    .setColor(style.color)
    .addFields(
      { name: "Appeal ID", value: appeal.publicId, inline: true },
      {
        name: "Case ID",
        value: appeal.case?.publicId || "Unknown",
        inline: true,
      },
      { name: "Decision", value: decision, inline: true },
      {
        name: "Decision Note",
        value: trimField(note || appeal.outcome || "No note provided"),
        inline: false,
      },
    )
    .setFooter({ text: `Powered by Discore • ${appeal.publicId}` })
    .setTimestamp();

  if (handledById) {
    embed.addFields({
      name: "Handled By",
      value: `<@${handledById}>`,
      inline: true,
    });
  }

  return embed;
}

/**
 * DM embed sent to user after decision.
 */
function createAppealOutcomeEmbed(appeal, outcome, guildName) {
  const style = statusStyle(appeal.status);

  const embed = new EmbedBuilder()
    .setTitle(`${style.emoji} ${style.title}`)
    .setDescription(
      `Your appeal for case **${appeal.case?.publicId || "Unknown"}** in **${guildName}** has been reviewed.`,
    )
    .setColor(style.color)
    .addFields(
      { name: "Appeal ID", value: appeal.publicId, inline: true },
      { name: "Status", value: appeal.status, inline: true },
      {
        name: "Outcome",
        value: trimField(
          outcome || appeal.outcome || "No additional information",
        ),
      },
    )
    .setFooter({ text: `Powered by Discore • ${appeal.publicId}` })
    .setTimestamp();

  return embed;
}

/**
 * Backwards-compatible updater.
 * It updates the first bot embed in the current channel and removes buttons if the appeal is closed.
 */
async function updateAppealChannelEmbed(channel, appeal, moderationCase) {
  try {
    const messages = await channel.messages.fetch({ limit: 25 });
    const appealMessage = messages.find((message) => {
      if (
        message.author.id !== channel.client.user.id ||
        !message.embeds.length
      )
        return false;

      const footer = message.embeds[0]?.footer?.text || "";
      const title = message.embeds[0]?.title || "";
      const content = message.content || "";

      return (
        footer.includes(appeal.publicId) ||
        title.includes(appeal.publicId) ||
        content.includes(appeal.publicId)
      );
    });

    if (!appealMessage) return null;

    const embed = await createAppealControlEmbed(
      appeal,
      moderationCase,
      channel.guild,
    );

    const closedStatuses = ["ACCEPTED", "REJECTED", "REDUCED", "CLOSED"];

    await appealMessage.edit({
      embeds: [embed],
      components: closedStatuses.includes(appeal.status)
        ? []
        : appealMessage.components,
    });

    return appealMessage;
  } catch (error) {
    console.error("[Appeal] Could not update embed:", error);
    return null;
  }
}

module.exports = {
  createAppealEmbed,
  createAppealControlEmbed,
  createAppealTicketEmbed,
  createAppealDecisionEmbed,
  createAppealOutcomeEmbed,
  updateAppealChannelEmbed,
};
