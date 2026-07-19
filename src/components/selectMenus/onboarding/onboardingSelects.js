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

async function respondAdmin(interaction, payload) {
  const cleanPayload = {
    content: payload.content || "",
    embeds: payload.embeds || [],
    components: payload.components || [],
  };

  if (interaction.isMessageComponent?.()) {
    try {
      return await interaction.update(cleanPayload);
    } catch {}
  }

  return interaction.reply({
    ...cleanPayload,
    flags: [MessageFlags.Ephemeral],
  });
}

function fieldPlaceholder(fieldType) {
  const placeholders = {
    TEXT_SHORT: "What is your server name?",
    TEXT_PARAGRAPH: "Why do you want to join?",
    YES_NO: "Do you manage or run a server?",
    SINGLE_SELECT: "What platform do you play on?",
    MULTI_SELECT: "Which roles are you interested in?",
    USER_SELECT: "Which user should staff review?",
    ROLE_SELECT: "Which role applies to you?",
    MENTIONABLE_SELECT: "Who or what should staff check?",
    CHANNEL_SELECT: "Which channel should staff look at?",
    FILE_UPLOAD: "Upload proof, screenshot, or server image",
    CONFIRMATION: "Do you agree to the rules?",
  };
  return placeholders[fieldType] || "Write the question applicants should see";
}

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
      const config = await db.getConfig(guildId);
      const payload = await adminUi.buildWizardPayload(
        interaction.guild,
        config,
        3,
      );

      await respondAdmin(interaction, {
        content: `Panel channel saved: <#${channelId}>`,
        ...payload,
      });
      return;
    }

    /** ── Review Channel Select ── **/
    if (action === "reviewchannel") {
      if (!interaction.isChannelSelectMenu()) return;
      const channelId = interaction.values?.[0];
      if (!channelId) return;

      await db.updateConfig(guildId, { defaultReviewChannelId: channelId });
      const config = await db.getConfig(guildId);
      const payload = await adminUi.buildWizardPayload(
        interaction.guild,
        config,
        4,
      );

      await respondAdmin(interaction, {
        content: `Review channel saved: <#${channelId}>`,
        ...payload,
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
      await respondAdmin(interaction, {
        content: roleIds.length
          ? `Saved ${roleIds.length} role(s) for ${group} permissions.`
          : "No roles selected. Existing permission roles were not removed.",
        ...payload,
      });
      return;
    }

    /** ── Application Type Manager Select ── **/
    if (action === "typeadmin") {
      if (!interaction.isStringSelectMenu()) return;
      const appTypeId = interaction.values?.[0];
      const payload = await adminUi.buildTypeManagerPayload(guildId, appTypeId);
      await respondAdmin(interaction, payload);
      return;
    }

    /** ── Open Form Page ── **/
    if (action === "openpage") {
      if (!interaction.isStringSelectMenu()) return;
      const pageId = interaction.values?.[0];
      const payload = await adminUi.buildPageBuilderPayload(pageId);
      await respondAdmin(interaction, payload);
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
        .setLabel("Question")
        .setPlaceholder(fieldPlaceholder(fieldType))
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

      const helpInput = new TextInputBuilder()
        .setCustomId("helpText")
        .setLabel("Applicant helper text")
        .setPlaceholder("Optional. Keep this short and clear.")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(300);

      modal.addComponents(new ActionRowBuilder().addComponents(labelInput));

      if (fieldType === "TEXT_SHORT" || fieldType === "TEXT_PARAGRAPH") {
        modal.addComponents(
          new ActionRowBuilder().addComponents(helpInput),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("settings")
              .setLabel("Answer length")
              .setPlaceholder("Optional: min=2 max=200")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(60),
          ),
        );
      } else if (
        fieldType === "SINGLE_SELECT" ||
        fieldType === "MULTI_SELECT"
      ) {
        modal.addComponents(
          new ActionRowBuilder().addComponents(helpInput),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("options")
              .setLabel("Choices - one per line")
              .setPlaceholder("Mobile\nPC\nBoth")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(800),
          ),
        );
        if (fieldType === "MULTI_SELECT") {
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("settings")
                .setLabel("How many can they pick?")
                .setPlaceholder("Optional: min=1 max=3")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(60),
            ),
          );
        }
      } else if (fieldType === "FILE_UPLOAD") {
        modal.addComponents(
          new ActionRowBuilder().addComponents(helpInput),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("settings")
              .setLabel("Allowed file types and max size")
              .setPlaceholder("Optional: types=png,jpg,pdf maxmb=8")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(80),
          ),
        );
      } else if (
        fieldType === "USER_SELECT" ||
        fieldType === "ROLE_SELECT" ||
        fieldType === "MENTIONABLE_SELECT" ||
        fieldType === "CHANNEL_SELECT"
      ) {
        modal.addComponents(new ActionRowBuilder().addComponents(helpInput));
      }

      await interaction.showModal(modal);
      return;
    }

    /** ── Field Manager Select ── **/
    if (action === "fieldadmin") {
      if (!interaction.isStringSelectMenu()) return;
      const fieldId = interaction.values?.[0];
      const payload = await adminUi.buildFieldManagerPayload(fieldId);
      await respondAdmin(interaction, payload);
      return;
    }

    /** ── Select type for role routing ── **/
    if (action === "routingtype") {
      if (!interaction.isStringSelectMenu()) return;
      const appTypeId = interaction.values?.[0];
      const fields = await db.getAllFormFieldsForType(appTypeId);
      if (!fields.length) {
        await respondAdmin(interaction, {
          content:
            "This application type has no fields yet. Build the form before adding answer-based role rules.",
          components: [],
        });
        return;
      }
      await respondAdmin(interaction, {
        content: "Select the field whose answer should trigger roles:",
        components: [
          new ActionRowBuilder().addComponents(
            new (require("discord.js").StringSelectMenuBuilder)()
              .setCustomId("onboarding:select:routingfield")
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
      });
      return;
    }

    /** ── Select field condition for role routing ── **/
    if (action === "routingfield") {
      if (!interaction.isStringSelectMenu()) return;
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
        ? options.map((o, index) => ({
            label: o.label.slice(0, 100),
            value: `opt:${index}`,
          }))
        : [
            { label: "Yes", value: "yes" },
            { label: "No", value: "no" },
            { label: "Any answered value", value: "any" },
          ];

      await respondAdmin(interaction, {
        content: `Selected field: **${field?.label || "Field"}**. Choose the answer/option condition:`,
        components: [
          new ActionRowBuilder().addComponents(
            new (require("discord.js").StringSelectMenuBuilder)()
              .setCustomId(`onboarding:select:routingcondition:${fieldId}`)
              .setPlaceholder("Select answer condition")
              .addOptions(values.slice(0, 25)),
          ),
        ],
      });
      return;
    }

    /** ── Select condition, then roles to add ── **/
    if (action === "routingcondition") {
      if (!interaction.isStringSelectMenu()) return;
      const fieldId = parts[3];
      const conditionKey = interaction.values?.[0] || "any";
      const condition = await resolveRoutingCondition(fieldId, conditionKey);
      await respondAdmin(interaction, {
        content: `Condition saved: **${condition}**. Select role(s) to add when this condition matches. Rules apply on approval by default.`,
        components: [
          new ActionRowBuilder().addComponents(
            new (require("discord.js").RoleSelectMenuBuilder)()
              .setCustomId(
                `onboarding:select:routingroles:${fieldId}:${conditionKey}`,
              )
              .setPlaceholder("Roles to add on approval")
              .setMinValues(1)
              .setMaxValues(10),
          ),
        ],
      });
      return;
    }

    /** ── Finalize role routing rule ── **/
    if (action === "routingroles") {
      if (!interaction.isRoleSelectMenu()) return;
      const fieldId = parts[3];
      const conditionKey = parts[4] || "any";
      const condition = await resolveRoutingCondition(fieldId, conditionKey);
      const roleIds = interaction.values || [];
      const fieldRows = await require("../../../lib/prisma")
        .$queryRawUnsafe(
          `SELECT * FROM "OnboardingFormField" WHERE "id" = $1`,
          fieldId,
        )
        .catch(() => []);
      const appTypeId = fieldRows?.[0]?.applicationTypeId;
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
      await respondAdmin(interaction, {
        content: `Saved role rule. Add on approval: ${roleIds.map((id) => `<@&${id}>`).join(" ")}`,
        ...payload,
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
      await respondAdmin(interaction, payload);
      return;
    }

    if (action === "reviewtype") {
      if (!interaction.isStringSelectMenu()) return;
      const payload = await adminUi.buildReviewBehaviourPayload(
        guildId,
        interaction.values?.[0],
      );
      await respondAdmin(interaction, payload);
      return;
    }

    /** ── Application type button style ── **/
    if (action === "typestyle") {
      if (!interaction.isStringSelectMenu()) return;
      const appTypeId = parts[3];
      const style = interaction.values?.[0];
      await db.updateApplicationType(appTypeId, { buttonStyle: style });
      const payload = await adminUi.buildTypeManagerPayload(guildId, appTypeId);
      await respondAdmin(interaction, {
        content: `Saved button style: ${style}.`,
        ...payload,
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
      await respondAdmin(interaction, {
        content: `Saved review channel override: ${channelId ? `<#${channelId}>` : "default"}.`,
        ...payload,
      });
      return;
    }

    /** ── Accepted / denied / pending action roles ── **/
    if (action === "setroles") {
      if (!interaction.isRoleSelectMenu()) return;
      const roleKind = parts[3];
      const appTypeId = parts[4];
      const maxRoles = roleKind === "pending" || roleKind === "denied" ? 1 : 5;
      const roleIds = (interaction.values || []).slice(0, maxRoles);
      const updates = {};
      if (roleKind === "accept") updates.acceptRoleIds = roleIds;
      if (roleKind === "remove") updates.removeRoleIds = roleIds;
      if (roleKind === "pending") updates.pendingRoleId = roleIds[0] || null;
      if (roleKind === "denied") updates.denyRoleId = roleIds[0] || null;

      await db.updateApplicationType(appTypeId, updates);
      const payload = await adminUi.buildActionsPayload(guildId, appTypeId);
      await respondAdmin(interaction, {
        content: "Saved action roles.",
        ...payload,
      });
      return;
    }
  },
};

async function resolveRoutingCondition(fieldId, conditionKey) {
  if (conditionKey === "any") return "__ANY__";
  if (conditionKey === "yes") return "Yes";
  if (conditionKey === "no") return "No";

  if (conditionKey?.startsWith("opt:")) {
    const index = parseInt(conditionKey.slice(4), 10);
    const options = await db.getFieldOptions(fieldId);
    return options[index]?.value || "__ANY__";
  }

  return "__ANY__";
}
