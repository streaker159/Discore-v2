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
    const action = parts[2]; // panelchannel, reviewchannel, userapp, permrole, removeperm, builder flows

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

    /** ── Permission Group Role Selects ── **/
    if (action === "permgroup") {
      if (!interaction.isRoleSelectMenu()) return;
      const group = parts[3];
      const roleIds = interaction.values || [];
      const flagsByGroup = {
        manage: {
          canManage: true,
          canBuildForms: true,
          canReview: true,
          canApproveDeny: true,
          canOpenThreads: true,
          canDownload: true,
          canDelete: true,
        },
        review: {
          canReview: true,
          canOpenThreads: true,
        },
        approve: {
          canReview: true,
          canApproveDeny: true,
          canOpenThreads: true,
        },
        download: {
          canReview: true,
          canDownload: true,
        },
        delete: {
          canReview: true,
          canApproveDeny: true,
          canDownload: true,
          canDelete: true,
        },
      };
      const flags = flagsByGroup[group] || {};

      for (const roleId of roleIds) {
        await db.setPermissionRole({ guildId, roleId, ...flags });
      }

      const payload = await adminUi.buildPermissionsPayload(guildId);
      await interaction.reply({
        content: roleIds.length
          ? `Saved ${roleIds.length} role(s) for ${group} permissions.`
          : "No roles selected. Existing permission roles were not removed.",
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Application Type Manager Select ── **/
    if (action === "typeadmin") {
      if (!interaction.isStringSelectMenu()) return;
      const appTypeId = interaction.values?.[0];
      const payload = await adminUi.buildTypeManagerPayload(guildId, appTypeId);
      await interaction.reply({
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Open Form Page ── **/
    if (action === "openpage") {
      if (!interaction.isStringSelectMenu()) return;
      const pageId = interaction.values?.[0];
      const payload = await adminUi.buildPageBuilderPayload(pageId);
      await interaction.reply({
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Field Type Choice opens field config modal ── **/
    if (action === "fieldtype") {
      if (!interaction.isStringSelectMenu()) return;
      const pageId = parts[3];
      const fieldType = interaction.values?.[0];
      const {
        ModalBuilder,
        TextInputBuilder,
        TextInputStyle,
      } = require("discord.js");

      const modal = new ModalBuilder()
        .setCustomId(`onboarding:modal:addfield:${pageId}:${fieldType}`)
        .setTitle(`Add ${adminUi.fieldTypeLabel(fieldType)}`.slice(0, 45));

      const labelInput = new TextInputBuilder()
        .setCustomId("label")
        .setLabel("Question / Label")
        .setPlaceholder("What is your in-game name?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

      const helpInput = new TextInputBuilder()
        .setCustomId("helpText")
        .setLabel("Help text (optional)")
        .setPlaceholder("Short guidance shown to applicants")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(300);

      const requiredInput = new TextInputBuilder()
        .setCustomId("required")
        .setLabel("Required? yes/no")
        .setPlaceholder("yes")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(5);

      const settingsInput = new TextInputBuilder()
        .setCustomId("settings")
        .setLabel("Settings")
        .setPlaceholder(
          "Text: min=1 max=100 | Multi: min=1 max=3 | File: types=png,jpg maxmb=8",
        )
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100);

      const optionsInput = new TextInputBuilder()
        .setCustomId("options")
        .setLabel("Options (one per line, if choice field)")
        .setPlaceholder("Mobile\nPC\nBoth")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(800);

      modal.addComponents(
        new ActionRowBuilder().addComponents(labelInput),
        new ActionRowBuilder().addComponents(helpInput),
        new ActionRowBuilder().addComponents(requiredInput),
        new ActionRowBuilder().addComponents(settingsInput),
        new ActionRowBuilder().addComponents(optionsInput),
      );

      await interaction.showModal(modal);
      return;
    }

    /** ── Field Manager Select ── **/
    if (action === "fieldadmin") {
      if (!interaction.isStringSelectMenu()) return;
      const fieldId = interaction.values?.[0];
      const payload = await adminUi.buildFieldManagerPayload(fieldId);
      await interaction.reply({
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Select type for role routing ── **/
    if (action === "routingtype") {
      if (!interaction.isStringSelectMenu()) return;
      const appTypeId = interaction.values?.[0];
      const fields = await db.getAllFormFieldsForType(appTypeId);
      if (!fields.length) {
        await interaction.reply({
          content:
            "This application type has no fields yet. Build the form before adding answer-based role rules.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      await interaction.reply({
        content: "Select the field whose answer should trigger roles:",
        components: [
          new ActionRowBuilder().addComponents(
            new (require("discord.js").StringSelectMenuBuilder)()
              .setCustomId(`onboarding:select:routingfield:${appTypeId}`)
              .setPlaceholder("Select trigger field")
              .addOptions(
                fields.slice(0, 25).map((f) => ({
                  label: f.label.slice(0, 100),
                  value: f.id,
                  description: adminUi
                    .fieldTypeLabel(f.fieldType)
                    .slice(0, 100),
                })),
              ),
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Select field condition for role routing ── **/
    if (action === "routingfield") {
      if (!interaction.isStringSelectMenu()) return;
      const appTypeId = parts[3];
      const fieldId = interaction.values?.[0];
      const options = await db.getFieldOptions(fieldId);
      const fieldRows = await require("../../../lib/prisma")
        .$queryRawUnsafe(
          `SELECT * FROM "OnboardingFormField" WHERE "id" = $1`,
          fieldId,
        )
        .catch(() => []);
      const field = fieldRows?.[0];
      const values = options.length
        ? options.map((o) => ({
            label: o.label.slice(0, 100),
            value: o.value.slice(0, 100),
          }))
        : [
            { label: "Yes", value: "Yes" },
            { label: "No", value: "No" },
            { label: "Any answered value", value: "__ANY__" },
          ];

      await interaction.reply({
        content: `Selected field: **${field?.label || "Field"}**. Choose the answer/option condition:`,
        components: [
          new ActionRowBuilder().addComponents(
            new (require("discord.js").StringSelectMenuBuilder)()
              .setCustomId(
                `onboarding:select:routingcondition:${appTypeId}:${fieldId}`,
              )
              .setPlaceholder("Select answer condition")
              .addOptions(values.slice(0, 25)),
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Select condition, then roles to add ── **/
    if (action === "routingcondition") {
      if (!interaction.isStringSelectMenu()) return;
      const appTypeId = parts[3];
      const fieldId = parts[4];
      const condition = interaction.values?.[0] || "__ANY__";
      await interaction.reply({
        content: `Condition saved: **${condition}**. Select role(s) to add when this condition matches. Rules apply on approval by default.`,
        components: [
          new ActionRowBuilder().addComponents(
            new (require("discord.js").RoleSelectMenuBuilder)()
              .setCustomId(
                `onboarding:select:routingroles:${appTypeId}:${fieldId}:${encodeURIComponent(condition)}`.slice(
                  0,
                  100,
                ),
              )
              .setPlaceholder("Roles to add on approval")
              .setMinValues(1)
              .setMaxValues(10),
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Finalize role routing rule ── **/
    if (action === "routingroles") {
      if (!interaction.isRoleSelectMenu()) return;
      const appTypeId = parts[3];
      const fieldId = parts[4];
      const condition =
        decodeURIComponent(parts.slice(5).join(":")) || "__ANY__";
      const roleIds = interaction.values || [];
      await db.createRoleRule({
        guildId,
        applicationTypeId: appTypeId,
        triggerType: "ANSWER",
        triggerFieldId: fieldId,
        triggerOptionValue: condition,
        applyWhen: "APPROVED",
        rolesToAdd: roleIds,
        rolesToRemove: [],
        requiresStaffConfirm: false,
      });
      const payload = await adminUi.buildRoleRoutingPayload(guildId, appTypeId);
      await interaction.reply({
        content: `Saved role rule. Add on approval: ${roleIds.map((id) => `<@&${id}>`).join(" ")}`,
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Action / Review type switching ── **/
    if (action === "actiontype") {
      if (!interaction.isStringSelectMenu()) return;
      const payload = await adminUi.buildActionsPayload(
        guildId,
        interaction.values?.[0],
      );
      await interaction.reply({ ...payload, flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (action === "reviewtype") {
      if (!interaction.isStringSelectMenu()) return;
      const payload = await adminUi.buildReviewBehaviourPayload(
        guildId,
        interaction.values?.[0],
      );
      await interaction.reply({ ...payload, flags: [MessageFlags.Ephemeral] });
      return;
    }

    /** ── Application type button style ── **/
    if (action === "typestyle") {
      if (!interaction.isStringSelectMenu()) return;
      const appTypeId = parts[3];
      const style = interaction.values?.[0];
      await db.updateApplicationType(appTypeId, { buttonStyle: style });
      const payload = await adminUi.buildTypeManagerPayload(guildId, appTypeId);
      await interaction.reply({
        content: `Saved button style: ${style}.`,
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Per-application-type review channel ── **/
    if (action === "typereview") {
      if (!interaction.isChannelSelectMenu()) return;
      const appTypeId = parts[3];
      const channelId = interaction.values?.[0] || null;
      await db.updateApplicationType(appTypeId, { reviewChannelId: channelId });
      const payload = await adminUi.buildReviewBehaviourPayload(
        guildId,
        appTypeId,
      );
      await interaction.reply({
        content: `Saved review channel override: ${channelId ? `<#${channelId}>` : "default"}.`,
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    /** ── Accepted / denied / pending action roles ── **/
    if (action === "setroles") {
      if (!interaction.isRoleSelectMenu()) return;
      const roleKind = parts[3];
      const appTypeId = parts[4];
      const roleIds = interaction.values || [];
      const updates = {};
      if (roleKind === "accept") updates.acceptRoleIds = roleIds;
      if (roleKind === "remove") updates.removeRoleIds = roleIds;
      if (roleKind === "pending") updates.pendingRoleId = roleIds[0] || null;
      if (roleKind === "denied") updates.denyRoleId = roleIds[0] || null;

      await db.updateApplicationType(appTypeId, updates);
      const payload = await adminUi.buildActionsPayload(guildId, appTypeId);
      await interaction.reply({
        content: "Saved action roles.",
        ...payload,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
  },
};
