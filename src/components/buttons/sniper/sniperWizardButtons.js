"use strict";

const {
  requireSniperAdmin,
} = require("../../../modules/sniper/sniperPermissions");
const wizardState = require("../../../modules/sniper/sniperWizardState");
const {
  buildWizardStepEmbed,
  WIZARD_STEPS,
} = require("../../../modules/sniper/sniperEmbeds");
const { buildWizardNav } = require("./sniperDashboardButtons");
const db = require("../../../modules/sniper/sniperDb");

module.exports = {
  customIdPrefix: "sniper:wiz:",

  async execute(interaction, client) {
    if (!(await requireSniperAdmin(interaction))) return;
    const customId = interaction.customId;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const state = wizardState.get(userId, guildId);

    if (customId === "sniper:wiz:cancel") {
      wizardState.del(userId, guildId);
      const {
        buildDashboardEmbed,
      } = require("../../../modules/sniper/sniperEmbeds");
      const { getConfig } = require("../../../modules/sniper/sniperService");
      const config = await getConfig(guildId);
      const embed = buildDashboardEmbed(
        config || { guildId },
        interaction.guild,
      );
      const {
        buildAdminDashboardButtons,
      } = require("../../../commands/public/sniper/sniper");
      return interaction.update({
        embeds: [embed],
        components: buildAdminDashboardButtons(config || {}),
      });
    }

    if (customId.startsWith("sniper:wiz:next:")) {
      const targetStep = parseInt(customId.split(":")[3]);
      if (!state || state.step + 1 !== targetStep)
        return interaction.reply({
          content: "Wizard session expired or out of sync. Please start again.",
          flags: 64,
        });
      state.step = targetStep;
      wizardState.set(userId, guildId, state);
      return interaction.update({
        embeds: [buildWizardStepEmbed(targetStep, state)],
        components: buildWizardNav(targetStep),
      });
    }

    if (customId.startsWith("sniper:wiz:back:")) {
      const targetStep = parseInt(customId.split(":")[3]);
      if (!state || state.step - 1 !== targetStep)
        return interaction.reply({
          content: "Wizard session expired. Please start again.",
          flags: 64,
        });
      state.step = targetStep;
      wizardState.set(userId, guildId, state);
      return interaction.update({
        embeds: [buildWizardStepEmbed(targetStep, state)],
        components: buildWizardNav(targetStep),
      });
    }

    if (customId === "sniper:wiz:edit_timing") {
      const {
        ModalBuilder,
        TextInputBuilder,
        TextInputStyle,
        ActionRowBuilder: ModalActionRow,
      } = require("discord.js");
      const { formatMs } = require("../../../modules/sniper/sniperEmbeds");
      const modal = new ModalBuilder()
        .setCustomId("sniper:wiz_timing_modal")
        .setTitle("⏱️ Sniper Challenge Timing");
      const minDelay = new TextInputBuilder()
        .setCustomId("min_delay")
        .setLabel("Minimum Random Delay")
        .setPlaceholder("e.g. 1h, 30m, 3m")
        .setStyle(TextInputStyle.Short)
        .setValue(formatMs(state?.minDelayMs ?? 3600000))
        .setRequired(true);
      const maxDelay = new TextInputBuilder()
        .setCustomId("max_delay")
        .setLabel("Maximum Random Delay")
        .setPlaceholder("e.g. 3h, 6h, 30m")
        .setStyle(TextInputStyle.Short)
        .setValue(formatMs(state?.maxDelayMs ?? 10800000))
        .setRequired(true);
      const activeDuration = new TextInputBuilder()
        .setCustomId("active_duration")
        .setLabel("Active Challenge Duration")
        .setPlaceholder("e.g. 3m, 5m, 1m")
        .setStyle(TextInputStyle.Short)
        .setValue(formatMs(state?.activeDurationMs ?? 180000))
        .setRequired(true);
      modal.addComponents(
        new ModalActionRow().addComponents(minDelay),
        new ModalActionRow().addComponents(maxDelay),
        new ModalActionRow().addComponents(activeDuration),
      );
      return interaction.showModal(modal);
    }

    if (customId === "sniper:wiz:skip_teaser") {
      if (!state)
        return interaction.reply({
          content: "Wizard session expired.",
          flags: 64,
        });
      state.teaserRoleId = null;
      state.step = WIZARD_STEPS.LEADERBOARD;
      wizardState.set(userId, guildId, state);
      return interaction.update({
        embeds: [buildWizardStepEmbed(WIZARD_STEPS.LEADERBOARD, state)],
        components: buildWizardNav(WIZARD_STEPS.LEADERBOARD),
      });
    }

    if (customId === "sniper:wiz:enable") {
      if (!state)
        return interaction.reply({
          content: "Wizard session expired. Please start again.",
          flags: 64,
        });
      const {
        validateSetup,
      } = require("../../../modules/sniper/sniperService");
      const issues = validateSetup({
        challengeChannelIds: state.challengeChannelIds || [],
        rewardRoleId: state.rewardRoleId,
        leaderboardChannelId: state.leaderboardChannelId,
        minDelayMs: state.minDelayMs ?? 3600000,
        maxDelayMs: state.maxDelayMs ?? 10800000,
        activeDurationMs: state.activeDurationMs ?? 180000,
      });
      if (
        issues.some(
          (i) =>
            i.includes("No challenge channels") || i.includes("No reward role"),
        )
      )
        return interaction.reply({
          content: `⚠️ Cannot enable:\n${issues.map((i) => `• ${i}`).join("\n")}`,
          flags: 64,
        });

      await db.upsertConfig(guildId, {
        enabled: true,
        paused: false,
        challengeChannelIds: state.challengeChannelIds || [],
        rewardRoleId: state.rewardRoleId,
        teaserRoleId: state.teaserRoleId || null,
        leaderboardChannelId: state.leaderboardChannelId,
        notificationChannelId: state.notificationChannelId || null,
        minDelayMs: state.minDelayMs ?? 3600000,
        maxDelayMs: state.maxDelayMs ?? 10800000,
        activeDurationMs: state.activeDurationMs ?? 180000,
      });
      const {
        randomDelay,
      } = require("../../../modules/sniper/sniperScheduler");
      await db.updateConfig(guildId, {
        nextRunAt: new Date(
          Date.now() +
            randomDelay(
              state.minDelayMs ?? 3600000,
              state.maxDelayMs ?? 10800000,
            ),
        ),
      });
      try {
        const {
          postLeaderboard,
        } = require("../../../modules/sniper/sniperLeaderboard");
        await postLeaderboard(guildId, client);
      } catch {}
      wizardState.del(userId, guildId);
      const {
        buildDashboardEmbed,
      } = require("../../../modules/sniper/sniperEmbeds");
      const { getConfig } = require("../../../modules/sniper/sniperService");
      const config = await getConfig(guildId);
      const {
        buildAdminDashboardButtons,
      } = require("../../../commands/public/sniper/sniper");
      return interaction.update({
        content: "✅ Sniper Challenge is now **ENABLED**!",
        embeds: [buildDashboardEmbed(config, interaction.guild)],
        components: buildAdminDashboardButtons(config),
      });
    }

    if (customId === "sniper:wiz:save_disabled") {
      if (!state)
        return interaction.reply({
          content: "Wizard session expired. Please start again.",
          flags: 64,
        });
      await db.upsertConfig(guildId, {
        enabled: false,
        challengeChannelIds: state.challengeChannelIds || [],
        rewardRoleId: state.rewardRoleId,
        teaserRoleId: state.teaserRoleId || null,
        leaderboardChannelId: state.leaderboardChannelId,
        notificationChannelId: state.notificationChannelId || null,
        minDelayMs: state.minDelayMs ?? 3600000,
        maxDelayMs: state.maxDelayMs ?? 10800000,
        activeDurationMs: state.activeDurationMs ?? 180000,
      });
      wizardState.del(userId, guildId);
      const {
        buildDashboardEmbed,
      } = require("../../../modules/sniper/sniperEmbeds");
      const { getConfig } = require("../../../modules/sniper/sniperService");
      const config = await getConfig(guildId);
      const {
        buildAdminDashboardButtons,
      } = require("../../../commands/public/sniper/sniper");
      return interaction.update({
        content: "💾 Setup saved (disabled). You can enable it anytime.",
        embeds: [buildDashboardEmbed(config, interaction.guild)],
        components: buildAdminDashboardButtons(config),
      });
    }

    return interaction.reply({ content: "Unknown wizard action.", flags: 64 });
  },
};
