"use strict";

const {
  requireSniperAdmin,
} = require("../../../modules/sniper/sniperPermissions");
const {
  getConfig,
  pauseChallenges,
  resumeChallenges,
  forceChallenge,
  resetStats,
  clearChampion,
  deleteConfig,
  cancelActive,
} = require("../../../modules/sniper/sniperService");
const {
  buildDashboardEmbed,
  buildSettingsEmbed,
  buildResetEmbed,
} = require("../../../modules/sniper/sniperEmbeds");
const {
  getLeaderboardText,
  postLeaderboard,
} = require("../../../modules/sniper/sniperLeaderboard");
const wizardState = require("../../../modules/sniper/sniperWizardState");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
} = require("discord.js");

module.exports = {
  customIdPrefix: "sniper:dash:",

  async execute(interaction, client) {
    if (!(await requireSniperAdmin(interaction))) return;
    const action = interaction.customId.replace("sniper:dash:", "");
    const guildId = interaction.guildId;

    switch (action) {
      case "setup": {
        wizardState.del(interaction.user.id, guildId);
        wizardState.set(interaction.user.id, guildId, {
          step: 1,
          challengeChannelIds: [],
          rewardRoleId: null,
          teaserRoleId: null,
          leaderboardChannelId: null,
          notificationChannelId: null,
          minDelayMs: 3600000,
          maxDelayMs: 10800000,
          activeDurationMs: 180000,
        });
        const {
          buildWizardStepEmbed,
          WIZARD_STEPS,
        } = require("../../../modules/sniper/sniperEmbeds");
        await interaction.update({
          embeds: [buildWizardStepEmbed(WIZARD_STEPS.CHANNELS, {})],
          components: buildWizardNav(WIZARD_STEPS.CHANNELS),
        });
        break;
      }
      case "pause": {
        const config = await getConfig(guildId);
        if (!config?.enabled)
          return interaction.reply({
            content: "Sniper Challenge is not enabled.",
            flags: 64,
          });
        config.paused
          ? await resumeChallenges(guildId, client)
          : await pauseChallenges(guildId);
        const freshConfig = await getConfig(guildId);
        const {
          buildAdminDashboardButtons,
        } = require("../../../commands/public/sniper/sniper");
        await interaction.update({
          embeds: [buildDashboardEmbed(freshConfig, interaction.guild)],
          components: buildAdminDashboardButtons(freshConfig),
        });
        break;
      }
      case "force": {
        const result = await forceChallenge(guildId, client);
        if (!result.success) {
          let msg = "Failed to force challenge.";
          if (result.issues)
            msg += `\nIssues:\n${result.issues.map((i) => `• ${i}`).join("\n")}`;
          await interaction.reply({ content: msg, flags: 64 });
        } else {
          await interaction.reply({
            content: "⚡ Challenge spawned! Check the challenge channel.",
            flags: 64,
          });
        }
        break;
      }
      case "leaderboard": {
        const embed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("📊 Sniper Challenge Leaderboard")
          .setDescription(await getLeaderboardText(guildId))
          .setFooter({ text: "Sniper Challenge • Discore" })
          .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:dash:repair_leaderboard")
            .setLabel("Post / Repair Leaderboard")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📊"),
          new ButtonBuilder()
            .setCustomId("sniper:dash:back_to_dash")
            .setLabel("Back to Dashboard")
            .setStyle(ButtonStyle.Secondary),
        );
        await interaction.update({ embeds: [embed], components: [row] });
        break;
      }
      case "repair_leaderboard": {
        await interaction.deferReply({ flags: 64 });
        await postLeaderboard(guildId, client);
        await interaction.editReply({
          content: "✅ Leaderboard has been posted/updated!",
        });
        break;
      }
      case "settings": {
        const embed = buildSettingsEmbed(await getConfig(guildId));
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:dash:edit_timing")
            .setLabel("Edit Timing")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("⏱️"),
          new ButtonBuilder()
            .setCustomId("sniper:dash:build_lb")
            .setLabel("Rebuild Leaderboard")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📊"),
        );
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:dash:edit_channels")
            .setLabel("Edit Channels")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📢"),
          new ButtonBuilder()
            .setCustomId("sniper:dash:edit_winner_role")
            .setLabel("Edit Winner Role")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🏅"),
        );
        const row3 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:dash:edit_teaser_role")
            .setLabel("Edit Teaser Role")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📢"),
          new ButtonBuilder()
            .setCustomId("sniper:dash:edit_leaderboard")
            .setLabel("Edit Leaderboard Chan")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📊"),
        );
        const row4 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:dash:edit_notif")
            .setLabel("Edit Notification Chan")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🔔"),
          new ButtonBuilder()
            .setCustomId("sniper:dash:back_to_dash")
            .setLabel("Back")
            .setStyle(ButtonStyle.Danger),
        );
        await interaction.update({
          embeds: [embed],
          components: [row1, row2, row3, row4],
        });
        break;
      }
      case "edit_timing": {
        const {
          ModalBuilder,
          TextInputBuilder,
          TextInputStyle,
          ActionRowBuilder: ModalActionRow,
        } = require("discord.js");
        const config = await getConfig(guildId);
        const { formatMs } = require("../../../modules/sniper/sniperEmbeds");
        const modal = new ModalBuilder()
          .setCustomId("sniper:timing_modal")
          .setTitle("⏱️ Sniper Challenge Timing");
        const minDelay = new TextInputBuilder()
          .setCustomId("min_delay")
          .setLabel("Minimum Random Delay")
          .setPlaceholder("e.g. 1h, 30m, 3m")
          .setStyle(TextInputStyle.Short)
          .setValue(formatMs(config?.minDelayMs ?? 3600000))
          .setRequired(true);
        const maxDelay = new TextInputBuilder()
          .setCustomId("max_delay")
          .setLabel("Maximum Random Delay")
          .setPlaceholder("e.g. 3h, 6h, 30m")
          .setStyle(TextInputStyle.Short)
          .setValue(formatMs(config?.maxDelayMs ?? 10800000))
          .setRequired(true);
        const activeDuration = new TextInputBuilder()
          .setCustomId("active_duration")
          .setLabel("Active Challenge Duration")
          .setPlaceholder("e.g. 3m, 5m, 1m")
          .setStyle(TextInputStyle.Short)
          .setValue(formatMs(config?.activeDurationMs ?? 180000))
          .setRequired(true);
        modal.addComponents(
          new ModalActionRow().addComponents(minDelay),
          new ModalActionRow().addComponents(maxDelay),
          new ModalActionRow().addComponents(activeDuration),
        );
        await interaction.showModal(modal);
        break;
      }
      case "build_lb": {
        await interaction.deferReply({ flags: 64 });
        await postLeaderboard(guildId, client);
        await interaction.editReply({
          content: "✅ Leaderboard has been rebuilt and posted!",
        });
        break;
      }
      // ── Quick-edit selects ──────────────────────────────────────────────
      case "edit_channels": {
        const select = new ChannelSelectMenuBuilder()
          .setCustomId("sniper:dash:channels_select")
          .setPlaceholder("Select challenge channels...")
          .setMinValues(1)
          .setMaxValues(5)
          .setChannelTypes([
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
          ]);
        await interaction.reply({
          content: "Select up to 5 challenge channels:",
          components: [new ActionRowBuilder().addComponents(select)],
          flags: 64,
        });
        break;
      }
      case "edit_winner_role": {
        const select = new RoleSelectMenuBuilder()
          .setCustomId("sniper:dash:winner_role_select")
          .setPlaceholder("Select winner role...")
          .setMinValues(1)
          .setMaxValues(1);
        await interaction.reply({
          content: "Select the champion winner role:",
          components: [new ActionRowBuilder().addComponents(select)],
          flags: 64,
        });
        break;
      }
      case "edit_teaser_role": {
        const select = new RoleSelectMenuBuilder()
          .setCustomId("sniper:dash:teaser_role_select")
          .setPlaceholder("Select teaser role...")
          .setMinValues(1)
          .setMaxValues(1);
        await interaction.reply({
          content: "Select the teaser ping role:",
          components: [new ActionRowBuilder().addComponents(select)],
          flags: 64,
        });
        break;
      }
      case "edit_leaderboard": {
        const select = new ChannelSelectMenuBuilder()
          .setCustomId("sniper:dash:leaderboard_select")
          .setPlaceholder("Select leaderboard channel...")
          .setMinValues(1)
          .setMaxValues(1)
          .setChannelTypes([
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
          ]);
        await interaction.reply({
          content: "Select the leaderboard channel:",
          components: [new ActionRowBuilder().addComponents(select)],
          flags: 64,
        });
        break;
      }
      case "edit_notif": {
        const select = new ChannelSelectMenuBuilder()
          .setCustomId("sniper:dash:notif_select")
          .setPlaceholder("Select notification channel...")
          .setMinValues(1)
          .setMaxValues(1)
          .setChannelTypes([
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
          ]);
        await interaction.reply({
          content: "Select the notification channel:",
          components: [new ActionRowBuilder().addComponents(select)],
          flags: 64,
        });
        break;
      }
      case "reset": {
        const embed = buildResetEmbed(await getConfig(guildId));
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:dash:reset_stats")
            .setLabel("Reset Stats")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🔄"),
          new ButtonBuilder()
            .setCustomId("sniper:dash:clear_champion")
            .setLabel("Clear Champion")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("👑"),
          new ButtonBuilder()
            .setCustomId("sniper:dash:delete_config")
            .setLabel("Delete Config")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🗑️"),
        );
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:dash:cancel_active")
            .setLabel("Cancel Active Challenge")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🚫"),
          new ButtonBuilder()
            .setCustomId("sniper:dash:back_to_dash")
            .setLabel("Back to Dashboard")
            .setStyle(ButtonStyle.Secondary),
        );
        await interaction.update({ embeds: [embed], components: [row, row2] });
        break;
      }
      case "reset_stats": {
        await interaction.deferReply({ flags: 64 });
        await resetStats(guildId);
        await interaction.editReply({
          content: "✅ All sniper challenge stats have been reset.",
        });
        break;
      }
      case "clear_champion": {
        await interaction.deferReply({ flags: 64 });
        await clearChampion(guildId, client);
        await interaction.editReply({
          content: "✅ Current champion has been cleared.",
        });
        break;
      }
      case "delete_config": {
        await interaction.deferReply({ flags: 64 });
        await deleteConfig(guildId);
        await interaction.editReply({
          content: "✅ Sniper Challenge config has been completely removed.",
        });
        break;
      }
      case "cancel_active": {
        const cancelled = await cancelActive(guildId);
        await interaction.reply({
          content: cancelled
            ? "✅ Active challenge cancelled."
            : "No active challenge to cancel.",
          flags: 64,
        });
        break;
      }
      case "back_to_dash": {
        const config = await getConfig(guildId);
        const {
          buildAdminDashboardButtons,
        } = require("../../../commands/public/sniper/sniper");
        await interaction.update({
          embeds: [buildDashboardEmbed(config, interaction.guild)],
          components: buildAdminDashboardButtons(config),
        });
        break;
      }
      case "close": {
        await interaction
          .update({
            content: "Sniper Challenge dashboard closed.",
            embeds: [],
            components: [],
          })
          .catch(() => {});
        break;
      }
      default: {
        await interaction.reply({
          content: "Unknown dashboard action.",
          flags: 64,
        });
      }
    }
  },
};

// ─── Wizard navigation helpers (7-step: CHANNELS→ROLE→TEASER→LEADERBOARD→NOTIFICATION→TIMING→PREVIEW) ───

function buildWizardNav(step) {
  const { WIZARD_STEPS } = require("../../../modules/sniper/sniperEmbeds");
  const rows = [];

  switch (step) {
    case WIZARD_STEPS.CHANNELS: {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId("sniper:wiz:channels_select")
        .setPlaceholder("Select challenge channels (max 5)...")
        .setMinValues(1)
        .setMaxValues(5)
        .setChannelTypes([
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
        ]);
      rows.push(new ActionRowBuilder().addComponents(channelSelect));
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:wiz:next:2")
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("sniper:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    }
    case WIZARD_STEPS.ROLE: {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId("sniper:wiz:role_select")
        .setPlaceholder("Select winner role...")
        .setMinValues(1)
        .setMaxValues(1);
      rows.push(new ActionRowBuilder().addComponents(roleSelect));
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:wiz:back:1")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("sniper:wiz:next:3")
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("sniper:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    }
    case WIZARD_STEPS.TEASER: {
      const teaserSelect = new RoleSelectMenuBuilder()
        .setCustomId("sniper:wiz:teaser_select")
        .setPlaceholder("Select teaser role (optional)...")
        .setMinValues(1)
        .setMaxValues(1);
      rows.push(new ActionRowBuilder().addComponents(teaserSelect));
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:wiz:back:2")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("sniper:wiz:skip_teaser")
            .setLabel("Skip")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("sniper:wiz:next:4")
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("sniper:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    }
    case WIZARD_STEPS.LEADERBOARD: {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId("sniper:wiz:leaderboard_select")
        .setPlaceholder("Select leaderboard channel...")
        .setMinValues(1)
        .setMaxValues(1)
        .setChannelTypes([
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
        ]);
      rows.push(new ActionRowBuilder().addComponents(channelSelect));
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:wiz:back:3")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("sniper:wiz:next:5")
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("sniper:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    }
    case WIZARD_STEPS.NOTIFICATION: {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId("sniper:wiz:notif_select")
        .setPlaceholder("Select notification channel...")
        .setMinValues(1)
        .setMaxValues(1)
        .setChannelTypes([
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
        ]);
      rows.push(new ActionRowBuilder().addComponents(channelSelect));
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:wiz:back:4")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("sniper:wiz:next:6")
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("sniper:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    }
    case WIZARD_STEPS.TIMING: {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:wiz:edit_timing")
            .setLabel("Edit Timing")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("⏱️"),
        ),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:wiz:back:5")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("sniper:wiz:next:7")
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("sniper:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    }
    case WIZARD_STEPS.PREVIEW: {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:wiz:enable")
            .setLabel("Enable Sniper Challenge")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅"),
          new ButtonBuilder()
            .setCustomId("sniper:wiz:save_disabled")
            .setLabel("Save Disabled")
            .setStyle(ButtonStyle.Secondary),
        ),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:wiz:back:6")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("sniper:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    }
  }
  return rows.filter((r) => r.components?.length);
}

module.exports.buildWizardNav = buildWizardNav;
