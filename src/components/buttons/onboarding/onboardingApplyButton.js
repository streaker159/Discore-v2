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

/**
 * Send (or re-send) the "Application Started" DM for an existing session.
 * Kept as a standalone helper so both the initial Apply click and the
 * "Try Again" button (fired from a DM-failure follow-up in the guild) can
 * reuse the exact same logic instead of faking an Interaction object.
 */
async function sendSessionStartDm(user, session, appType, guildName) {
  try {
    const dmEmbed = new EmbedBuilder()
      .setTitle("🛡️ Application Started")
      .setDescription(
        `You are applying for: **${appType.publicTitle || appType.name}**\n\n` +
          `Your answers will be sent to staff for review.\nYou can cancel before submitting.`,
      )
      .setColor(appType.themeColor || "#5865F2")
      .setFooter({ text: guildName || "Application System" })
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
            .setCustomId(`onboarding:dm:start:${session.id}`)
            .setLabel("Start Application")
            .setStyle(ButtonStyle.Success)
            .setEmoji("▶️"),
          new ButtonBuilder()
            .setCustomId(`onboarding:dm:cancel:${session.id}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌"),
        ),
      ],
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  customIdPrefix: "onboarding:apply:",
  sendSessionStartDm,

  async execute(interaction, client) {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const parts = interaction.customId.split(":");
    const appTypeId = parts[2];

    if (!appTypeId) return;

    // 1. Premium check
    const premiumActive = await isOnboardingPremiumActive(guildId);
    if (!premiumActive) {
      return interaction.reply({
        content:
          "🔒 Applications are currently unavailable because Premium has expired for this server.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // 2. Onboarding enabled check
    const config = await db.getConfig(guildId);
    if (!config?.enabled) {
      return interaction.reply({
        content:
          "Applications are currently disabled on this server. Please contact staff.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // 3. Application type exists/enabled check
    const appType = await db.getApplicationType(appTypeId);
    if (!appType || !appType.enabled || appType.guildId !== guildId) {
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

    // Block if the user already has a PENDING/NEEDS_CHANGES application of this type
    const existingApps = await db.getApplicationsByUser(
      guildId,
      interaction.user.id,
    );
    const activeApp = existingApps.find(
      (a) =>
        a.applicationTypeId === appTypeId &&
        (a.status === "PENDING" || a.status === "NEEDS_CHANGES"),
    );
    if (activeApp) {
      return interaction.reply({
        content:
          `You already have an active **${appType.publicTitle || appType.name}** application ` +
          `(#${String(activeApp.applicationNumber).padStart(4, "0")}).\nStaff are reviewing it. Please wait for a decision.`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    // Offer to continue/cancel an existing in-progress DM draft session
    const existingSession = await db.getSession(
      guildId,
      interaction.user.id,
      appTypeId,
    );
    if (existingSession) {
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

    // Bot permission check: can we even DM the user? (no proactive Discord
    // permission for this — only discoverable by attempting the send below.)

    // Start the application flow
    await interaction.reply({
      content: `✅ **${appType.publicTitle || appType.name}** application started.\nCheck your DMs to complete the application.`,
      flags: [MessageFlags.Ephemeral],
    });

    // DM the user
    try {
      const user = await client.users.fetch(interaction.user.id);

      if (config?.allowDmFlow !== false) {
        const expiryHours = config?.draftExpiryHours || 72;
        const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

        const sessionId = await db.createSession({
          guildId,
          applicationTypeId: appTypeId,
          applicantId: interaction.user.id,
          currentPage: 0,
          stateJson: { answers: [] },
          expiresAt,
        });

        if (!sessionId) {
          return interaction.followUp({
            content:
              "Failed to start your application session. Please try again.",
            flags: [MessageFlags.Ephemeral],
          });
        }

        const result = await sendSessionStartDm(
          user,
          { id: sessionId },
          appType,
          interaction.guild?.name,
        );

        if (!result.success) {
          return interaction.followUp({
            content:
              "I couldn't DM you. Please enable DMs from server members, then press **Try Again**.",
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`onboarding:dm:tryagain:${sessionId}`)
                  .setLabel("Try Again")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId(`onboarding:dm:cancel:${sessionId}`)
                  .setLabel("Cancel")
                  .setStyle(ButtonStyle.Secondary),
              ),
            ],
            flags: [MessageFlags.Ephemeral],
          });
        }
      } else if (config?.allowThreadFallback) {
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
    } catch (e) {
      // DM failed entirely (couldn't even fetch/send to the user)
      return interaction
        .followUp({
          content:
            "I couldn't DM you. Please enable DMs from server members, then use the panel to apply again.",
          flags: [MessageFlags.Ephemeral],
        })
        .catch(() => {});
    }
  },
};
