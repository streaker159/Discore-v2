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
  approveApplication,
  denyApplication,
  refreshReviewCard,
  submitApplication,
  applyPendingRole,
} = require("../../../modules/onboarding/onboardingService");
const {
  buildSimpleEmbed,
  formatAppNumber,
} = require("../../../modules/onboarding/onboardingEmbeds");
const {
  requirePermission,
} = require("../../../modules/onboarding/onboardingPermissions");

module.exports = {
  customIdPrefix: "onboarding:modal:",

  async execute(interaction, client) {
    const customId = interaction.customId;
    const guildId = interaction.guildId;
    if (!guildId) return;

    // Parse: onboarding:modal:action:appId (or just action)
    const parts = customId.split(":");
    const action = parts[2];
    const targetId = parts[3];

    /** ── Create Application Type ── **/
    if (action === "createtype") {
      const name = interaction.fields.getTextInputValue("name");
      const publicTitle = interaction.fields.getTextInputValue("publicTitle");
      const publicDescription =
        interaction.fields.getTextInputValue("publicDescription") || null;
      const buttonLabel =
        interaction.fields.getTextInputValue("buttonLabel") || "Apply";
      const instructions =
        interaction.fields.getTextInputValue("instructions") || null;

      const newType = await db.createApplicationType({
        guildId,
        name,
        publicTitle,
        publicDescription,
        buttonLabel,
        instructions,
        sortOrder: 0,
      });

      if (newType) {
        await interaction.reply({
          embeds: [
            buildSimpleEmbed(
              "✅ Application Type Created",
              `**${publicTitle}** has been created.\n\nYou can now build its form using the Form Builder.`,
              "#57f287",
            ),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`onboarding:type:form:${newType.id}`)
                .setLabel("Build Form")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("📝"),
              new ButtonBuilder()
                .setCustomId("onboarding:dash:types")
                .setLabel("Back to Types")
                .setStyle(ButtonStyle.Secondary),
            ),
          ],
          flags: [MessageFlags.Ephemeral],
        });
      } else {
        await interaction.reply({
          content: "Failed to create application type. Please try again.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      return;
    }

    /** ── Approve Application ── **/
    if (action === "approve" && targetId) {
      const reason = interaction.fields.getTextInputValue("reason") || null;

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const result = await approveApplication(
        targetId,
        interaction.user.id,
        reason,
        client,
      );

      if (result.success) {
        let content = `✅ Application approved successfully.`;
        if (result.rolesApplied?.length) {
          content += `\nRoles applied: ${result.rolesApplied.length}`;
        }
        if (result.rolesFailed?.length) {
          content += `\n⚠️ Failed to apply roles: ${result.rolesFailed.length}`;
        }
        await interaction.editReply({ content });
      } else {
        await interaction.editReply({
          content: `❌ Failed to approve: ${result.error}`,
        });
      }
      return;
    }

    /** ── Deny Application ── **/
    if (action === "deny" && targetId) {
      const reason = interaction.fields.getTextInputValue("reason");

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const result = await denyApplication(
        targetId,
        interaction.user.id,
        reason,
        client,
      );

      if (result.success) {
        await interaction.editReply({
          content: `✅ Application denied.`,
        });
      } else {
        await interaction.editReply({
          content: `❌ Failed to deny: ${result.error}`,
        });
      }
      return;
    }

    /** ── Add Staff Note ── **/
    if (action === "note" && targetId) {
      const noteText = interaction.fields.getTextInputValue("noteText");

      await db.addStaffNote({
        applicationId: targetId,
        guildId,
        authorId: interaction.user.id,
        noteText,
      });

      await db.addDecisionLog({
        applicationId: targetId,
        guildId,
        action: "NOTE_ADDED",
        actorId: interaction.user.id,
        reason: noteText.slice(0, 200),
      });

      // Refresh review card
      await refreshReviewCard(targetId, client);

      await interaction.reply({
        content: "📝 Staff note added.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Request Changes ── **/
    if (action === "changes" && targetId) {
      const changes = interaction.fields.getTextInputValue("changes");
      const application = await db.getApplicationById(targetId);

      if (!application) {
        return interaction.reply({
          content: "Application not found.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      await db.updateApplication(targetId, { status: "NEEDS_CHANGES" });
      await db.addDecisionLog({
        applicationId: targetId,
        guildId,
        action: "CHANGES_REQUESTED",
        actorId: interaction.user.id,
        reason: changes,
      });

      // DM applicant
      try {
        const user = await client.users.fetch(application.applicantId);
        if (user) {
          await user
            .send({
              embeds: [
                {
                  title: "❓ Changes Requested",
                  description:
                    `Staff have requested changes to your application.\n\n` +
                    `**Request:** ${changes}\n\n` +
                    `Please contact staff or reapply if needed.`,
                  color: 0xfee75c,
                  footer: { text: interaction.guild?.name || "" },
                  timestamp: new Date().toISOString(),
                },
              ],
            })
            .catch(() => {});
        }
      } catch {}

      // Refresh review card
      await refreshReviewCard(targetId, client);

      await interaction.reply({
        content: "❓ Changes requested. Applicant has been notified.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Search Application ── **/
    if (action === "search") {
      const searchId = interaction.fields.getTextInputValue("searchId");
      const num = parseInt(String(searchId).replace("#", ""), 10);

      if (isNaN(num) || num < 1) {
        return interaction.reply({
          content:
            "Invalid application ID. Please enter a number (e.g., 1, 0001, #0001).",
          flags: [MessageFlags.Ephemeral],
        });
      }

      const app = await db.getApplicationByNumber(guildId, num);
      if (!app) {
        return interaction.reply({
          content: `No application found with ID #${String(num).padStart(4, "0")}.`,
          flags: [MessageFlags.Ephemeral],
        });
      }

      const appType = app.applicationTypeId
        ? await db.getApplicationType(app.applicationTypeId)
        : null;
      const answers = await db.getAnswers(app.id);
      const notes = await db.getStaffNotes(app.id);
      const logs = await db.getDecisionLogs(app.id);

      const {
        buildReviewCardEmbed,
      } = require("../../../modules/onboarding/onboardingEmbeds");
      const embed = buildReviewCardEmbed(
        app,
        appType,
        answers,
        notes,
        interaction.guild,
      );

      const {
        buildReviewCardButtons,
      } = require("../../../modules/onboarding/onboardingService");
      const components = buildReviewCardButtons(app);

      await interaction.reply({
        embeds: [embed],
        components,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
  },
};
