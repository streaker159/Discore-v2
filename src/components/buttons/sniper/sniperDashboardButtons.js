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
} = require("discord.js");

// ─── Dashboard button handler ───────────────────────────────────────────────────

module.exports = {
  customIdPrefix: "sniper:dash:",

  async execute(interaction, client) {
    // All dashboard buttons require admin
    if (!(await requireSniperAdmin(interaction))) return;

    const action = interaction.customId.replace("sniper:dash:", "");
    const guildId = interaction.guildId;

    switch (action) {
      case "setup": {
        // Clear any existing wizard state
        wizardState.del(interaction.user.id, guildId);

        // Init new wizard state
        wizardState.set(interaction.user.id, guildId, {
          step: 1,
          challengeChannelIds: [],
          rewardRoleId: null,
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

        const embed = buildWizardStepEmbed(WIZARD_STEPS.CHANNELS, {});
        const components = buildWizardNav(WIZARD_STEPS.CHANNELS, false, false);

        await interaction.update({ embeds: [embed], components });
        break;
      }

      case "pause": {
        const config = await getConfig(guildId);
        if (!config?.enabled) {
          await interaction.reply({
            content: "Sniper Challenge is not enabled.",
            flags: 64,
          });
          return;
        }

        if (config.paused) {
          await resumeChallenges(guildId, client);
        } else {
          await pauseChallenges(guildId);
        }

        // Refresh dashboard
        const freshConfig = await getConfig(guildId);
        const embed = buildDashboardEmbed(freshConfig, interaction.guild);
        const {
          buildAdminDashboardButtons,
        } = require("../../../commands/public/sniper/sniper");
        const components = buildAdminDashboardButtons(freshConfig);

        await interaction.update({ embeds: [embed], components });
        break;
      }

      case "force": {
        const result = await forceChallenge(guildId, client);

        if (!result.success) {
          let msg = "Failed to force challenge.";
          if (result.issues) {
            msg += `\nIssues:\n${result.issues.map((i) => `• ${i}`).join("\n")}`;
          }
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
        const config = await getConfig(guildId);
        const topText = await getLeaderboardText(guildId);

        const embed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("📊 Sniper Challenge Leaderboard")
          .setDescription(topText)
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
        const config = await getConfig(guildId);
        const embed = buildSettingsEmbed(config);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sniper:dash:edit_timing")
            .setLabel("Edit Timing")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("⏱️"),
          new ButtonBuilder()
            .setCustomId("sniper:dash:back_to_dash")
            .setLabel("Back to Dashboard")
            .setStyle(ButtonStyle.Secondary),
        );

        await interaction.update({ embeds: [embed], components: [row] });
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

      case "reset": {
        const config = await getConfig(guildId);
        const embed = buildResetEmbed(config);

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

        await interaction.update({
          embeds: [embed],
          components: [row, row2],
        });
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
          content:
            "✅ Sniper Challenge config has been completely removed. Use `/sniper` to set up again.",
        });
        break;
      }

      case "cancel_active": {
        const cancelled = await cancelActive(guildId);
        if (cancelled) {
          await interaction.reply({
            content: "✅ Active challenge cancelled.",
            flags: 64,
          });
        } else {
          await interaction.reply({
            content: "No active challenge to cancel.",
            flags: 64,
          });
        }
        break;
      }

      case "back_to_dash": {
        const config = await getConfig(guildId);
        const embed = buildDashboardEmbed(config, interaction.guild);
        const {
          buildAdminDashboardButtons,
        } = require("../../../commands/public/sniper/sniper");
        const components = buildAdminDashboardButtons(config);
        await interaction.update({ embeds: [embed], components });
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

// ─── Wizard navigation helpers ───────────────────────────────────────────────────

function buildWizardNav(step, canGoBack = true, canGoNext = true) {
  const { ChannelSelectMenuBuilder, ChannelType } = require("discord.js");
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
            .setStyle(ButtonStyle.Primary)
            .setDisabled(false),
          new ButtonBuilder()
            .setCustomId("sniper:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    }

    case WIZARD_STEPS.ROLE: {
      const { RoleSelectMenuBuilder } = require("discord.js");
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
            .setCustomId("sniper:wiz:back:2")
            .setLabel("Back")
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
            .setCustomId("sniper:wiz:back:5")
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
