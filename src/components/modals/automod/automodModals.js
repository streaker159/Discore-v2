"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const automodService = require("../../../modules/automod/service");
const { buildAdvancedLockedEmbed } = require("../../../modules/automod/embeds");
const { getSession, setSession } = require("../../../modules/automod/sessions");
const {
  requireAccess,
  goToExemptStepOrPreview,
} = require("../../buttons/automod/automodButtons");

function parseYesNo(value, fallback = false) {
  if (!value) return fallback;
  const v = value.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(v)) return true;
  if (["no", "n", "false", "0"].includes(v)) return false;
  return fallback;
}

function parseTimeoutDuration(value) {
  if (!value) return 600;
  const cleaned = value.trim().toLowerCase();
  const match = cleaned.match(/^(\d+)\s*(m|h|d)$/);
  if (!match) return 600;
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { m: 60, h: 3600, d: 86400 };
  return (
    automodService.normalizeTimeoutSeconds(amount * multipliers[unit]) || 600
  );
}

async function offerMessageConfigOrContinue(interaction, action) {
  if (["WARN", "TIMEOUT", "DELETE_AND_TIMEOUT"].includes(action)) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("automod:wizard:configure:message")
        .setLabel("Configure Message & Options")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("automod:wizard:skip:message")
        .setLabel("Skip")
        .setEmoji("⏭️")
        .setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({
      content:
        "✅ Basics saved. Configure the timeout/message options or skip to continue.",
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return goToExemptStepOrPreview(interaction);
}

module.exports = [
  // ── Step 1: create basics ────────────────────────────────────────────────
  {
    customIdPrefix: "automod:modal:create",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;

      const name = interaction.fields.getTextInputValue("name").trim();
      const phrase = interaction.fields.getTextInputValue("phrase").trim();
      const matchType = interaction.fields
        .getTextInputValue("matchType")
        .trim()
        .toUpperCase();
      const action = interaction.fields
        .getTextInputValue("action")
        .trim()
        .toUpperCase();
      const severityRaw = interaction.fields.fields.has("severity")
        ? interaction.fields.getTextInputValue("severity")?.trim()
        : "";
      const severity = (severityRaw || "MEDIUM").toUpperCase();

      const nameErr = automodService.validateName(name);
      if (nameErr) {
        return interaction.reply({
          content: `❌ ${nameErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const phraseErr = automodService.validatePhrase(phrase);
      if (phraseErr) {
        return interaction.reply({
          content: `❌ ${phraseErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const matchErr = automodService.validateMatchType(matchType);
      if (matchErr) {
        return interaction.reply({
          content: `❌ ${matchErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const actionErr = automodService.validateAction(action);
      if (actionErr) {
        return interaction.reply({
          content: `❌ ${actionErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const severityErr = automodService.validateSeverity(severity);
      if (severityErr) {
        return interaction.reply({
          content: `❌ ${severityErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (["TIMEOUT", "DELETE_AND_TIMEOUT"].includes(action)) {
        const hasAdvanced = await automodService.hasAdvancedAccess(
          interaction.guildId,
        );
        if (!hasAdvanced) {
          return interaction.reply({
            embeds: [buildAdvancedLockedEmbed()],
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      setSession(interaction.user.id, {
        name,
        phrase,
        matchType,
        action,
        severity,
      });

      await offerMessageConfigOrContinue(interaction, action);
    },
  },

  // ── Step 2: configure message/timeout/appeal options ────────────────────
  {
    customIdPrefix: "automod:modal:configure:message",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;

      const session = getSession(interaction.user.id);
      const userMessage = interaction.fields.fields.has("userMessage")
        ? interaction.fields.getTextInputValue("userMessage")?.trim() || null
        : null;

      const msgErr = automodService.validateUserMessage(userMessage);
      if (msgErr) {
        return interaction.reply({
          content: `❌ ${msgErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const updates = { userMessage };

      if (["TIMEOUT", "DELETE_AND_TIMEOUT"].includes(session.action)) {
        const timeoutDuration = interaction.fields
          .getTextInputValue("timeoutDuration")
          .trim();
        updates.timeoutSeconds = parseTimeoutDuration(timeoutDuration);
        updates.appealEnabled = parseYesNo(
          interaction.fields.getTextInputValue("appealEnabled"),
          true,
        );
        if (session.action === "TIMEOUT") {
          updates.deleteMessage = parseYesNo(
            interaction.fields.getTextInputValue("deleteOriginal"),
            false,
          );
        } else {
          updates.deleteMessage = true;
        }
      } else if (session.action === "WARN") {
        updates.appealEnabled = parseYesNo(
          interaction.fields.getTextInputValue("appealEnabled"),
          false,
        );
      }

      setSession(interaction.user.id, updates);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await goToExemptStepOrPreview(interaction);
    },
  },

  // ── Edit basics (existing rule) ─────────────────────────────────────────
  {
    customIdPrefix: "automod:modal:edit:basics",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;

      const name = interaction.fields.getTextInputValue("name").trim();
      const phrase = interaction.fields.getTextInputValue("phrase").trim();
      const matchType = interaction.fields
        .getTextInputValue("matchType")
        .trim()
        .toUpperCase();
      const action = interaction.fields
        .getTextInputValue("action")
        .trim()
        .toUpperCase();
      const severityRaw = interaction.fields.fields.has("severity")
        ? interaction.fields.getTextInputValue("severity")?.trim()
        : "";
      const severity = (severityRaw || "MEDIUM").toUpperCase();

      const nameErr = automodService.validateName(name);
      if (nameErr) {
        return interaction.reply({
          content: `❌ ${nameErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const phraseErr = automodService.validatePhrase(phrase);
      if (phraseErr) {
        return interaction.reply({
          content: `❌ ${phraseErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const matchErr = automodService.validateMatchType(matchType);
      if (matchErr) {
        return interaction.reply({
          content: `❌ ${matchErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const actionErr = automodService.validateAction(action);
      if (actionErr) {
        return interaction.reply({
          content: `❌ ${actionErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const severityErr = automodService.validateSeverity(severity);
      if (severityErr) {
        return interaction.reply({
          content: `❌ ${severityErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (["TIMEOUT", "DELETE_AND_TIMEOUT"].includes(action)) {
        const hasAdvanced = await automodService.hasAdvancedAccess(
          interaction.guildId,
        );
        if (!hasAdvanced) {
          return interaction.reply({
            embeds: [buildAdvancedLockedEmbed()],
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      setSession(interaction.user.id, {
        name,
        phrase,
        matchType,
        action,
        severity,
      });

      await offerMessageConfigOrContinue(interaction, action);
    },
  },

  // ── Test rule (no real action applied) ──────────────────────────────────
  {
    customIdPrefix: "automod:modal:test:",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      const ruleId = interaction.customId.split(":")[3];

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const rule = await automodService.getRule(ruleId, interaction.guildId);
      if (!rule) {
        return interaction.editReply({
          content: "❌ Rule not found. It may have been deleted.",
        });
      }

      const testMessage = interaction.fields.getTextInputValue("testMessage");
      const normalized = automodService.normalizeContent(testMessage);
      const { matched, matchedText } = automodService.matchRule(
        rule,
        normalized,
      );

      const embed = new EmbedBuilder()
        .setTitle("🧪 Automod Rule Test")
        .setColor(matched ? "#2ecc71" : "#95a5a6")
        .addFields(
          { name: "Rule", value: rule.name || rule.phrase, inline: true },
          {
            name: "Match Type",
            value:
              automodService.MATCH_TYPE_LABELS[rule.matchType] ||
              rule.matchType,
            inline: true,
          },
          {
            name: "Result",
            value: matched ? "✅ Matched" : "❌ No match",
            inline: true,
          },
        );

      if (matched) {
        embed.addFields(
          { name: "Matched Text", value: `\`${matchedText}\``, inline: true },
          {
            name: "Action That Would Run",
            value: automodService.ACTION_LABELS[rule.action] || rule.action,
            inline: true,
          },
        );
      }

      embed.setFooter({
        text: "No real action was applied — this is a test only.",
      });

      return interaction.editReply({ embeds: [embed] });
    },
  },
];
