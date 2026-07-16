"use strict";

const {
  requireSniperAdmin,
} = require("../../../modules/sniper/sniperPermissions");
const wizardState = require("../../../modules/sniper/sniperWizardState");
const {
  buildWizardStepEmbed,
  WIZARD_STEPS,
} = require("../../../modules/sniper/sniperEmbeds");
const {
  buildWizardNav,
} = require("../../buttons/sniper/sniperDashboardButtons");
const db = require("../../../modules/sniper/sniperDb");

// ── Wizard selects ──────────────────────────────────────────────────────────
module.exports = [
  {
    customId: "sniper:wiz:channels_select",
    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;
      const state = wizardState.get(interaction.user.id, interaction.guildId);
      if (!state)
        return interaction.reply({
          content: "Wizard session expired.",
          flags: 64,
        });
      const channelIds = interaction.values || [];
      if (channelIds.length > 5)
        return interaction.reply({
          content: "Maximum 5 challenge channels allowed.",
          flags: 64,
        });
      state.challengeChannelIds = channelIds;
      wizardState.set(interaction.user.id, interaction.guildId, state);
      await interaction.update({
        embeds: [buildWizardStepEmbed(WIZARD_STEPS.CHANNELS, state)],
        components: buildWizardNav(WIZARD_STEPS.CHANNELS),
      });
    },
  },
  {
    customId: "sniper:wiz:role_select",
    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;
      const state = wizardState.get(interaction.user.id, interaction.guildId);
      if (!state)
        return interaction.reply({
          content: "Wizard session expired.",
          flags: 64,
        });
      const roleId = interaction.values?.[0];
      if (!roleId)
        return interaction.reply({
          content: "Please select a valid role.",
          flags: 64,
        });
      if (roleId === interaction.guildId)
        return interaction.reply({
          content: "Cannot select @everyone.",
          flags: 64,
        });
      state.rewardRoleId = roleId;
      wizardState.set(interaction.user.id, interaction.guildId, state);
      await interaction.update({
        embeds: [buildWizardStepEmbed(WIZARD_STEPS.ROLE, state)],
        components: buildWizardNav(WIZARD_STEPS.ROLE),
      });
    },
  },
  {
    customId: "sniper:wiz:teaser_select",
    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;
      const state = wizardState.get(interaction.user.id, interaction.guildId);
      if (!state)
        return interaction.reply({
          content: "Wizard session expired.",
          flags: 64,
        });
      state.teaserRoleId = interaction.values?.[0] || null;
      wizardState.set(interaction.user.id, interaction.guildId, state);
      await interaction.update({
        embeds: [buildWizardStepEmbed(WIZARD_STEPS.TEASER, state)],
        components: buildWizardNav(WIZARD_STEPS.TEASER),
      });
    },
  },
  {
    customId: "sniper:wiz:leaderboard_select",
    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;
      const state = wizardState.get(interaction.user.id, interaction.guildId);
      if (!state)
        return interaction.reply({
          content: "Wizard session expired.",
          flags: 64,
        });
      state.leaderboardChannelId = interaction.values?.[0] || null;
      wizardState.set(interaction.user.id, interaction.guildId, state);
      await interaction.update({
        embeds: [buildWizardStepEmbed(WIZARD_STEPS.LEADERBOARD, state)],
        components: buildWizardNav(WIZARD_STEPS.LEADERBOARD),
      });
    },
  },
  {
    customId: "sniper:wiz:notif_select",
    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;
      const state = wizardState.get(interaction.user.id, interaction.guildId);
      if (!state)
        return interaction.reply({
          content: "Wizard session expired.",
          flags: 64,
        });
      state.notificationChannelId = interaction.values?.[0] || null;
      wizardState.set(interaction.user.id, interaction.guildId, state);
      await interaction.update({
        embeds: [buildWizardStepEmbed(WIZARD_STEPS.NOTIFICATION, state)],
        components: buildWizardNav(WIZARD_STEPS.NOTIFICATION),
      });
    },
  },

  // ── Dashboard quick-edit selects (save directly to DB) ────────────────────
  {
    customId: "sniper:dash:channels_select",
    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;
      const channelIds = interaction.values || [];
      await db.updateConfig(interaction.guildId, {
        challengeChannelIds: channelIds,
      });
      await interaction.update({
        content: `✅ Challenge channels updated: ${channelIds.map((id) => `<#${id}>`).join(", ")}`,
        components: [],
        embeds: [],
      });
    },
  },
  {
    customId: "sniper:dash:winner_role_select",
    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;
      const roleId = interaction.values?.[0];
      await db.updateConfig(interaction.guildId, { rewardRoleId: roleId });
      await interaction.update({
        content: `✅ Winner role updated to <@&${roleId}>`,
        components: [],
        embeds: [],
      });
    },
  },
  {
    customId: "sniper:dash:teaser_role_select",
    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;
      const roleId = interaction.values?.[0];
      await db.updateConfig(interaction.guildId, { teaserRoleId: roleId });
      await interaction.update({
        content: `✅ Teaser role updated to <@&${roleId}>`,
        components: [],
        embeds: [],
      });
    },
  },
  {
    customId: "sniper:dash:leaderboard_select",
    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;
      const channelId = interaction.values?.[0];
      await db.updateConfig(interaction.guildId, {
        leaderboardChannelId: channelId,
      });
      await interaction.update({
        content: `✅ Leaderboard channel updated to <#${channelId}>`,
        components: [],
        embeds: [],
      });
    },
  },
  {
    customId: "sniper:dash:notif_select",
    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;
      const channelId = interaction.values?.[0];
      await db.updateConfig(interaction.guildId, {
        notificationChannelId: channelId,
      });
      await interaction.update({
        content: `✅ Notification channel updated to <#${channelId}>`,
        components: [],
        embeds: [],
      });
    },
  },
];
