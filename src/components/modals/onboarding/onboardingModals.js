"use strict";

const {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const db = require("../../../modules/onboarding/onboardingDb");
const adminUi = require("../../../modules/onboarding/onboardingAdminUi");
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

    // Parse: onboarding:modal:action:appId (or just action)
    const parts = customId.split(":");
    const action = parts[2];
    const targetId = parts[3];

    /** ── DM Text Field Answer (runs in DM context — no guildId) ── **/
    if (action === "field") {
      const sessionId = targetId;
      const fieldIndex = parseInt(parts[4], 10);
      const value = interaction.fields.getTextInputValue("value");

      const session = await db.getSessionById(sessionId);
      if (!session || session.applicantId !== interaction.user.id) {
        return interaction
          .reply({
            content: "This application session has expired.",
            flags: [MessageFlags.Ephemeral],
          })
          .catch(() => {});
      }

      const pages = await db.getFormPages(session.applicationTypeId);
      const page = pages[session.currentPage || 0];
      if (!page) {
        return interaction
          .reply({
            content: "This form page no longer exists.",
            flags: [MessageFlags.Ephemeral],
          })
          .catch(() => {});
      }

      const fields = await db.getFormFields(page.id);
      const field = fields[fieldIndex];
      if (!field) {
        return interaction
          .reply({
            content: "This question no longer exists.",
            flags: [MessageFlags.Ephemeral],
          })
          .catch(() => {});
      }

      const answers = session.stateJson?.answers || [];
      const existing = answers.findIndex((a) => a.fieldId === field.id);
      const answerEntry = {
        fieldId: field.id,
        fieldLabel: field.label,
        fieldType: field.fieldType,
        answerText: value,
      };
      if (existing >= 0) answers[existing] = answerEntry;
      else answers.push(answerEntry);

      await db.updateSession(sessionId, {
        stateJson: { ...session.stateJson, answers },
      });

      const {
        buildFormPagePayload,
      } = require("../../buttons/onboarding/onboardingDmFlow");
      const payload = await buildFormPagePayload(
        { ...session, stateJson: { answers } },
        session.currentPage || 0,
        client,
      );

      // Modal submissions triggered from a message component (isFromMessage)
      // support `.update()` to edit that original message in place.
      if (interaction.isFromMessage?.()) {
        await interaction.update(payload).catch(async () => {
          await interaction
            .reply({ ...payload, flags: [MessageFlags.Ephemeral] })
            .catch(() => {});
        });
      } else {
        await interaction
          .reply({ ...payload, flags: [MessageFlags.Ephemeral] })
          .catch(() => {});
      }
      return;
    }

    /** ── DM File Upload Answer (modal file component) ── **/
    if (action === "upload") {
      const sessionId = targetId;
      const fieldIndex = parseInt(parts[4], 10);

      const session = await db.getSessionById(sessionId);
      if (!session || session.applicantId !== interaction.user.id) {
        return interaction
          .reply({
            content: "This application session has expired.",
            flags: [MessageFlags.Ephemeral],
          })
          .catch(() => {});
      }

      const pages = await db.getFormPages(session.applicationTypeId);
      const page = pages[session.currentPage || 0];
      if (!page) {
        return interaction
          .reply({
            content: "This form page no longer exists.",
            flags: [MessageFlags.Ephemeral],
          })
          .catch(() => {});
      }

      const fields = await db.getFormFields(page.id);
      const field = fields[fieldIndex];
      if (!field || field.fieldType !== "FILE_UPLOAD") {
        return interaction
          .reply({
            content: "This upload question no longer exists.",
            flags: [MessageFlags.Ephemeral],
          })
          .catch(() => {});
      }

      const attachment = interaction.fields.getUploadedFiles("file")?.first();
      if (!attachment) {
        return interaction
          .reply({
            content: "Please choose a file before submitting the upload.",
            flags: [MessageFlags.Ephemeral],
          })
          .catch(() => {});
      }

      if (field.maxFileSize && attachment.size > field.maxFileSize) {
        return interaction
          .reply({
            content: `That file is too large. Max size: ${(field.maxFileSize / 1024 / 1024).toFixed(1)} MB.`,
            flags: [MessageFlags.Ephemeral],
          })
          .catch(() => {});
      }

      if (field.allowedFileTypes?.length) {
        const fileName = (attachment.name || "").toLowerCase();
        const contentType = (attachment.contentType || "").toLowerCase();
        const allowed = field.allowedFileTypes.map((type) =>
          String(type).toLowerCase().replace(/^\./, ""),
        );
        const matchesAllowed = allowed.some(
          (type) => fileName.endsWith(`.${type}`) || contentType.includes(type),
        );
        if (!matchesAllowed) {
          return interaction
            .reply({
              content: `That file type is not allowed. Allowed types: ${allowed.join(", ")}.`,
              flags: [MessageFlags.Ephemeral],
            })
            .catch(() => {});
        }
      }

      const answers = session.stateJson?.answers || [];
      const existing = answers.findIndex((a) => a.fieldId === field.id);
      const answerEntry = {
        fieldId: field.id,
        fieldLabel: field.label,
        fieldType: field.fieldType,
        answerText: attachment.name || "Uploaded file",
        fileRefs: [
          {
            url: attachment.url,
            name: attachment.name,
            size: attachment.size,
            contentType: attachment.contentType || null,
          },
        ],
      };
      if (existing >= 0) answers[existing] = answerEntry;
      else answers.push(answerEntry);

      const stateJson = {
        ...(session.stateJson || {}),
        answers,
        pendingUpload: null,
      };
      await db.updateSession(sessionId, { stateJson });

      const {
        buildFormPagePayload,
      } = require("../../buttons/onboarding/onboardingDmFlow");
      const payload = await buildFormPagePayload(
        { ...session, stateJson },
        session.currentPage || 0,
        client,
      );
      const responsePayload = {
        content: `File saved: **${attachment.name || "Uploaded file"}**`,
        ...payload,
      };

      if (interaction.isFromMessage?.()) {
        await interaction.update(responsePayload).catch(async () => {
          await interaction
            .reply({ ...responsePayload, flags: [MessageFlags.Ephemeral] })
            .catch(() => {});
        });
      } else {
        await interaction
          .reply({ ...responsePayload, flags: [MessageFlags.Ephemeral] })
          .catch(() => {});
      }
      return;
    }

    if (!guildId) return;

    /** ── Add Form Page (guild dashboard context) ── **/
    if (action === "addpage" && targetId) {
      const title = interaction.fields.getTextInputValue("title");
      const description =
        interaction.fields.getTextInputValue("description") || null;

      const pages = await db.getFormPages(targetId);
      const newPage = await db.createFormPage({
        applicationTypeId: targetId,
        title,
        description,
        sortOrder: pages.length,
      });

      if (!newPage) {
        return interaction
          .reply({
            content: "Failed to create form page. Please try again.",
            flags: [MessageFlags.Ephemeral],
          })
          .catch(() => {});
      }

      const appType = await db.getApplicationType(targetId);
      const updatedPages = await db.getFormPages(targetId);
      let desc = `**Form pages for: ${appType?.publicTitle || appType?.name}**\n\n`;
      for (const p of updatedPages) {
        const fields = await db.getFormFields(p.id);
        desc += `📄 **${p.title}** (${fields.length} fields)\n`;
      }
      desc += "\nUse **Add Page** to create another page.";

      await interaction.reply({
        embeds: [buildSimpleEmbed("✅ Page Added", desc, "#57f287")],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`onboarding:type:addpage:${targetId}`)
              .setLabel("Add Another Page")
              .setStyle(ButtonStyle.Success)
              .setEmoji("➕"),
            new ButtonBuilder()
              .setCustomId(`onboarding:type:edit:${targetId}`)
              .setLabel("Back to Type Settings")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Add Form Field ── **/
    if (action === "addfield" && targetId) {
      const pageId = targetId;
      const fieldType = parts[4];
      const label = interaction.fields.getTextInputValue("label");
      const helpText = interaction.fields.getTextInputValue("helpText") || null;
      const requiredRaw =
        interaction.fields.getTextInputValue("required") || "yes";
      const settingsRaw =
        interaction.fields.getTextInputValue("settings") || "";
      const optionsRaw = interaction.fields.getTextInputValue("options") || "";

      const prisma = require("../../../lib/prisma");
      const pageRows = await prisma
        .$queryRawUnsafe(
          `SELECT * FROM "OnboardingFormPage" WHERE "id" = $1`,
          pageId,
        )
        .catch(() => []);
      const page = pageRows?.[0];
      if (!page) {
        return interaction.reply({
          content: "Page not found.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      const fields = await db.getFormFields(pageId);
      if (fields.length >= 5) {
        return interaction.reply({
          content:
            "This page already has 5 fields. Delete or edit an existing field first.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      const parsedSettings = parseFieldSettings(settingsRaw);
      const storedType = fieldType === "CONFIRMATION" ? "YES_NO" : fieldType;
      const fieldId = await db.createFormField({
        pageId,
        applicationTypeId: page.applicationTypeId,
        fieldType: storedType,
        label,
        helpText,
        placeholder: parsedSettings.placeholder || null,
        required: !/^no|false|optional$/i.test(requiredRaw.trim()),
        minLength: parsedSettings.min,
        maxLength: parsedSettings.max,
        minChoices: parsedSettings.min,
        maxChoices: parsedSettings.max,
        allowedFileTypes: parsedSettings.types || [],
        maxFileSize: parsedSettings.maxmb
          ? parsedSettings.maxmb * 1024 * 1024
          : null,
        sortOrder: fields.length,
      });

      if (!fieldId) {
        return interaction.reply({
          content: "Failed to create field.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      if (storedType === "SINGLE_SELECT" || storedType === "MULTI_SELECT") {
        const options = parseOptions(optionsRaw);
        for (let index = 0; index < options.length; index++) {
          await db.createFieldOption({
            fieldId,
            label: options[index].label,
            value: options[index].value,
            emoji: options[index].emoji,
            sortOrder: index,
            linkedRoleIds: [],
          });
        }
      }

      const payload = await adminUi.buildPageBuilderPayload(pageId);
      await interaction.reply({
        content:
          `Added ${adminUi.fieldTypeLabel(storedType)} field: **${label}**` +
          (fieldType === "FILE_UPLOAD"
            ? "\nFile upload uses the DM attachment prompt fallback in this Discord.js build; raw files are not stored."
            : ""),
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Edit Field ── **/
    if (action === "editfield" && targetId) {
      const fieldId = targetId;
      const label = interaction.fields.getTextInputValue("label");
      const helpText = interaction.fields.getTextInputValue("helpText") || null;
      const requiredRaw =
        interaction.fields.getTextInputValue("required") || "yes";
      await db.updateFormField(fieldId, {
        label,
        helpText,
        required: !/^no|false|optional$/i.test(requiredRaw.trim()),
      });
      const payload = await adminUi.buildFieldManagerPayload(fieldId);
      await interaction.reply({
        content: "Field updated.",
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Replace Field Options ── **/
    if (action === "fieldoptions" && targetId) {
      const fieldId = targetId;
      const optionsRaw = interaction.fields.getTextInputValue("options");
      const oldOptions = await db.getFieldOptions(fieldId);
      for (const option of oldOptions) await db.deleteFieldOption(option.id);
      const options = parseOptions(optionsRaw);
      for (let index = 0; index < options.length; index++) {
        await db.createFieldOption({
          fieldId,
          label: options[index].label,
          value: options[index].value,
          emoji: options[index].emoji,
          sortOrder: index,
          linkedRoleIds: [],
        });
      }
      const payload = await adminUi.buildFieldManagerPayload(fieldId);
      await interaction.reply({
        content: `Saved ${options.length} option(s). Use Role Routing to map answers to roles after approval.`,
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Application Type Button ── **/
    if (action === "typebutton" && targetId) {
      const buttonLabel = interaction.fields.getTextInputValue("buttonLabel");
      const buttonEmoji =
        interaction.fields.getTextInputValue("buttonEmoji") || null;
      await db.updateApplicationType(targetId, { buttonLabel, buttonEmoji });
      const payload = await adminUi.buildTypeManagerPayload(guildId, targetId);
      await interaction.reply({
        content: "Button label/emoji saved.",
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Application Type Instructions ── **/
    if (action === "typeinstructions" && targetId) {
      const instructions =
        interaction.fields.getTextInputValue("instructions") || null;
      await db.updateApplicationType(targetId, { instructions });
      const payload = await adminUi.buildTypeManagerPayload(guildId, targetId);
      await interaction.reply({
        content: "Instructions saved.",
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Panel Embed Text ── **/
    if (action === "panelembed") {
      await db.updateConfig(guildId, {
        panelEmbedTitle: interaction.fields.getTextInputValue("title") || null,
        panelEmbedDescription:
          interaction.fields.getTextInputValue("description") || null,
        panelEmbedFooter:
          interaction.fields.getTextInputValue("footer") || null,
      });
      const config = await db.getConfig(guildId);
      const payload = await adminUi.buildPanelDesignPayload(
        interaction.guild,
        config,
      );
      await interaction.reply({
        content: "Panel embed text saved.",
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Panel Media / Color ── **/
    if (action === "panelmedia") {
      await db.updateConfig(guildId, {
        panelEmbedColor: interaction.fields.getTextInputValue("color") || null,
        panelThumbnailUrl:
          interaction.fields.getTextInputValue("thumbnail") || null,
        panelImageUrl: interaction.fields.getTextInputValue("image") || null,
      });
      const config = await db.getConfig(guildId);
      const payload = await adminUi.buildPanelDesignPayload(
        interaction.guild,
        config,
      );
      await interaction.reply({
        content: "Panel media/color saved.",
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

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

function parseFieldSettings(raw) {
  const settings = {};
  for (const token of String(raw || "").split(/\s+/)) {
    const [key, value] = token.split("=");
    if (!key || value === undefined) continue;
    const normalized = key.toLowerCase();
    if (normalized === "min") settings.min = parseInt(value, 10) || null;
    if (normalized === "max") settings.max = parseInt(value, 10) || null;
    if (normalized === "maxmb") settings.maxmb = parseInt(value, 10) || null;
    if (normalized === "types") {
      settings.types = value
        .split(",")
        .map((v) => v.trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean);
    }
    if (normalized === "placeholder") settings.placeholder = value;
  }
  return settings;
}

function parseOptions(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 25)
    .map((line) => {
      const [emojiOrLabel, maybeLabel, maybeValue] = line
        .split("|")
        .map((s) => s.trim());
      const hasEmoji = maybeValue !== undefined;
      const label = hasEmoji ? maybeLabel : emojiOrLabel;
      const value = (hasEmoji ? maybeValue : maybeLabel) || label;
      return {
        emoji: hasEmoji ? emojiOrLabel : null,
        label: label.slice(0, 100),
        value: value.slice(0, 100),
      };
    });
}
