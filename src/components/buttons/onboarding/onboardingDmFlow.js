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
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  MentionableSelectMenuBuilder,
} = require("discord.js");
const db = require("../../../modules/onboarding/onboardingDb");
const {
  submitApplication,
  applyPendingRole,
} = require("../../../modules/onboarding/onboardingService");
const {
  isOnboardingPremiumActive,
} = require("../../../modules/onboarding/onboardingPremium");

/**
 * NOTE ON DESIGN:
 * Every interaction handled by this file (except "continue"/"tryagain",
 * which originate from an ephemeral message in the guild) happens inside a
 * DM channel, where `interaction.guildId` is always `null`. All session
 * lookups therefore go through `db.getSessionById(sessionId)` — the
 * sessionId is embedded directly in every customId — never through
 * guildId+userId+appTypeId composite lookups, which cannot work in DMs.
 */

module.exports = {
  customIdPrefix: "onboarding:dm:",
  buildFormPagePayload,
  showFormPage,
  handlePendingUploadMessage,

  async execute(interaction, client) {
    const customId = interaction.customId;
    const parts = customId.split(":");
    const action = parts[2];
    const targetId = parts[3]; // always a sessionId in this file

    if (!targetId) return;

    /** ── Start Application Form (DM) ── **/
    if (action === "start") {
      const session = await db.getSessionById(targetId);
      if (!session || session.applicantId !== interaction.user.id) {
        return interaction
          .reply({
            content:
              "This application session was not found or has expired. Please use the panel in the server to apply again.",
            flags: [MessageFlags.Ephemeral],
          })
          .catch(() => {});
      }

      if (isSessionExpired(session)) {
        await db.deleteSession(session.id);
        return interaction
          .update({
            content:
              "⌛ This application draft has expired. Please start a new one from the server panel.",
            embeds: [],
            components: [],
          })
          .catch(() => {});
      }

      const premiumActive = await isOnboardingPremiumActive(session.guildId);
      if (!premiumActive) {
        await db.deleteSession(session.id);
        return interaction
          .update({
            content:
              "🔒 Applications are currently unavailable because Premium has expired for this server.",
            embeds: [],
            components: [],
          })
          .catch(() => {});
      }

      const appType = await db.getApplicationType(session.applicationTypeId);
      if (!appType || !appType.enabled) {
        return interaction
          .update({
            content:
              "This application type is no longer available. Please contact staff.",
            embeds: [],
            components: [],
          })
          .catch(() => {});
      }

      await showFormPage(
        interaction,
        session,
        session.currentPage || 0,
        client,
      );
      return;
    }

    /** ── Cancel Application / Draft ── **/
    if (action === "cancel") {
      const session = await db.getSessionById(targetId);
      if (session && session.applicantId === interaction.user.id) {
        await db.deleteSession(session.id);
      }
      await respondForm(interaction, {
        content:
          "❌ Application cancelled. You can start a new one anytime from the server panel.",
        embeds: [],
        components: [],
      });
      return;
    }

    /** ── Try Again (DM failed) ── **/
    if (action === "tryagain") {
      const session = await db.getSessionById(targetId);
      if (!session) {
        return interaction
          .reply({
            content:
              "This session no longer exists. Please use the panel to apply again.",
            flags: [MessageFlags.Ephemeral],
          })
          .catch(() => {});
      }

      await interaction.deferUpdate().catch(() => {});

      const appType = await db.getApplicationType(session.applicationTypeId);
      if (!appType) {
        return interaction
          .editReply({
            content: "That application type no longer exists.",
            components: [],
          })
          .catch(() => {});
      }

      const user = await client.users
        .fetch(session.applicantId)
        .catch(() => null);
      if (!user) {
        return interaction
          .editReply({
            content: "Could not find your user account.",
            components: [],
          })
          .catch(() => {});
      }

      const guild = client.guilds.cache.get(session.guildId);
      const { sendSessionStartDm } = require("./onboardingApplyButton");
      const result = await sendSessionStartDm(
        user,
        session,
        appType,
        guild?.name,
      );

      if (result.success) {
        await interaction
          .editReply({
            content: "✅ Sent! Please check your DMs to continue.",
            components: [],
          })
          .catch(() => {});
      } else {
        await interaction
          .editReply({
            content:
              "❌ I still couldn't DM you. Please make sure you allow direct messages from server members, then try again.",
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`onboarding:dm:tryagain:${session.id}`)
                  .setLabel("Try Again")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId(`onboarding:dm:cancel:${session.id}`)
                  .setLabel("Cancel")
                  .setStyle(ButtonStyle.Secondary),
              ),
            ],
          })
          .catch(() => {});
      }
      return;
    }

    /** ── Continue Draft (offered in the guild) ── **/
    if (action === "continue") {
      const session = await db.getSessionById(targetId);
      if (!session) {
        return interaction
          .reply({
            content: "Session not found. It may have expired.",
            flags: [MessageFlags.Ephemeral],
          })
          .catch(() => {});
      }

      await interaction
        .update({
          content: "📬 Check your DMs to continue your application.",
          embeds: [],
          components: [],
        })
        .catch(() => {});

      const user = await client.users
        .fetch(session.applicantId)
        .catch(() => null);
      if (user) {
        const payload = await buildFormPagePayload(
          session,
          session.currentPage || 0,
          client,
        );
        await user.send(payload).catch(() => {});
      }
      return;
    }

    /** ── Next Page ── **/
    if (action === "next") {
      await handleNextPage(interaction, targetId, client);
      return;
    }

    /** ── Previous Page ── **/
    if (action === "prev") {
      await handlePrevPage(interaction, targetId, client);
      return;
    }

    /** ── Submit ── **/
    if (action === "submit") {
      await handleSubmit(interaction, targetId, client);
      return;
    }

    /** ── Answer Short/Paragraph Text (opens modal) ── **/
    if (action === "answer") {
      const fieldIndex = parseInt(parts[4], 10);
      await handleTextAnswerButton(interaction, targetId, fieldIndex, client);
      return;
    }

    /** ── File Upload ── **/
    if (action === "upload") {
      const fieldIndex = parseInt(parts[4], 10);
      await handleUploadButton(interaction, targetId, fieldIndex, client);
      return;
    }

    /** ── Toggle Yes/No ── **/
    if (action === "yesno") {
      const fieldIndex = parseInt(parts[4], 10);
      const value = parts[5];
      await handleYesNo(interaction, targetId, fieldIndex, value, client);
      return;
    }

    /** ── Select Option (string/user/role/channel selects) ── **/
    if (action === "select") {
      const fieldIndex = parseInt(parts[4], 10);
      const isSelect =
        interaction.isStringSelectMenu?.() ||
        interaction.isUserSelectMenu?.() ||
        interaction.isRoleSelectMenu?.() ||
        interaction.isChannelSelectMenu?.() ||
        interaction.isMentionableSelectMenu?.();
      if (!isSelect) return;
      await handleSelectOption(interaction, targetId, fieldIndex, client);
      return;
    }
  },
};

/**
 * Whether a session's draft has expired.
 */
function isSessionExpired(session) {
  return (
    session?.expiresAt && new Date(session.expiresAt).getTime() < Date.now()
  );
}

/**
 * Reply to a component interaction the safe way, regardless of whether it
 * has already been deferred/replied. Avoids the "reply after reply" crash
 * and the "duplicate DM message" bug that came from reply().catch(followUp).
 */
async function respondForm(interaction, payload) {
  try {
    if (interaction.deferred) return await interaction.editReply(payload);
    if (interaction.replied) return await interaction.followUp(payload);
    return await interaction.update(payload);
  } catch {
    try {
      return await interaction.reply({
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
    } catch {
      return null;
    }
  }
}

/**
 * Build the {embeds, components, content} payload for a given form page.
 * Pure data — does not touch any interaction, so it can be sent as a fresh
 * DM message (user.send) or used to update an existing one.
 */
async function buildFormPagePayload(session, pageIndex, client) {
  const appTypeId = session.applicationTypeId;
  const guildId = session.guildId;
  const guild = client.guilds.cache.get(guildId);

  const appType = await db.getApplicationType(appTypeId);
  const pages = await db.getFormPages(appTypeId);

  if (!pages.length) {
    return {
      content:
        "This application type uses the default question format.\n\n" +
        "The server hasn't configured custom form pages yet.\n" +
        "Please contact staff if you have questions.",
      embeds: [],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`onboarding:dm:submit:${session.id}`)
            .setLabel("Submit Simple Application")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`onboarding:dm:cancel:${session.id}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      ],
    };
  }

  const page = pages[pageIndex];
  if (!page) {
    return buildPreviewPayload(session, client);
  }

  const fields = await db.getFormFields(page.id);

  const embed = new EmbedBuilder()
    .setTitle(`📝 ${page.title || `Step ${pageIndex + 1}`}`)
    .setColor(appType?.themeColor || "#5865F2");

  if (page.description) {
    embed.setDescription(page.description);
  }
  embed.setFooter({
    text: `${guild?.name || "Application"} • Page ${pageIndex + 1} of ${pages.length}`,
  });

  if (fields.length) {
    let fieldDesc = "";
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const existingAnswer = (session.stateJson?.answers || []).find(
        (a) => a.fieldId === f.id,
      );
      const answered = existingAnswer ? "✅" : "❌";
      fieldDesc += `${answered} **${f.label}**${f.required === false ? " _(optional)_" : ""}`;

      if (f.fieldType === "SINGLE_SELECT" || f.fieldType === "MULTI_SELECT") {
        const options = await db.getFieldOptions(f.id);
        if (options.length <= 5) {
          fieldDesc += `\n_Choose from: ${options.map((o) => o.label).join(", ")}_`;
        }
      }

      if (existingAnswer?.answerText) {
        fieldDesc += `\n→ ${existingAnswer.answerText.slice(0, 50)}`;
      }
      fieldDesc += "\n\n";
    }

    if (fieldDesc.length > 4000) fieldDesc = fieldDesc.slice(0, 3997) + "...";
    embed.addFields({
      name: "Questions",
      value: fieldDesc || "No questions configured",
    });
  }

  // Build answer components for each field
  const rows = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const existingAnswer = (session.stateJson?.answers || []).find(
      (a) => a.fieldId === f.id,
    );

    const row = new ActionRowBuilder();

    if (f.fieldType === "YES_NO" || f.fieldType === "CONFIRMATION") {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`onboarding:dm:yesno:${session.id}:${i}:yes`)
          .setLabel(f.fieldType === "CONFIRMATION" ? "I Agree" : "Yes")
          .setStyle(
            existingAnswer?.answerText === "Yes"
              ? ButtonStyle.Success
              : ButtonStyle.Secondary,
          ),
        new ButtonBuilder()
          .setCustomId(`onboarding:dm:yesno:${session.id}:${i}:no`)
          .setLabel(f.fieldType === "CONFIRMATION" ? "I Do Not Agree" : "No")
          .setStyle(
            existingAnswer?.answerText === "No"
              ? ButtonStyle.Danger
              : ButtonStyle.Secondary,
          ),
      );
    } else if (
      f.fieldType === "SINGLE_SELECT" ||
      f.fieldType === "MULTI_SELECT"
    ) {
      const options = await db.getFieldOptions(f.id);
      if (options.length) {
        const select = new StringSelectMenuBuilder()
          .setCustomId(`onboarding:dm:select:${session.id}:${i}`)
          .setPlaceholder(f.label.slice(0, 150))
          .setMaxValues(
            f.fieldType === "MULTI_SELECT"
              ? Math.min(options.length, f.maxChoices || options.length, 25)
              : 1,
          )
          .setMinValues(
            f.required !== false ? Math.max(1, f.minChoices || 1) : 0,
          )
          .addOptions(
            options.slice(0, 25).map((o) => ({
              label: o.label.slice(0, 100),
              value: o.value.slice(0, 100),
              emoji: o.emoji || undefined,
              default: !!existingAnswer?.selectedOptionValues?.includes(
                o.value,
              ),
            })),
          );
        row.addComponents(select);
      }
    } else if (f.fieldType === "USER_SELECT") {
      row.addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`onboarding:dm:select:${session.id}:${i}`)
          .setPlaceholder(f.label.slice(0, 150))
          .setMinValues(f.required !== false ? 1 : 0)
          .setMaxValues(f.maxChoices || 1),
      );
    } else if (f.fieldType === "ROLE_SELECT") {
      row.addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`onboarding:dm:select:${session.id}:${i}`)
          .setPlaceholder(f.label.slice(0, 150))
          .setMinValues(f.required !== false ? 1 : 0)
          .setMaxValues(f.maxChoices || 1),
      );
    } else if (f.fieldType === "CHANNEL_SELECT") {
      row.addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`onboarding:dm:select:${session.id}:${i}`)
          .setPlaceholder(f.label.slice(0, 150))
          .setMinValues(f.required !== false ? 1 : 0)
          .setMaxValues(f.maxChoices || 1),
      );
    } else if (f.fieldType === "MENTIONABLE_SELECT") {
      row.addComponents(
        new MentionableSelectMenuBuilder()
          .setCustomId(`onboarding:dm:select:${session.id}:${i}`)
          .setPlaceholder(f.label.slice(0, 150))
          .setMinValues(f.required !== false ? 1 : 0)
          .setMaxValues(f.maxChoices || 1),
      );
    } else if (f.fieldType === "FILE_UPLOAD") {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`onboarding:dm:upload:${session.id}:${i}`)
          .setLabel(`${existingAnswer ? "Replace File" : "Upload File"}`)
          .setStyle(
            existingAnswer ? ButtonStyle.Primary : ButtonStyle.Secondary,
          ),
      );
    } else {
      // TEXT_SHORT / TEXT_PARAGRAPH (default)
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`onboarding:dm:answer:${session.id}:${i}`)
          .setLabel(`${existingAnswer ? "✏️" : "📝"} ${f.label.slice(0, 70)}`)
          .setStyle(
            existingAnswer ? ButtonStyle.Primary : ButtonStyle.Secondary,
          ),
      );
    }

    if (row.components.length > 0) rows.push(row);
  }

  // Navigation row
  const navRow = new ActionRowBuilder();
  if (pageIndex > 0) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`onboarding:dm:prev:${session.id}`)
        .setLabel("◀️ Previous")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  navRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`onboarding:dm:next:${session.id}`)
      .setLabel("Next ▶️")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`onboarding:dm:cancel:${session.id}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  rows.push(navRow);

  return { embeds: [embed], components: rows.slice(0, 5) };
}

/**
 * Build the {embeds, components} preview payload before final submission.
 */
async function buildPreviewPayload(session, client) {
  const appType = await db.getApplicationType(session.applicationTypeId);
  const guild = client.guilds.cache.get(session.guildId);

  const answers = session.stateJson?.answers || [];

  const embed = new EmbedBuilder()
    .setTitle("📋 Application Preview")
    .setColor(appType?.themeColor || "#5865F2")
    .setDescription(
      `**Application:** ${appType?.publicTitle || appType?.name}\n` +
        `**Server:** ${guild?.name || "Unknown"}\n\n` +
        `Please review your answers below.`,
    );

  if (answers.length) {
    for (const a of answers) {
      let val = a.answerText || "";
      if (a.selectedOptionValues?.length)
        val = a.selectedOptionValues.join(", ");
      if (!val) val = "*(not answered)*";
      if (val.length > 1024) val = val.slice(0, 1021) + "...";
      embed.addFields({
        name: a.fieldLabel || "Answer",
        value: val,
        inline: false,
      });
    }
  } else {
    embed.addFields({
      name: "No answers",
      value: "No fields have been answered yet.",
    });
  }

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`onboarding:dm:submit:${session.id}`)
          .setLabel("✅ Submit")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`onboarding:dm:prev:${session.id}`)
          .setLabel("◀️ Edit Answers")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`onboarding:dm:cancel:${session.id}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

/**
 * Show a form page to the user, updating the message the interaction fired
 * from (works for both a fresh click and a deferred one, DM or guild).
 */
async function showFormPage(interaction, session, pageIndex, client) {
  const payload = await buildFormPagePayload(session, pageIndex, client);
  await respondForm(interaction, payload);
}

async function showPreview(interaction, session, client) {
  const payload = await buildPreviewPayload(session, client);
  await respondForm(interaction, payload);
}

async function handleSubmit(interaction, sessionId, client) {
  const session = await db.getSessionById(sessionId);
  if (!session || session.applicantId !== interaction.user.id) {
    return interaction
      .reply({
        content: "Session expired. Please start a new application.",
        flags: [MessageFlags.Ephemeral],
      })
      .catch(() => {});
  }

  await interaction.deferUpdate().catch(() => {});

  // Re-verify premium + application type are still valid at the moment of
  // submission, per spec ("Block new application submissions" on expiry).
  const premiumActive = await isOnboardingPremiumActive(session.guildId);
  if (!premiumActive) {
    await interaction
      .editReply({
        content:
          "🔒 Premium has expired for this server. Your application could not be submitted. Please contact staff.",
        embeds: [],
        components: [],
      })
      .catch(() => {});
    return;
  }

  const appType = await db.getApplicationType(session.applicationTypeId);
  if (!appType || !appType.enabled) {
    await interaction
      .editReply({
        content: "This application type is no longer available.",
        embeds: [],
        components: [],
      })
      .catch(() => {});
    return;
  }

  const missing = await getMissingRequiredFields(session);
  if (missing.length) {
    const payload = await buildFormPagePayload(
      session,
      session.currentPage || 0,
      client,
    );
    await interaction
      .editReply({
        content:
          "Please complete the required fields before submitting:\n" +
          missing.map((field) => `- ${field.label}`).join("\n"),
        ...payload,
      })
      .catch(() => {});
    return;
  }

  const guild = client.guilds.cache.get(session.guildId);
  const member = guild
    ? await guild.members.fetch(session.applicantId).catch(() => null)
    : null;
  const user = await client.users
    .fetch(session.applicantId)
    .catch(() => interaction.user);

  const application = await db.createApplication({
    guildId: session.guildId,
    applicationTypeId: session.applicationTypeId,
    applicantId: session.applicantId,
    applicantUsernameSnapshot: user?.username,
    applicantDisplayNameSnapshot: member?.displayName || user?.displayName,
    status: "DRAFT",
    serverMemberStatus: member ? "IN_SERVER" : "LEFT_SERVER",
  });

  if (!application) {
    await interaction
      .editReply({
        content: "Failed to create application. Please try again.",
        embeds: [],
        components: [],
      })
      .catch(() => {});
    return;
  }

  const answers = session.stateJson?.answers || [];
  for (const a of answers) {
    await db.saveAnswer({
      applicationId: application.id,
      fieldId: a.fieldId || null,
      fieldLabelSnapshot: a.fieldLabel,
      fieldType: a.fieldType,
      answerText: a.answerText || null,
      selectedOptionValues: a.selectedOptionValues || [],
      selectedRoleIds: a.selectedRoleIds || [],
      fileRefs: a.fileRefs || null,
    });
  }

  const result = await submitApplication(application.id, client);

  if (appType?.pendingRoleId && member) {
    await applyPendingRole(
      session.guildId,
      session.applicantId,
      appType.pendingRoleId,
      client,
    );
  }

  await db.deleteSession(session.id);

  if (result.success) {
    await interaction
      .editReply({
        content:
          "✅ **Application submitted!**\n\n" +
          `Your application has been sent to staff for review.\n` +
          `Application ID: #${String(application.applicationNumber).padStart(4, "0")}\n\n` +
          `You will be notified of any decision.`,
        embeds: [],
        components: [],
      })
      .catch(() => {});
  } else {
    await interaction
      .editReply({
        content:
          "⚠️ Application saved but submission to review channel failed.\n" +
          `Error: ${result.error}\n\n` +
          "Please contact staff.",
        embeds: [],
        components: [],
      })
      .catch(() => {});
  }
}

async function handleTextAnswerButton(
  interaction,
  sessionId,
  fieldIndex,
  client,
) {
  const session = await db.getSessionById(sessionId);
  if (!session || session.applicantId !== interaction.user.id) {
    return interaction
      .reply({ content: "Session expired.", flags: [MessageFlags.Ephemeral] })
      .catch(() => {});
  }

  const pages = await db.getFormPages(session.applicationTypeId);
  const page = pages[session.currentPage || 0];
  if (!page) return;

  const fields = await db.getFormFields(page.id);
  const field = fields[fieldIndex];
  if (!field) return;

  const existingAnswer = (session.stateJson?.answers || []).find(
    (a) => a.fieldId === field.id,
  );

  const modal = new ModalBuilder()
    .setCustomId(`onboarding:modal:field:${session.id}:${fieldIndex}`)
    .setTitle(field.label.slice(0, 45));

  const textInput = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(field.label.slice(0, 45))
    .setPlaceholder(
      (field.helpText || field.placeholder || "Enter your answer...").slice(
        0,
        100,
      ),
    )
    .setStyle(
      field.fieldType === "TEXT_PARAGRAPH"
        ? TextInputStyle.Paragraph
        : TextInputStyle.Short,
    )
    .setRequired(field.required !== false)
    .setMaxLength(Math.min(field.maxLength || 1000, 4000))
    .setMinLength(field.minLength || 0);

  if (existingAnswer?.answerText) {
    textInput.setValue(existingAnswer.answerText.slice(0, 4000));
  }

  modal.addComponents(new ActionRowBuilder().addComponents(textInput));
  await interaction.showModal(modal);
}

async function handleUploadButton(interaction, sessionId, fieldIndex, client) {
  const session = await db.getSessionById(sessionId);
  if (!session || session.applicantId !== interaction.user.id) {
    return interaction
      .reply({ content: "Session expired.", flags: [MessageFlags.Ephemeral] })
      .catch(() => {});
  }

  const pages = await db.getFormPages(session.applicationTypeId);
  const page = pages[session.currentPage || 0];
  if (!page) return;

  const fields = await db.getFormFields(page.id);
  const field = fields[fieldIndex];
  if (!field) return;

  const pendingUpload = {
    sessionId,
    fieldId: field.id,
    fieldIndex,
    label: field.label,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };

  await db.updateSession(sessionId, {
    stateJson: { ...(session.stateJson || {}), pendingUpload },
  });

  const payload = await buildFormPagePayload(
    { ...session, stateJson: { ...(session.stateJson || {}), pendingUpload } },
    session.currentPage || 0,
    client,
  );

  await respondForm(interaction, {
    content:
      `📎 Send **${field.label}** as a file attachment in this DM within the next 5 minutes.\n` +
      "After I receive it, I will mark the field as answered and show this page again." +
      (field.allowedFileTypes?.length
        ? `\nAllowed types: ${field.allowedFileTypes.join(", ")}`
        : ""),
    ...payload,
  });
}

async function handlePendingUploadMessage(message, client) {
  if (message.author.bot || message.guild || !message.attachments?.size) {
    return false;
  }

  const session = await db.getPendingUploadSession(message.author.id);
  const pendingUpload = session?.stateJson?.pendingUpload;
  if (!session || !pendingUpload) return false;

  if (new Date(pendingUpload.expiresAt).getTime() < Date.now()) {
    await db.updateSession(session.id, {
      stateJson: { ...(session.stateJson || {}), pendingUpload: null },
    });
    await message.reply(
      "⌛ That upload window expired. Please press **Upload File** again.",
    );
    return true;
  }

  const pages = await db.getFormPages(session.applicationTypeId);
  let field = null;
  for (const formPage of pages) {
    const fields = await db.getFormFields(formPage.id);
    field = fields.find((f) => f.id === pendingUpload.fieldId);
    if (field) break;
  }
  if (!field) return false;

  const attachment = message.attachments.first();
  if (!attachment) return false;

  if (field.maxFileSize && attachment.size > field.maxFileSize) {
    await message.reply(
      `❌ That file is too large. Max size: ${(field.maxFileSize / 1024 / 1024).toFixed(1)} MB.`,
    );
    return true;
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
      await message.reply(
        `❌ That file type is not allowed. Allowed types: ${allowed.join(", ")}.`,
      );
      return true;
    }
  }

  const fileRefs = [
    {
      url: attachment.url,
      name: attachment.name,
      size: attachment.size,
      contentType: attachment.contentType || null,
    },
  ];

  const freshSession = await db.getSessionById(session.id);
  if (!freshSession) return false;

  const answers = freshSession.stateJson?.answers || [];
  const existing = answers.findIndex((a) => a.fieldId === field.id);
  const answerEntry = {
    fieldId: field.id,
    fieldLabel: field.label,
    fieldType: field.fieldType,
    answerText: attachment.name,
    fileRefs,
  };
  if (existing >= 0) answers[existing] = answerEntry;
  else answers.push(answerEntry);

  await db.updateSession(session.id, {
    stateJson: { ...freshSession.stateJson, answers, pendingUpload: null },
  });

  await message.reply(`✅ File received: **${attachment.name}**`);

  const updatedSession = {
    ...freshSession,
    stateJson: { ...(freshSession.stateJson || {}), answers },
  };
  const payload = await buildFormPagePayload(
    updatedSession,
    freshSession.currentPage || 0,
    client,
  );
  await message.channel
    .send({
      content:
        "File saved. Continue the application from the updated form below.",
      ...payload,
    })
    .catch(() => {});
  return true;
}

async function handleYesNo(interaction, sessionId, fieldIndex, value, client) {
  await interaction.deferUpdate().catch(() => {});

  const session = await db.getSessionById(sessionId);
  if (!session || session.applicantId !== interaction.user.id) return;

  const pages = await db.getFormPages(session.applicationTypeId);
  const page = pages[session.currentPage || 0];
  if (!page) return;

  const fields = await db.getFormFields(page.id);
  const field = fields[fieldIndex];
  if (!field) return;

  const answers = session.stateJson?.answers || [];
  const existing = answers.findIndex((a) => a.fieldId === field.id);
  const answerEntry = {
    fieldId: field.id,
    fieldLabel: field.label,
    fieldType: field.fieldType,
    answerText: value === "yes" ? "Yes" : "No",
  };

  if (existing >= 0) answers[existing] = answerEntry;
  else answers.push(answerEntry);

  await db.updateSession(sessionId, {
    stateJson: { ...session.stateJson, answers },
  });

  await showFormPage(
    interaction,
    { ...session, stateJson: { answers } },
    session.currentPage || 0,
    client,
  );
}

async function handleSelectOption(interaction, sessionId, fieldIndex, client) {
  await interaction.deferUpdate().catch(() => {});

  const session = await db.getSessionById(sessionId);
  if (!session || session.applicantId !== interaction.user.id) return;

  const pages = await db.getFormPages(session.applicationTypeId);
  const page = pages[session.currentPage || 0];
  if (!page) return;

  const fields = await db.getFormFields(page.id);
  const field = fields[fieldIndex];
  if (!field) return;

  const values = interaction.values || [];
  let answerEntry;

  if (
    field.fieldType === "SINGLE_SELECT" ||
    field.fieldType === "MULTI_SELECT"
  ) {
    const options = await db.getFieldOptions(field.id);
    const selectedOptions = options.filter((o) => values.includes(o.value));
    const selectedRoleIds = selectedOptions
      .flatMap((o) => o.linkedRoleIds || [])
      .filter(Boolean);
    answerEntry = {
      fieldId: field.id,
      fieldLabel: field.label,
      fieldType: field.fieldType,
      answerText: selectedOptions.map((o) => o.label).join(", ") || null,
      selectedOptionValues: values,
      selectedRoleIds,
    };
  } else if (field.fieldType === "USER_SELECT") {
    answerEntry = {
      fieldId: field.id,
      fieldLabel: field.label,
      fieldType: field.fieldType,
      answerText: values.map((id) => `<@${id}>`).join(", "),
      selectedOptionValues: values,
    };
  } else if (field.fieldType === "ROLE_SELECT") {
    answerEntry = {
      fieldId: field.id,
      fieldLabel: field.label,
      fieldType: field.fieldType,
      answerText: values.map((id) => `<@&${id}>`).join(", "),
      selectedOptionValues: values,
      selectedRoleIds: values,
    };
  } else if (field.fieldType === "CHANNEL_SELECT") {
    answerEntry = {
      fieldId: field.id,
      fieldLabel: field.label,
      fieldType: field.fieldType,
      answerText: values.map((id) => `<#${id}>`).join(", "),
      selectedOptionValues: values,
    };
  } else if (field.fieldType === "MENTIONABLE_SELECT") {
    answerEntry = {
      fieldId: field.id,
      fieldLabel: field.label,
      fieldType: field.fieldType,
      answerText: values.map((id) => `<@${id}>`).join(", "),
      selectedOptionValues: values,
    };
  } else {
    answerEntry = {
      fieldId: field.id,
      fieldLabel: field.label,
      fieldType: field.fieldType,
      answerText: values.join(", "),
      selectedOptionValues: values,
    };
  }

  const answers = session.stateJson?.answers || [];
  const existing = answers.findIndex((a) => a.fieldId === field.id);
  if (existing >= 0) answers[existing] = answerEntry;
  else answers.push(answerEntry);

  await db.updateSession(sessionId, {
    stateJson: { ...session.stateJson, answers },
  });

  await showFormPage(
    interaction,
    { ...session, stateJson: { answers } },
    session.currentPage || 0,
    client,
  );
}

async function handleNextPage(interaction, sessionId, client) {
  await interaction.deferUpdate().catch(() => {});

  const session = await db.getSessionById(sessionId);
  if (!session || session.applicantId !== interaction.user.id) {
    return interaction
      .editReply({ content: "Session expired.", embeds: [], components: [] })
      .catch(() => {});
  }

  const pages = await db.getFormPages(session.applicationTypeId);
  const nextPage = (session.currentPage || 0) + 1;

  const page = pages[session.currentPage || 0];
  const missing = page ? await getMissingRequiredFields(session, page.id) : [];
  if (missing.length) {
    const payload = await buildFormPagePayload(
      session,
      session.currentPage || 0,
      client,
    );
    await interaction
      .editReply({
        content:
          "Please answer required fields before continuing:\n" +
          missing.map((field) => `- ${field.label}`).join("\n"),
        ...payload,
      })
      .catch(() => {});
    return;
  }

  if (nextPage >= pages.length) {
    await showPreview(interaction, session, client);
  } else {
    await db.updateSession(sessionId, { currentPage: nextPage });
    await showFormPage(
      interaction,
      { ...session, currentPage: nextPage },
      nextPage,
      client,
    );
  }
}

async function getMissingRequiredFields(session, pageId = null) {
  const answers = session.stateJson?.answers || [];
  const pages = pageId
    ? [{ id: pageId }]
    : await db.getFormPages(session.applicationTypeId);
  const missing = [];

  for (const page of pages) {
    const fields = await db.getFormFields(page.id);
    for (const field of fields) {
      if (field.required === false) continue;
      const answer = answers.find((a) => a.fieldId === field.id);
      const hasText = !!answer?.answerText;
      const hasOptions = !!answer?.selectedOptionValues?.length;
      const hasFile = !!answer?.fileRefs?.length;
      if (!hasText && !hasOptions && !hasFile) missing.push(field);
      if (field.fieldType === "CONFIRMATION" && answer?.answerText !== "Yes") {
        missing.push(field);
      }
    }
  }

  return missing;
}

async function handlePrevPage(interaction, sessionId, client) {
  await interaction.deferUpdate().catch(() => {});

  const session = await db.getSessionById(sessionId);
  if (!session || session.applicantId !== interaction.user.id) {
    return interaction
      .editReply({ content: "Session expired.", embeds: [], components: [] })
      .catch(() => {});
  }

  const prevPage = Math.max(0, (session.currentPage || 0) - 1);
  await db.updateSession(sessionId, { currentPage: prevPage });
  await showFormPage(
    interaction,
    { ...session, currentPage: prevPage },
    prevPage,
    client,
  );
}
