"use strict";

const {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const db = require("../../../modules/onboarding/onboardingDb");
const {
  isOnboardingPremiumActive,
} = require("../../../modules/onboarding/onboardingPremium");

module.exports = {
  customIdPrefix: "onboarding:apply:",

  async execute(interaction, client) {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const parts = interaction.customId.split(":");
    const appTypeId = parts[2];

    if (!appTypeId) return;

    // Premium check
    const premiumActive = await isOnboardingPremiumActive(guildId);
    if (!premiumActive) {
      return interaction.reply({
        content:
          "🔒 Applications are currently unavailable because Premium has expired for this server.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // Get config
    const config = await db.getConfig(guildId);
    if (!config?.enabled) {
      return interaction.reply({
        content:
          "Applications are currently disabled on this server. Please contact staff.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // Get application type
    const appType = await db.getApplicationType(appTypeId);
    if (!appType || !appType.enabled) {
      return interaction.reply({
        content:
          "That application is no longer available. Please check the panel for current options.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // Check user is still in server
    const member = interaction.member;
    if (!member) {
      return interaction.reply({
        content: "You must be a member of this server to apply.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // Check for existing draft/submission
    const existingSession = await db.getSession(
      guildId,
      interaction.user.id,
      appTypeId,
    );
    if (existingSession?.applicationId) {
      const existingApp = await db.getApplicationById(
        existingSession.applicationId,
      );
      if (existingApp && existingApp.status === "PENDING") {
        return interaction.reply({
          content: `You already have a pending **${appType.publicTitle || appType.name}** application.\nStaff are reviewing it. Please wait for a decision.`,
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (existingApp && existingApp.status === "DRAFT") {
        // Offer continue or cancel
        return interaction.reply({
          content: `You have an existing draft for **${appType.publicTitle || appType.name}**.\nWould you like to continue or start fresh?`,
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`onboarding:dm:continue:${existingSession.id}`)
                .setLabel("Continue Draft")
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`onboarding:dm:cancel:${existingSession.id}`)
                .setLabel("Cancel & Start Fresh")
                .setStyle(ButtonStyle.Secondary),
            ),
          ],
          flags: [MessageFlags.Ephemeral],
        });
      }
    }

    // Start the application flow
    await interaction.reply({
      content: `✅ **${appType.publicTitle || appType.name}** application started.\nCheck your DMs to complete the application.`,
      flags: [MessageFlags.Ephemeral],
    });

    // DM the user
    try {
      const user = await client.users.fetch(interaction.user.id);

      if (config?.allowDmFlow !== false) {
        // Create session
        const expiryHours = config?.draftExpiryHours || 72;
        const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

        await db.createSession({
          guildId,
          applicationTypeId: appTypeId,
          applicantId: interaction.user.id,
          currentPage: 0,
          stateJson: { answers: [] },
          expiresAt,
        });

        const dmEmbed = new EmbedBuilder()
          .setTitle("🛡️ Application Started")
          .setDescription(
            `You are applying for: **${appType.publicTitle || appType.name}**\n\n` +
              `Your answers will be sent to staff for review.\nYou can cancel before submitting.`,
          )
          .setColor(appType.themeColor || "#5865F2")
          .setFooter({ text: interaction.guild?.name || "Application System" })
          .setTimestamp();

        if (appType.instructions) {
          dmEmbed.addFields({
            name: "📋 Instructions",
            value: appType.instructions,
          });
        }

        await user.send({
          embeds: [dmEmbed],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`onboarding:dm:start:${appTypeId}`)
                .setLabel("Start Application")
                .setStyle(ButtonStyle.Success)
                .setEmoji("▶️"),
              new ButtonBuilder()
                .setCustomId(`onboarding:dm:cancelapp:${appTypeId}`)
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("❌"),
            ),
          ],
        });
      } else {
        // Use thread fallback (if configured)
        if (config?.allowThreadFallback) {
          // Create private thread instead
          // Simplified fallback
          await user.send({
            content:
              `**${appType.publicTitle || appType.name}**\n\n` +
              (appType.instructions || "Please complete your application.") +
              "\n\n_This application type is configured to use server threads instead of DMs._",
          });
        } else {
          await user.send({
            content:
              `**${appType.publicTitle || appType.name}**\n\n` +
              "Applications are currently only available via DM.\nPlease enable DMs from server members.",
          });
        }
      }
    } catch (e) {
      // DM failed
      return interaction.followUp({
        content:
          "I couldn't DM you. Please enable DMs from server members, then press **Try Again**.",
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`onboarding:dm:tryagain:${appTypeId}`)
              .setLabel("Try Again")
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId("onboarding:dm:cancelapp:none")
              .setLabel("Cancel")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};
