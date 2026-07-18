"use strict";

const {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ChannelType,
  ThreadAutoArchiveDuration,
} = require("discord.js");
const db = require("../../../modules/onboarding/onboardingDb");
const {
  approveApplication,
  denyApplication,
  refreshReviewCard,
} = require("../../../modules/onboarding/onboardingService");
const {
  requirePermission,
} = require("../../../modules/onboarding/onboardingPermissions");
const {
  buildFullViewEmbed,
  buildSimpleEmbed,
  formatAppNumber,
} = require("../../../modules/onboarding/onboardingEmbeds");
const {
  generateApplicationReceipt,
  generateThreadTranscript,
} = require("../../../modules/onboarding/onboardingReceipts");

module.exports = {
  customIdPrefix: "onboarding:review:",

  async execute(interaction, client) {
    const customId = interaction.customId;
    const guildId = interaction.guildId;
    if (!guildId) return;

    // Parse: onboarding:review:action:appId
    const parts = customId.split(":");
    const action = parts[2];
    const appId = parts[3];

    if (!appId) return;

    const application = await db.getApplicationById(appId);
    if (!application) {
      return interaction.reply({
        content: "Application not found. It may have been deleted.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    /** ── Approve ── **/
    if (action === "approve") {
      const canApprove = await requirePermission(interaction, "canApproveDeny");
      if (!canApprove) return;

      // Show confirmation modal
      const modal = new ModalBuilder()
        .setCustomId(`onboarding:modal:approve:${appId}`)
        .setTitle("Approve Application");

      const reasonInput = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Approval Note (optional)")
        .setPlaceholder("Welcome aboard! / Approved after review.")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500);

      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      await interaction.showModal(modal);
      return;
    }

    /** ── Deny ── **/
    if (action === "deny") {
      const canDeny = await requirePermission(interaction, "canApproveDeny");
      if (!canDeny) return;

      const modal = new ModalBuilder()
        .setCustomId(`onboarding:modal:deny:${appId}`)
        .setTitle("Deny Application");

      const reasonInput = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Denial Reason")
        .setPlaceholder("Application does not meet requirements.")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500);

      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      await interaction.showModal(modal);
      return;
    }

    /** ── Add Note ── **/
    if (action === "note") {
      const canReview = await requirePermission(interaction, "canReview");
      if (!canReview) return;

      const modal = new ModalBuilder()
        .setCustomId(`onboarding:modal:note:${appId}`)
        .setTitle("Add Staff Note");

      const noteInput = new TextInputBuilder()
        .setCustomId("noteText")
        .setLabel("Note Text")
        .setPlaceholder("Internal staff note...")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

      modal.addComponents(new ActionRowBuilder().addComponents(noteInput));
      await interaction.showModal(modal);
      return;
    }

    /** ── View Full ── **/
    if (action === "view") {
      const canReview = await requirePermission(interaction, "canReview");
      if (!canReview) return;

      const appType = application.applicationTypeId
        ? await db.getApplicationType(application.applicationTypeId)
        : null;
      const answers = await db.getAnswers(appId);
      const notes = await db.getStaffNotes(appId);
      const logs = await db.getDecisionLogs(appId);

      const embed = buildFullViewEmbed(
        application,
        appType,
        answers,
        notes,
        logs,
        interaction.guild,
      );

      await interaction.reply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`onboarding:review:download:${appId}`)
              .setLabel("⬇️ Download TXT")
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`onboarding:dash:back`)
              .setLabel("Back")
              .setStyle(ButtonStyle.Secondary)
              .setEmoji("⬅️"),
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Download TXT ── **/
    if (action === "download") {
      const canDownload = await requirePermission(interaction, "canDownload");
      if (!canDownload) return;

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const receipt = await generateApplicationReceipt(appId);
      if (!receipt) {
        return interaction.editReply({
          content: "Failed to generate receipt.",
        });
      }

      const buffer = Buffer.from(receipt.content, "utf-8");

      await interaction.editReply({
        content: "📎 Here's the application receipt:",
        files: [
          {
            name: receipt.filename,
            attachment: buffer,
          },
        ],
      });
      return;
    }

    /** ── Request Changes ── **/
    if (action === "changes") {
      const canReview = await requirePermission(interaction, "canReview");
      if (!canReview) return;

      const modal = new ModalBuilder()
        .setCustomId(`onboarding:modal:changes:${appId}`)
        .setTitle("Request Changes");

      const changesInput = new TextInputBuilder()
        .setCustomId("changes")
        .setLabel("What needs to be changed?")
        .setPlaceholder("Please elaborate on your answer to...")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500);

      modal.addComponents(new ActionRowBuilder().addComponents(changesInput));
      await interaction.showModal(modal);
      return;
    }

    /** ── Open Review Thread ── **/
    if (action === "thread") {
      const canThread = await requirePermission(interaction, "canOpenThreads");
      if (!canThread) return;

      const channelId = application.reviewChannelId;
      if (!channelId) {
        return interaction.reply({
          content: "No review channel found for this application.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.reply({
          content: "Review channel not found or is not a text channel.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      try {
        const appNum = formatAppNumber(application.applicationNumber);
        const thread = await channel.threads.create({
          name: `Application ${appNum} — ${application.applicantDisplayNameSnapshot || "Review"}`,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
          type: ChannelType.PrivateThread,
          reason: `Review thread for Application ${appNum}`,
        });

        // Add the staff member
        await thread.members.add(interaction.user.id);

        // Post summary
        const appType = application.applicationTypeId
          ? await db.getApplicationType(application.applicationTypeId)
          : null;
        const answers = await db.getAnswers(appId);

        const summaryEmbed = new EmbedBuilder()
          .setTitle(`🧵 Review Thread — Application ${appNum}`)
          .setDescription(
            `**Applicant:** <@${application.applicantId}>\n` +
              `**Type:** ${appType?.publicTitle || "Application"}\n` +
              `**Status:** ${application.status}\n` +
              `**Submitted:** ${application.submittedAt ? new Date(application.submittedAt).toLocaleString() : "N/A"}`,
          )
          .setColor("#5865F2")
          .setTimestamp();

        // Add answer summary
        if (answers?.length) {
          let text = "";
          for (const a of answers) {
            const val =
              a.answerText ||
              a.selectedOptionValues?.join(", ") ||
              "*(no answer)*";
            text += `**${a.fieldLabelSnapshot}:** ${val.slice(0, 200)}\n`;
          }
          if (text.length > 4000) text = text.slice(0, 3997) + "...";
          summaryEmbed.addFields({ name: "📝 Answers", value: text || "None" });
        }

        await thread.send({
          embeds: [summaryEmbed],
          content: `Review thread opened by <@${interaction.user.id}>.`,
        });

        // Update application
        await db.updateApplication(appId, {
          reviewThreadId: thread.id,
          reviewThreadStatus: "OPEN",
        });

        // Add decision log
        await db.addDecisionLog({
          applicationId: appId,
          guildId,
          action: "THREAD_OPENED",
          actorId: interaction.user.id,
          reason: `Thread created: ${thread.id}`,
        });

        // Refresh review card
        await refreshReviewCard(appId, client);

        await interaction.editReply({
          content: `✅ Review thread opened: <#${thread.id}>`,
        });
      } catch (e) {
        await interaction.editReply({
          content: `❌ Failed to open thread: ${e.message}`,
        });
      }
      return;
    }

    /** ── Close Review Thread ── **/
    if (action === "closethread") {
      const canThread = await requirePermission(interaction, "canOpenThreads");
      if (!canThread) return;

      const threadId = application.reviewThreadId;
      if (!threadId) {
        return interaction.reply({
          content: "No review thread found for this application.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      try {
        const thread = await interaction.guild.channels
          .fetch(threadId)
          .catch(() => null);

        if (thread) {
          // Generate transcript
          const result = await generateThreadTranscript(
            appId,
            thread,
            interaction.user.id,
            interaction.guild,
          );

          // Close the thread
          await thread.setLocked(true);
          await thread.setArchived(true);

          await interaction.editReply({
            content:
              `✅ Review thread closed and transcript saved.\n` +
              `Messages archived: ${result?.messageCount || 0}`,
            files: result
              ? [
                  {
                    name: result.filename,
                    attachment: Buffer.from(result.content, "utf-8"),
                  },
                ]
              : [],
          });
        } else {
          // Thread already deleted
          await db.updateApplication(appId, {
            reviewThreadStatus: "DELETED",
          });
          await interaction.editReply({
            content: "Thread was already deleted. Status updated.",
          });
        }
      } catch (e) {
        await interaction.editReply({
          content: `❌ Failed to close thread: ${e.message}`,
        });
      }
      return;
    }

    /** ── Delete Application ── **/
    if (action === "delete") {
      const canDelete = await requirePermission(interaction, "canDelete");
      if (!canDelete) return;

      await interaction.reply({
        embeds: [
          buildSimpleEmbed(
            "⚠️ Confirm Deletion",
            `Are you sure you want to delete Application #${formatAppNumber(application.applicationNumber)}?\n\nThis action is irreversible.`,
            "#ed4245",
          ),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`onboarding:review:confirmdelete:${appId}`)
              .setLabel("Yes, Delete")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`onboarding:dash:back`)
              .setLabel("Cancel")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Confirm Delete ── **/
    if (action === "confirmdelete") {
      const canDelete = await requirePermission(interaction, "canDelete");
      if (!canDelete) return;

      const appNum = formatAppNumber(application.applicationNumber);

      await db.deleteApplication(appId);
      await db.addDecisionLog({
        applicationId: appId,
        guildId,
        action: "DELETED",
        actorId: interaction.user.id,
      });

      // Try to delete the review message
      if (application.reviewMessageId && application.reviewChannelId) {
        try {
          const ch = interaction.guild.channels.cache.get(
            application.reviewChannelId,
          );
          if (ch) {
            const msg = await ch.messages
              .fetch(application.reviewMessageId)
              .catch(() => null);
            if (msg) await msg.delete().catch(() => {});
          }
        } catch {}
      }

      await interaction.update({
        content: `🗑️ Application ${appNum} has been deleted.`,
        embeds: [],
        components: [],
      });
      return;
    }
  },
};
