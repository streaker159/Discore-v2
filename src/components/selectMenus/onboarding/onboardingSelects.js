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
  buildSimpleEmbed,
  formatAppNumber,
} = require("../../../modules/onboarding/onboardingEmbeds");

module.exports = {
  customIdPrefix: "onboarding:select:",

  async execute(interaction, client) {
    const customId = interaction.customId;
    const guildId = interaction.guildId;
    if (!guildId) return;

    const parts = customId.split(":");
    const action = parts[2]; // panelchannel, reviewchannel, userapp, permrole, removeperm

    /** ── Panel Channel Select ── **/
    if (action === "panelchannel") {
      if (!interaction.isChannelSelectMenu()) return;
      const channelId = interaction.values?.[0];
      if (!channelId) return;

      await db.updateConfig(guildId, { panelChannelId: channelId });

      await interaction.reply({
        content: `✅ Panel channel set to <#${channelId}>. Use **Publish Panel** to post the application panel.`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Review Channel Select ── **/
    if (action === "reviewchannel") {
      if (!interaction.isChannelSelectMenu()) return;
      const channelId = interaction.values?.[0];
      if (!channelId) return;

      await db.updateConfig(guildId, { defaultReviewChannelId: channelId });

      await interaction.reply({
        content: `✅ Review channel set to <#${channelId}>.`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── User Application History ── **/
    if (action === "userapp") {
      if (!interaction.isUserSelectMenu()) return;
      const userId = interaction.values?.[0];
      if (!userId) return;

      const apps = await db.getApplicationsByUser(guildId, userId);

      if (!apps.length) {
        return interaction.reply({
          content: `No application history found for <@${userId}>.`,
          flags: [MessageFlags.Ephemeral],
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📋 Application History for <@${userId}>`)
        .setColor("#5865F2");

      for (const app of apps.slice(0, 10)) {
        const appType = app.applicationTypeId
          ? await db.getApplicationType(app.applicationTypeId)
          : null;

        embed.addFields({
          name: `#${formatAppNumber(app.applicationNumber)} — ${appType?.publicTitle || "Unknown"}`,
          value: `Status: ${app.status}\nSubmitted: ${app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : "Draft"}\nView: Use Search by ID #${app.applicationNumber}`,
          inline: true,
        });
      }

      await interaction.reply({
        embeds: [embed],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Permission Role Select ── **/
    if (action === "permrole") {
      if (!interaction.isRoleSelectMenu()) return;
      const roleId = interaction.values?.[0];
      if (!roleId) return;

      // Add with default permissions (review + approve)
      await db.setPermissionRole({
        guildId,
        roleId,
        canManage: false,
        canBuildForms: false,
        canReview: true,
        canApproveDeny: true,
        canOpenThreads: true,
        canDownload: true,
        canDelete: false,
      });

      await interaction.reply({
        embeds: [
          buildSimpleEmbed(
            "✅ Permission Role Added",
            `<@&${roleId}> has been added as an onboarding role with default permissions:\n` +
              `✅ Review applications\n✅ Approve/Deny\n✅ Open threads\n✅ Download\n\n` +
              `Use the Permissions panel to adjust these settings.`,
            "#57f287",
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Remove Permission Role ── **/
    if (action === "removeperm") {
      if (!interaction.isStringSelectMenu()) return;
      const roleId = interaction.values?.[0];
      if (!roleId) return;

      await db.deletePermissionRole(guildId, roleId);

      await interaction.reply({
        content: `✅ Role <@&${roleId}> has been removed from onboarding permissions.`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
  },
};
