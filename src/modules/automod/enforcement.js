"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const prisma = require("../../lib/prisma");
const logger = require("../../lib/logger");
const {
  executeModAction,
} = require("../moderation/services/moderationActionService");
const automodService = require("./service");

const { ACTION_LABELS, MATCH_TYPE_LABELS, SEVERITY_LABELS } = automodService;

// ── Helpers ──────────────────────────────────────────────────────────────

function replacePlaceholders(text, vars) {
  if (!text) return text;
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "gi"), value ?? "");
  }
  return result;
}

function buildAutomodReason(rule, matchedText) {
  const name = rule.name || rule.phrase;
  return `Automod: ${name} (matched "${matchedText}")`.slice(0, 400);
}

function formatDurationShort(seconds) {
  if (!seconds) return "N/A";
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

async function safeDeleteMessage(message, reason) {
  try {
    const botMember = message.guild.members.me;
    const perms = message.channel.permissionsFor(botMember);
    if (!perms?.has("ManageMessages")) {
      return { deleted: false, error: "no_manage_messages_permission" };
    }
    await message.delete();
    return { deleted: true, error: null };
  } catch (err) {
    return { deleted: false, error: err.message };
  }
}

async function resolveLogChannel(guild, rule, ctx) {
  const channelId = automodService.resolveLogChannelId(rule, ctx);
  if (!channelId) return null;
  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return null;
    return channel;
  } catch {
    return null;
  }
}

// ── Should we even look at this message? ──────────────────────────────────

function shouldSkipMessage(message) {
  if (!message.guild) return true;
  if (message.author?.bot) return true;
  if (message.webhookId) return true;
  if (!message.content || !message.content.trim()) return true;
  return false;
}

// ── Embeds ───────────────────────────────────────────────────────────────

function buildReviewEmbed(rule, message, matchedText, triggerLog) {
  const excerpt =
    message.content.length > 500
      ? `${message.content.slice(0, 500)}...`
      : message.content;

  const embed = new EmbedBuilder()
    .setTitle("🛡️ Automod Review")
    .setColor("#F1C40F")
    .addFields(
      { name: "User", value: `<@${message.author.id}>`, inline: true },
      { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
      {
        name: "Rule",
        value: rule.name || rule.phrase,
        inline: true,
      },
      {
        name: "Matched Phrase",
        value: `\`${matchedText}\``,
        inline: true,
      },
      {
        name: "Match Type",
        value: MATCH_TYPE_LABELS[rule.matchType] || rule.matchType,
        inline: true,
      },
      {
        name: "Severity",
        value: SEVERITY_LABELS[rule.severity] || rule.severity,
        inline: true,
      },
      {
        name: "Original Message",
        value: excerpt || "*(empty)*",
        inline: false,
      },
      {
        name: "Jump to Message",
        value: `[Click here](${message.url})`,
        inline: true,
      },
      { name: "Status", value: "🟡 Pending review", inline: true },
    )
    .setFooter({ text: `ID: ${triggerLog.publicId}` })
    .setTimestamp();

  return embed;
}

function buildReviewButtons(logId, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`automod:review:delete:${logId}`)
        .setLabel("Delete Message")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`automod:review:warn:${logId}`)
        .setLabel("Warn User")
        .setEmoji("⚠️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`automod:review:timeout10:${logId}`)
        .setLabel("Timeout 10m")
        .setEmoji("⏳")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`automod:review:timeout60:${logId}`)
        .setLabel("Timeout 1h")
        .setEmoji("⏳")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`automod:review:ignore:${logId}`)
        .setLabel("Ignore")
        .setEmoji("✖️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`automod:review:disable:${logId}`)
        .setLabel("Disable Rule")
        .setEmoji("⏸️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`automod:review:opencase:${logId}`)
        .setLabel("Open Case")
        .setEmoji("📁")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  ];
}

function buildAutoLogEmbed(
  rule,
  message,
  matchedText,
  resultText,
  color = "#3498db",
) {
  return new EmbedBuilder()
    .setTitle(`🛡️ Automod: ${ACTION_LABELS[rule.action] || rule.action}`)
    .setColor(color)
    .addFields(
      { name: "User", value: `<@${message.author.id}>`, inline: true },
      { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
      { name: "Rule", value: rule.name || rule.phrase, inline: true },
      { name: "Matched", value: `\`${matchedText}\``, inline: true },
      { name: "Result", value: resultText, inline: false },
    )
    .setFooter({ text: "Discore Automod" })
    .setTimestamp();
}

// ── Main enforcement entry point (called from messageCreate) ─────────────

async function processMessage(client, message) {
  if (shouldSkipMessage(message)) return;

  const guildId = message.guild.id;

  let ctx;
  try {
    ctx = await automodService.getAutomodContext(guildId);
  } catch (err) {
    logger.error("Automod: failed to load context", {
      guildId,
      error: err.message,
    });
    return;
  }

  if (!ctx.enabled || ctx.rules.length === 0) return;

  const candidateRules = ctx.rules.filter(
    (rule) => !automodService.isExempt(rule, message),
  );
  if (candidateRules.length === 0) return;

  const normalized = automodService.normalizeContent(message.content);
  const best = automodService.pickBestMatch(candidateRules, normalized);
  if (!best) return;

  try {
    await executeRuleAction(client, message, best.rule, best.matchedText, ctx);
  } catch (err) {
    logger.error("Automod: enforcement crashed", {
      guildId,
      ruleId: best.rule.id,
      error: err.message,
    });
  }
}

async function executeRuleAction(client, message, rule, matchedText, ctx) {
  const guild = message.guild;

  switch (rule.action) {
    case "REVIEW": {
      const triggerLog = await automodService.recordTrigger(rule, {
        userId: message.author.id,
        channelId: message.channel.id,
        messageId: message.id,
        matchedText,
        messageExcerpt: message.content,
        status: "PENDING",
      });

      const channel = await resolveLogChannel(guild, rule, ctx);
      if (!channel) {
        logger.warn(
          "Automod: REVIEW rule matched but no review/log channel configured",
          { guildId: guild.id, ruleId: rule.id },
        );
        return;
      }

      const perms = channel.permissionsFor(guild.members.me);
      if (!perms?.has("SendMessages") || !perms?.has("EmbedLinks")) {
        logger.warn("Automod: missing permissions to send review embed", {
          guildId: guild.id,
          channelId: channel.id,
        });
        return;
      }

      const embed = buildReviewEmbed(rule, message, matchedText, triggerLog);
      const components = buildReviewButtons(triggerLog.publicId);
      const sent = await channel
        .send({ embeds: [embed], components })
        .catch((err) => {
          logger.warn("Automod: failed to send review embed", {
            error: err.message,
          });
          return null;
        });

      if (sent) {
        await automodService
          .updateTriggerLog(triggerLog.id, { reviewMessageId: sent.id })
          .catch(() => {});
      }
      return;
    }

    case "DELETE": {
      const del = await safeDeleteMessage(message);
      await automodService.recordTrigger(rule, {
        userId: message.author.id,
        channelId: message.channel.id,
        messageId: message.id,
        matchedText,
        messageExcerpt: message.content,
        status: "APPROVED",
        resolutionAction: del.deleted
          ? "AUTO_DELETE"
          : `AUTO_DELETE_FAILED: ${del.error}`,
      });

      const channel = await resolveLogChannel(guild, rule, ctx);
      if (!channel) return;
      const embed = buildAutoLogEmbed(
        rule,
        message,
        matchedText,
        del.deleted
          ? "✅ Message deleted."
          : `⚠️ Could not delete message: ${del.error}`,
        del.deleted ? "#3498db" : "#e74c3c",
      );
      await channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    case "SILENT_LOG": {
      await automodService.recordTrigger(rule, {
        userId: message.author.id,
        channelId: message.channel.id,
        messageId: message.id,
        matchedText,
        messageExcerpt: message.content,
        status: "APPROVED",
        resolutionAction: "SILENT_LOG",
      });

      const channel = await resolveLogChannel(guild, rule, ctx);
      if (!channel) return;
      const embed = buildAutoLogEmbed(
        rule,
        message,
        matchedText,
        "📝 Logged only, no action taken.",
        "#95a5a6",
      );
      await channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    case "WARN": {
      const member = message.member;
      let actionSuccess = false;
      let moderationCase = null;
      let actionError = null;

      try {
        const result = await executeModAction({
          guild,
          moderator: guild.members.me,
          targetUser: message.author,
          targetMember: member,
          actionType: "WARN",
          reason: buildAutomodReason(rule, matchedText),
          durationSeconds: null,
          canAppeal: !!rule.appealEnabled,
        });
        actionSuccess = result.actionSuccess;
        moderationCase = result.case;
        actionError = result.actionError;
      } catch (err) {
        actionError = err.message;
      }

      await automodService.recordTrigger(rule, {
        userId: message.author.id,
        channelId: message.channel.id,
        messageId: message.id,
        matchedText,
        messageExcerpt: message.content,
        status: "APPROVED",
        resolutionAction: actionSuccess
          ? "AUTO_WARN"
          : `AUTO_WARN_FAILED: ${actionError}`,
        moderationCaseId: moderationCase?.id || null,
      });

      if (!actionSuccess) {
        logger.warn("Automod: WARN action failed", {
          guildId: guild.id,
          ruleId: rule.id,
          error: actionError,
        });
      }
      return;
    }

    case "TIMEOUT":
    case "DELETE_AND_TIMEOUT": {
      const shouldDelete =
        rule.action === "DELETE_AND_TIMEOUT" || rule.deleteMessage;

      let deleteResult = { deleted: false, error: null };
      if (shouldDelete) {
        deleteResult = await safeDeleteMessage(message);
      }

      const member = message.member;
      const durationSeconds = automodService.normalizeTimeoutSeconds(
        rule.timeoutSeconds || 600,
      );

      let actionSuccess = false;
      let actionError = null;
      let moderationCase = null;

      try {
        const result = await executeModAction({
          guild,
          moderator: guild.members.me,
          targetUser: message.author,
          targetMember: member,
          actionType: "TIMEOUT",
          reason: buildAutomodReason(rule, matchedText),
          durationSeconds,
          canAppeal: !!rule.appealEnabled,
        });
        actionSuccess = result.actionSuccess;
        actionError = result.actionError;
        moderationCase = result.case;
      } catch (err) {
        actionError = err.message;
      }

      await automodService.recordTrigger(rule, {
        userId: message.author.id,
        channelId: message.channel.id,
        messageId: message.id,
        matchedText,
        messageExcerpt: message.content,
        status: "APPROVED",
        resolutionAction: actionSuccess
          ? `AUTO_TIMEOUT (${formatDurationShort(durationSeconds)})${shouldDelete ? (deleteResult.deleted ? " + DELETE" : " + DELETE_FAILED") : ""}`
          : `AUTO_TIMEOUT_FAILED: ${actionError}`,
        moderationCaseId: moderationCase?.id || null,
      });

      if (!actionSuccess) {
        logger.warn("Automod: TIMEOUT action failed", {
          guildId: guild.id,
          ruleId: rule.id,
          error: actionError,
        });
        return;
      }

      if (rule.userMessage) {
        const content = replacePlaceholders(rule.userMessage, {
          userMention: `<@${message.author.id}>`,
          username: message.author.username,
          displayName: member?.displayName || message.author.username,
          duration: formatDurationShort(durationSeconds),
          serverName: guild.name,
          ruleName: rule.name || rule.phrase,
          appealInfo: rule.appealEnabled
            ? "You can appeal using the button below."
            : "Contact staff if you believe this was a mistake.",
        });

        const components = [];
        if (rule.appealEnabled && moderationCase) {
          components.push(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`appeal_open:${moderationCase.publicId}`)
                .setLabel("Appeal Timeout")
                .setEmoji("📝")
                .setStyle(ButtonStyle.Primary),
            ),
          );
        }

        const perms = message.channel.permissionsFor(guild.members.me);
        if (perms?.has("SendMessages")) {
          message.channel
            .send({ content, components })
            .then((sentMsg) => {
              setTimeout(() => {
                sentMsg.delete().catch(() => {});
              }, 30_000).unref?.();
            })
            .catch(() => {});
        }
      }
      return;
    }

    default:
      return;
  }
}

// ── Staff review button handling ──────────────────────────────────────────

const REVIEW_ACTION_LABELS = {
  delete: "🗑️ Deleted the message",
  warn: "⚠️ Warned the user",
  timeout10: "⏳ Timed out the user for 10 minutes",
  timeout60: "⏳ Timed out the user for 1 hour",
  ignore: "✖️ Ignored",
  disable: "⏸️ Disabled the rule",
  opencase: "📁 Opened a formal moderation case",
};

async function handleReviewAction(interaction, reviewAction, logId) {
  if (!automodService.checkAutomodAccess(interaction)) {
    return interaction.reply({
      content:
        "🔒 You need Manage Guild, Manage Messages, Moderate Members, or Administrator permission.",
      flags: 64,
    });
  }

  const triggerLog = await prisma.autoModCase.findFirst({
    where: { publicId: logId, guildId: interaction.guildId },
    include: { rule: true },
  });

  if (!triggerLog) {
    return interaction.reply({
      content: "❌ This review log could not be found (it may be expired).",
      flags: 64,
    });
  }

  if (triggerLog.status !== "PENDING") {
    return interaction.reply({
      content: `⚠️ This review has already been handled${triggerLog.reviewedBy ? ` by <@${triggerLog.reviewedBy}>` : ""}.`,
      flags: 64,
    });
  }

  // Atomic claim — avoids double-handling if two staff click at once.
  const claim = await prisma.autoModCase.updateMany({
    where: { id: triggerLog.id, status: "PENDING" },
    data: {
      status: reviewAction === "ignore" ? "DENIED" : "APPROVED",
      reviewedAt: new Date(),
      reviewedBy: interaction.user.id,
      resolutionAction: REVIEW_ACTION_LABELS[reviewAction] || reviewAction,
    },
  });

  if (claim.count === 0) {
    return interaction.reply({
      content: "⚠️ Someone else just handled this review.",
      flags: 64,
    });
  }

  const guild = interaction.guild;
  const rule = triggerLog.rule;
  let resultText = REVIEW_ACTION_LABELS[reviewAction] || reviewAction;

  try {
    const targetUser = await guild.client.users
      .fetch(triggerLog.userId)
      .catch(() => null);
    const targetMember = await guild.members
      .fetch(triggerLog.userId)
      .catch(() => null);

    if (reviewAction === "delete") {
      if (triggerLog.messageId) {
        try {
          const channel = await guild.channels.fetch(triggerLog.channelId);
          const msg = await channel.messages
            .fetch(triggerLog.messageId)
            .catch(() => null);
          if (msg) {
            const del = await safeDeleteMessage(msg);
            resultText = del.deleted
              ? "🗑️ Message deleted."
              : `⚠️ Could not delete message: ${del.error}`;
          } else {
            resultText = "⚠️ Message was already gone.";
          }
        } catch {
          resultText = "⚠️ Could not fetch/delete the original message.";
        }
      }
    } else if (reviewAction === "warn" || reviewAction === "opencase") {
      const result = await executeModAction({
        guild,
        moderator: interaction.member,
        targetUser,
        targetMember,
        actionType: "WARN",
        reason:
          reviewAction === "opencase"
            ? `Automod review escalated: ${rule.name || rule.phrase}`
            : buildAutomodReason(rule, triggerLog.matchedText || rule.phrase),
        durationSeconds: null,
        canAppeal: !!rule.appealEnabled,
      });
      resultText = result.actionSuccess
        ? reviewAction === "opencase"
          ? `📁 Case ${result.case.publicId} opened.`
          : `⚠️ User warned (case ${result.case.publicId}).`
        : `⚠️ Action failed: ${result.actionError}`;
      await automodService
        .updateTriggerLog(triggerLog.id, {
          moderationCaseId: result.case?.id || null,
        })
        .catch(() => {});
    } else if (reviewAction === "timeout10" || reviewAction === "timeout60") {
      const durationSeconds = reviewAction === "timeout10" ? 600 : 3600;
      const result = await executeModAction({
        guild,
        moderator: interaction.member,
        targetUser,
        targetMember,
        actionType: "TIMEOUT",
        reason: buildAutomodReason(rule, triggerLog.matchedText || rule.phrase),
        durationSeconds,
        canAppeal: !!rule.appealEnabled,
      });
      resultText = result.actionSuccess
        ? `⏳ User timed out for ${formatDurationShort(durationSeconds)} (case ${result.case.publicId}).`
        : `⚠️ Timeout failed: ${result.actionError}`;
      await automodService
        .updateTriggerLog(triggerLog.id, {
          moderationCaseId: result.case?.id || null,
        })
        .catch(() => {});
    } else if (reviewAction === "disable") {
      await automodService.updateRule(rule.id, interaction.guildId, {
        enabled: false,
      });
      resultText = `⏸️ Rule **${rule.name || rule.phrase}** disabled.`;
    } else if (reviewAction === "ignore") {
      resultText = "✖️ Ignored — no action taken.";
    }
  } catch (err) {
    logger.error("Automod: review action failed", {
      error: err.message,
      reviewAction,
      logId,
    });
    resultText = `⚠️ Something went wrong: ${err.message}`;
  }

  const embed = EmbedBuilder.from(interaction.message.embeds[0] || {})
    .setColor(reviewAction === "ignore" ? "#95a5a6" : "#2ecc71")
    .spliceFields(-1, 1, {
      name: "Status",
      value: `✅ Handled by <@${interaction.user.id}>\n${resultText}`,
      inline: false,
    });

  await interaction.update({
    embeds: [embed],
    components: buildReviewButtons(logId, true),
  });
}

module.exports = {
  processMessage,
  handleReviewAction,
  buildReviewEmbed,
  buildReviewButtons,
  buildAutoLogEmbed,
  buildAutomodReason,
  formatDurationShort,
  replacePlaceholders,
  safeDeleteMessage,
};
