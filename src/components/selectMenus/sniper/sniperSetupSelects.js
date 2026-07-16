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

module.exports = [
  // ── Challenge channels select ───────────────────────────────────────────
  {
    customId: "sniper:wiz:channels_select",

    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;

      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const state = wizardState.get(userId, guildId);

      if (!state) {
        return interaction.reply({
          content: "Wizard session expired. Please start again.",
          flags: 64,
        });
      }

      const channelIds = interaction.values || [];
      if (channelIds.length > 5) {
        return interaction.reply({
          content: "Maximum 5 challenge channels allowed.",
          flags: 64,
        });
      }

      state.challengeChannelIds = channelIds;
      wizardState.set(userId, guildId, state);

      const embed = buildWizardStepEmbed(WIZARD_STEPS.CHANNELS, state);
      const components = buildWizardNav(WIZARD_STEPS.CHANNELS);

      await interaction.update({ embeds: [embed], components });
    },
  },

  // ── Leaderboard channel select ──────────────────────────────────────────
  {
    customId: "sniper:wiz:leaderboard_select",

    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;

      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const state = wizardState.get(userId, guildId);

      if (!state) {
        return interaction.reply({
          content: "Wizard session expired. Please start again.",
          flags: 64,
        });
      }

      state.leaderboardChannelId = interaction.values?.[0] || null;
      wizardState.set(userId, guildId, state);

      const embed = buildWizardStepEmbed(WIZARD_STEPS.LEADERBOARD, state);
      const components = buildWizardNav(WIZARD_STEPS.LEADERBOARD);

      await interaction.update({ embeds: [embed], components });
    },
  },

  // ── Notification channel select ─────────────────────────────────────────
  {
    customId: "sniper:wiz:notif_select",

    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;

      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const state = wizardState.get(userId, guildId);

      if (!state) {
        return interaction.reply({
          content: "Wizard session expired. Please start again.",
          flags: 64,
        });
      }

      state.notificationChannelId = interaction.values?.[0] || null;
      wizardState.set(userId, guildId, state);

      const embed = buildWizardStepEmbed(WIZARD_STEPS.NOTIFICATION, state);
      const components = buildWizardNav(WIZARD_STEPS.NOTIFICATION);

      await interaction.update({ embeds: [embed], components });
    },
  },

  // ── Role select ─────────────────────────────────────────────────────────
  {
    customId: "sniper:wiz:role_select",

    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;

      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const state = wizardState.get(userId, guildId);

      if (!state) {
        return interaction.reply({
          content: "Wizard session expired. Please start again.",
          flags: 64,
        });
      }

      const roleId = interaction.values?.[0];
      if (!roleId) {
        return interaction.reply({
          content: "Please select a valid role.",
          flags: 64,
        });
      }

      // Reject @everyone
      if (roleId === guildId) {
        return interaction.reply({
          content: "You cannot select the @everyone role.",
          flags: 64,
        });
      }

      // Check bot's role hierarchy
      const guild = interaction.guild;
      const role = guild.roles.cache.get(roleId);
      if (role) {
        const botMember = guild.members.me;
        if (botMember.roles.highest.position <= role.position) {
          await interaction.reply({
            content:
              "⚠️ The bot's highest role must be **above** the reward role to manage it. Please move the bot's role higher or choose a lower role.",
            flags: 64,
          });
          // Still save it, but warn
        }

        if (role.managed) {
          return interaction.reply({
            content:
              "⚠️ That role is managed by an integration and cannot be assigned by the bot.",
            flags: 64,
          });
        }
      }

      state.rewardRoleId = roleId;
      wizardState.set(userId, guildId, state);

      const embed = buildWizardStepEmbed(WIZARD_STEPS.ROLE, state);
      const components = buildWizardNav(WIZARD_STEPS.ROLE);

      await interaction.update({ embeds: [embed], components });
    },
  },
];
