"use strict";

const { MessageFlags } = require("discord.js");
const automodService = require("../../../modules/automod/service");
const { buildAdvancedLockedEmbed } = require("../../../modules/automod/embeds");
const {
  getSession,
  setSession,
  clearSession,
} = require("../../../modules/automod/sessions");
const {
  requireAccess,
  showRuleDetail,
  showActionButtons,
  showDeleteConfirm,
  buildEditBasicsModal,
  buildTestModal,
  goToExemptStepOrPreview,
  primeEditSession,
  showMatchActionStep,
} = require("../../buttons/automod/automodButtons");

module.exports = [
  // ── Generic rule picker — branches on session.selectIntent ───────────────
  {
    customIdPrefix: "automod:select:rule",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      const ruleId = interaction.values[0];
      const session = getSession(interaction.user.id);
      const intent = session.selectIntent || "view";

      if (intent === "edit") {
        const rule = await automodService.getRule(ruleId, interaction.guildId);
        if (!rule) {
          return interaction.reply({
            content: "❌ Rule not found.",
            flags: MessageFlags.Ephemeral,
          });
        }
        primeEditSession(interaction.user.id, rule);
        return interaction.showModal(buildEditBasicsModal(rule));
      }

      if (intent === "test") {
        return interaction.showModal(buildTestModal(ruleId));
      }

      await interaction.deferUpdate().catch(() => {});

      if (intent === "delete") {
        return showDeleteConfirm(interaction, ruleId);
      }

      if (intent === "action") {
        return showActionButtons(interaction, ruleId);
      }

      if (intent === "toggle") {
        await automodService.toggleRule(ruleId, interaction.guildId);
        return showRuleDetail(interaction, ruleId);
      }

      // Default: plain "view" from the rule list.
      return showRuleDetail(interaction, ruleId);
    },
  },

  // ── Rule wizard: match type / action / severity dropdowns ────────────────
  {
    customIdPrefix: "automod:select:matchtype",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      setSession(interaction.user.id, { matchType: interaction.values[0] });
      await showMatchActionStep(interaction, { isReply: false });
    },
  },
  {
    customIdPrefix: "automod:select:actiontype",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      const action = interaction.values[0];

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

      setSession(interaction.user.id, { action });
      await showMatchActionStep(interaction, { isReply: false });
    },
  },
  {
    customIdPrefix: "automod:select:severity",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      setSession(interaction.user.id, { severity: interaction.values[0] });
      await showMatchActionStep(interaction, { isReply: false });
    },
  },

  // ── Settings: review channel ───────────────────────────────────────────
  {
    customIdPrefix: "automod:select:reviewchannel",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      const channelId = interaction.values[0];
      await automodService.updateGuildAutomodSettings(interaction.guildId, {
        automodReviewChannelId: channelId,
      });
      await interaction.editReply({
        content: `✅ Review channel set to <#${channelId}>.`,
        embeds: [],
        components: [],
      });
    },
  },

  // ── Settings: default action ───────────────────────────────────────────
  {
    customIdPrefix: "automod:select:defaultaction",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      const action = interaction.values[0];
      await automodService.updateGuildAutomodSettings(interaction.guildId, {
        automodDefaultAction: action,
      });
      await interaction.editReply({
        content: `✅ Default action set to **${automodService.ACTION_LABELS[action] || action}**.`,
        embeds: [],
        components: [],
      });
    },
  },

  // ── Rule wizard: exempt roles ───────────────────────────────────────────
  {
    customIdPrefix: "automod:select:exemptroles",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      setSession(interaction.user.id, { exemptRoleIds: interaction.values });
      await goToExemptStepOrPreview(interaction);
    },
  },

  // ── Rule wizard: ignored channels ──────────────────────────────────────
  {
    customIdPrefix: "automod:select:ignoredchannels",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      setSession(interaction.user.id, {
        ignoredChannelIds: interaction.values,
      });
      await goToExemptStepOrPreview(interaction);
    },
  },
];
