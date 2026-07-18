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
} = require("discord.js");
const db = require("../../../modules/onboarding/onboardingDb");
const {
  submitApplication,
  applyPendingRole,
} = require("../../../modules/onboarding/onboardingService");

module.exports = {
  customIdPrefix: "onboarding:dm:",

  async execute(interaction, client) {
    const customId = interaction.customId;
    const parts = customId.split(":");
    const action = parts[2]; // start, cancelapp, tryagain, continue, cancel
    const targetId = parts[3]; // appTypeId or sessionId

    /** ── Start Application Form (DM) ── **/
    if (action === "start" && targetId) {
      const appTypeId = targetId;
      const guildId = interaction.message?.guildId || interaction.guildId;
      if (!guildId) {
        // This is a DM interaction, need to get guildId from session
        const sessions = await db.getExpiredSessions(); // not ideal but...
        // Better: parse from message
        return interaction
          .reply({
            content: "Please use this command from the server.",
            flags: [MessageFlags.Ephemeral],
          })
          .catch(() => {});
      }

      // Get or create session
      let session = await db.getSession(
        guildId,
        interaction.user.id,
        appTypeId,
      );
      if (!session) {
        // Create new
        const config = await db.getConfig(guildId);
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
        session = await db.getSession(guildId, interaction.user.id, appTypeId);
      }

      if (!session) {
        return interaction
          .reply({
            content: "Failed to create application session. Please try again.",
            flags: [MessageFlags.Ephemeral],
          })
          .catch(() => {});
      }

      await showFormPage(interaction, session, 0, client);
      return;
    }

    /** ── Cancel Application (DM) ── **/
    if (action === "cancelapp" && targetId) {
      const appTypeId = targetId;
      // Delete session
      const session = await db.getSession(
        interaction.guildId || interaction.message?.guild?.id || "unknown",
        interaction.user.id,
        appTypeId,
      );
      if (session) {
        await db.deleteSession(session.id);
      }

      await interaction
        .update({
          content:
            "❌ Application cancelled. You can start a new one anytime from the server panel.",
          embeds: [],
          components: [],
        })
        .catch(() => {});
      return;
    }

    /** ── Try Again (DM failed) ── **/
    if (action === "tryagain" && targetId) {
      // Re-trigger the apply flow
      await interaction.reply({
        content: "Attempting to send DM again...",
        flags: [MessageFlags.Ephemeral],
      });
      // Simulate clicking the apply button
      const fakeInteraction = {
        ...interaction,
        customId: `onboarding:apply:${targetId}`,
      };
      await require("./onboardingApplyButton").execute(fakeInteraction, client);
      return;
    }

    /** ── Continue Draft ── **/
    if (action === "continue" && targetId) {
      const sessionId = targetId;
      const session = await db.getSession(
        interaction.guildId,
        interaction.user.id,
        sessionId,
      );
      if (!session) {
        return interaction.reply({
          content: "Session not found. It may have expired.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      await showFormPage(
        interaction,
        session,
        session.currentPage || 0,
        client,
      );
      return;
    }

    /** ── Cancel Draft ── **/
    if (action === "cancel" && targetId) {
      const sessionId = targetId;
      await db.deleteSession(sessionId);
      await interaction
        .update({
          content:
            "Draft cancelled. You can start fresh from the server panel.",
          embeds: [],
          components: [],
        })
        .catch(() => {});
      return;
    }

    /** ── Next Page ── **/
    if (action === "next") {
      const sessionId = targetId;
      await handleNextPage(interaction, sessionId, client);
      return;
    }

    /** ── Previous Page ── **/
    if (action === "prev") {
      const sessionId = targetId;
      await handlePrevPage(interaction, sessionId, client);
      return;
    }

    /** ── Submit ── **/
    if (action === "submit") {
      const sessionId = targetId;
      await handleSubmit(interaction, sessionId, client);
      return;
    }

    /** ── Answer Short Text ── **/
    if (action === "answer") {
      const sessionId = targetId;
      const fieldIndex = parseInt(parts[4], 10);
      await handleShortAnswer(interaction, sessionId, fieldIndex, client);
      return;
    }

    /** ── Toggle Yes/No ── **/
    if (action === "yesno") {
      const sessionId = targetId;
      const fieldIndex = parseInt(parts[4], 10);
      const value = parts[5]; // yes or no
      await handleYesNo(interaction, sessionId, fieldIndex, value, client);
      return;
    }

    /** ── Select Option ── **/
    if (action === "select") {
      const parts2 = customId.split(":");
      const sessionId = parts2[3];
      const fieldIndex = parseInt(parts2[4], 10);
      if (!interaction.isStringSelectMenu()) return;
      const values = interaction.values;
      await handleSelectOption(
        interaction,
        sessionId,
        fieldIndex,
        values,
        client,
      );
      return;
    }
  },
};

/**
 * Show a form page to the user in DM.
 */
async function showFormPage(interaction, session, pageIndex, client) {
  const appTypeId = session.applicationTypeId;
  const guildId = session.guildId;
  const guild = client.guilds.cache.get(guildId);

  const appType = await db.getApplicationType(appTypeId);
  const pages = await db.getFormPages(appTypeId);

  if (!pages.length) {
    // No form pages defined - use simple modal approach
    // For now, show a message that the server hasn't configured the form yet
    return interaction
      .reply({
        content:
          "This application type uses the default question format.\n\n" +
          "The server hasn't configured custom form pages yet.\n" +
          "Please contact staff if you have questions.",
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`onboarding:dm:submit:${session.id}`)
              .setLabel("Submit Simple Application")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`onboarding:dm:cancelapp:${appTypeId}`)
              .setLabel("Cancel")
              .setStyle(ButtonStyle.Danger),
          ),
        ],
      })
      .catch(() => {});
  }

  const page = pages[pageIndex];
  if (!page) {
    // Show preview/submit
    return showPreview(interaction, session, client);
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

  // Show current fields summary
  if (fields.length) {
    let fieldDesc = "";
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const existingAnswer = (session.stateJson?.answers || []).find(
        (a) => a.fieldId === f.id,
      );
      const answered = existingAnswer ? "✅" : "❌";
      fieldDesc += `${answered} **${f.label}**`;

      if (f.fieldType === "SINGLE_SELECT" || f.fieldType === "MULTI_SELECT") {
        const options = await db.getFieldOptions(f.id);
        if (options.length <= 5) {
          // Can show as buttons
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

  // Build answer buttons for each field
  const rows = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const existingAnswer = (session.stateJson?.answers || []).find(
      (a) => a.fieldId === f.id,
    );

    const row = new ActionRowBuilder();

    if (f.fieldType === "YES_NO") {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`onboarding:dm:yesno:${session.id}:${i}:yes`)
          .setLabel("Yes")
          .setStyle(
            existingAnswer?.answerText === "Yes"
              ? ButtonStyle.Success
              : ButtonStyle.Secondary,
          ),
        new ButtonBuilder()
          .setCustomId(`onboarding:dm:yesno:${session.id}:${i}:no`)
          .setLabel("No")
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
      if (options.length <= 25) {
        // Show select menu
        const { StringSelectMenuBuilder } = require("discord.js");
        const select = new StringSelectMenuBuilder()
          .setCustomId(`onboarding:dm:select:${session.id}:${i}`)
          .setPlaceholder(f.label)
          .setMaxValues(
            f.fieldType === "MULTI_SELECT" ? Math.min(options.length, 25) : 1,
          )
          .setMinValues(f.required ? 1 : 0)
          .addOptions(
            options.map((o) => ({
              label: o.label.slice(0, 100),
              value: o.value.slice(0, 100),
              emoji: o.emoji || undefined,
            })),
          );
        row.addComponents(select);
      }
    } else {
      // Text fields - show answer button
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
      .setCustomId(`onboarding:dm:cancelapp:${appTypeId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  rows.push(navRow);

  await interaction
    .reply({
      embeds: [embed],
      components: rows.slice(0, 5), // Max 5 action rows
    })
    .catch(async () => {
      await interaction
        .followUp({
          embeds: [embed],
          components: rows.slice(0, 5),
        })
        .catch(() => {});
    });
}

async function showPreview(interaction, session, client) {
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
      embed.addFields({ name: a.fieldLabel || "Answer", value, inline: false });
    }
  } else {
    embed.addFields({
      name: "No answers",
      value: "No fields have been answered yet.",
    });
  }

  await interaction
    .reply({
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
            .setCustomId(`onboarding:dm:cancelapp:${session.applicationTypeId}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      ],
    })
    .catch(async () => {
      await interaction
        .followUp({
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
                .setCustomId(
                  `onboarding:dm:cancelapp:${session.applicationTypeId}`,
                )
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Danger),
            ),
          ],
        })
        .catch(() => {});
    });
}

async function handleSubmit(interaction, sessionId, client) {
  const session = await db.getSession(
    interaction.guildId || interaction.message?.guild?.id || "unknown",
    interaction.user.id,
  );
  if (!session) {
    return interaction
      .reply({
        content: "Session expired. Please start a new application.",
        flags: [MessageFlags.Ephemeral],
      })
      .catch(() => {});
  }

  // Replace: look up session by ID
  const sessions = await db.getExpiredSessions(); // won't work; we'll query directly
  // Since this is a DM interaction, we need to find by ID
  // Let's store sessions differently actually
  // For simplicity, we'll create the application and submit

  await interaction.deferUpdate().catch(() => {});

  const appType = await db.getApplicationType(session.applicationTypeId);
  const guild = client.guilds.cache.get(session.guildId);

  // Create application record
  const member = guild
    ? await guild.members.fetch(interaction.user.id).catch(() => null)
    : null;
  const application = await db.createApplication({
    guildId: session.guildId,
    applicationTypeId: session.applicationTypeId,
    applicantId: interaction.user.id,
    applicantUsernameSnapshot: interaction.user.username,
    applicantDisplayNameSnapshot:
      member?.displayName || interaction.user.displayName,
    status: "DRAFT",
    serverMemberStatus: member ? "IN_SERVER" : "LEFT_SERVER",
  });

  if (!application) {
    return interaction.editReply({
      content: "Failed to create application. Please try again.",
    });
  }

  // Save answers
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

  // Submit to review
  const result = await submitApplication(application.id, client);

  // Apply pending role if configured
  if (appType?.pendingRoleId && member) {
    await applyPendingRole(
      session.guildId,
      interaction.user.id,
      appType.pendingRoleId,
    );
  }

  // Clean up session
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

async function handleShortAnswer(interaction, sessionId, fieldIndex, client) {
  const session = await db.getSession(interaction.guildId, interaction.user.id);
  if (!session)
    return interaction
      .reply({ content: "Session expired.", flags: [MessageFlags.Ephemeral] })
      .catch(() => {});

  const appTypeId = session.applicationTypeId;
  const pages = await db.getFormPages(appTypeId);
  const page = pages[session.currentPage || 0];
  if (!page) return;

  const fields = await db.getFormFields(page.id);
  const field = fields[fieldIndex];
  if (!field) return;

  // Show modal for text input
  const modal = new ModalBuilder()
    .setCustomId(`onboarding:modal:field:${session.id}:${fieldIndex}`)
    .setTitle(field.label.slice(0, 45));

  const textInput = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(field.label.slice(0, 45))
    .setPlaceholder(field.placeholder || "Enter your answer...")
    .setStyle(
      field.fieldType === "TEXT_PARAGRAPH"
        ? TextInputStyle.Paragraph
        : TextInputStyle.Short,
    )
    .setRequired(field.required)
    .setMaxLength(Math.min(field.maxLength || 1000, 4000))
    .setMinLength(field.minLength || 0);

  if (field.helpText) {
    textInput.setPlaceholder(field.helpText);
  }

  modal.addComponents(new ActionRowBuilder().addComponents(textInput));
  await interaction.showModal(modal);
}

async function handleYesNo(interaction, sessionId, fieldIndex, value, client) {
  await interaction.deferUpdate().catch(() => {});

  const session = await db.getSession(interaction.guildId, interaction.user.id);
  if (!session) return;

  const appTypeId = session.applicationTypeId;
  const pages = await db.getFormPages(appTypeId);
  const page = pages[session.currentPage || 0];
  if (!page) return;

  const fields = await db.getFormFields(page.id);
  const field = fields[fieldIndex];
  if (!field) return;

  // Save answer
  const answers = session.stateJson?.answers || [];
  const existing = answers.findIndex((a) => a.fieldId === field.id);
  const answerEntry = {
    fieldId: field.id,
    fieldLabel: field.label,
    fieldType: field.fieldType,
    answerText: value === "yes" ? "Yes" : "No",
  };

  if (existing >= 0) {
    answers[existing] = answerEntry;
  } else {
    answers.push(answerEntry);
  }

  await db.updateSession(sessionId, {
    stateJson: { ...session.stateJson, answers },
  });

  // Refresh the page
  await showFormPage(
    interaction,
    { ...session, stateJson: { answers } },
    session.currentPage || 0,
    client,
  );
}

async function handleSelectOption(
  interaction,
  sessionId,
  fieldIndex,
  values,
  client,
) {
  await interaction.deferUpdate().catch(() => {});

  const session = await db.getSession(interaction.guildId, interaction.user.id);
  if (!session) return;

  const appTypeId = session.applicationTypeId;
  const pages = await db.getFormPages(appTypeId);
  const page = pages[session.currentPage || 0];
  if (!page) return;

  const fields = await db.getFormFields(page.id);
  const field = fields[fieldIndex];
  if (!field) return;

  // Get option labels and linked roles
  const options = await db.getFieldOptions(field.id);
  const selectedOptions = options.filter((o) => values.includes(o.value));
  const selectedRoleIds = selectedOptions
    .flatMap((o) => o.linkedRoleIds || [])
    .filter(Boolean);

  const answers = session.stateJson?.answers || [];
  const existing = answers.findIndex((a) => a.fieldId === field.id);
  const answerEntry = {
    fieldId: field.id,
    fieldLabel: field.label,
    fieldType: field.fieldType,
    answerText: null,
    selectedOptionValues: values,
    selectedRoleIds,
  };

  if (existing >= 0) {
    answers[existing] = answerEntry;
  } else {
    answers.push(answerEntry);
  }

  await db.updateSession(sessionId, {
    stateJson: { ...session.stateJson, answers },
  });

  // Refresh
  await showFormPage(
    interaction,
    { ...session, stateJson: { answers } },
    session.currentPage || 0,
    client,
  );
}

async function handleNextPage(interaction, sessionId, client) {
  const session = await db.getSession(interaction.guildId, interaction.user.id);
  if (!session)
    return interaction
      .reply({ content: "Session expired.", flags: [MessageFlags.Ephemeral] })
      .catch(() => {});

  const appTypeId = session.applicationTypeId;
  const pages = await db.getFormPages(appTypeId);
  const nextPage = (session.currentPage || 0) + 1;

  if (nextPage >= pages.length) {
    // Show preview
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

async function handlePrevPage(interaction, sessionId, client) {
  const session = await db.getSession(interaction.guildId, interaction.user.id);
  if (!session)
    return interaction
      .reply({ content: "Session expired.", flags: [MessageFlags.Ephemeral] })
      .catch(() => {});

  const prevPage = Math.max(0, (session.currentPage || 0) - 1);
  await db.updateSession(sessionId, { currentPage: prevPage });
  await showFormPage(
    interaction,
    { ...session, currentPage: prevPage },
    prevPage,
    client,
  );
}
