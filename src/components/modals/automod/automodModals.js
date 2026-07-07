"use strict";

const { EmbedBuilder, MessageFlags } = require("discord.js");
const automodService = require("../../../modules/automod/service");
const { getSession, setSession } = require("../../../modules/automod/sessions");
const {
  requireAccess,
  goToExemptStepOrPreview,
  showMatchActionStep,
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

/**
 * Save name+phrase from the basics modal, priming matchType/action/severity
 * with sensible defaults (create) or the existing rule's values (edit, via
 * primeEditSession which already populated the session before this modal
 * was shown), then hand off to the dropdown-based match/action/severity step.
 */
async function handleBasicsModalSubmit(interaction) {
  if (!requireAccess(interaction)) return;

  const name = interaction.fields.getTextInputValue("name").trim();
  const phrase = interaction.fields.getTextInputValue("phrase").trim();

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

  const session = getSession(interaction.user.id);
  setSession(interaction.user.id, {
    name,
    phrase,
    matchType: session.matchType || "CONTAINS",
    action: session.action || "REVIEW",
    severity: session.severity || "MEDIUM",
  });

  await showMatchActionStep(interaction, { isReply: true });
}

module.exports = [
  // ── Step 1: create basics ────────────────────────────────────────────────
  {
    customIdPrefix: "automod:modal:create",
    async execute(interaction) {
      await handleBasicsModalSubmit(interaction);
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
      await handleBasicsModalSubmit(interaction);
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
