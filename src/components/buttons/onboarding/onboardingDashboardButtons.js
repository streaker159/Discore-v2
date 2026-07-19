"use strict";

const {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  StringSelectMenuBuilder,
} = require("discord.js");
const db = require("../../../modules/onboarding/onboardingDb");
const adminUi = require("../../../modules/onboarding/onboardingAdminUi");
const {
  showDashboard,
} = require("../../../commands/public/onboarding/onboarding");
const {
  isOnboardingPremiumActive,
  requireOnboardingPremium,
} = require("../../../modules/onboarding/onboardingPremium");
const {
  requirePermission,
  getMemberPermissions,
} = require("../../../modules/onboarding/onboardingPermissions");
const {
  publishPanel,
} = require("../../../modules/onboarding/onboardingService");
const {
  buildSimpleEmbed,
  formatAppNumber,
} = require("../../../modules/onboarding/onboardingEmbeds");
const {
  generateApplicationReceipt,
} = require("../../../modules/onboarding/onboardingReceipts");

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

/**
 * Shared handler for all admin-centric onboarding button interactions.
 *
 * Registered with multiple customIdPrefix values so the component loader
 * (longest-prefix step 4) can route here without shadowing other
 * "onboarding:*" handlers (review, apply, dm, modal, select).
 */
async function handle(interaction, client) {
  const customId = interaction.customId;
  const guildId = interaction.guildId;

  if (!guildId) return;

  /** ── Dashboard Buttons ── **/

  // Close
  if (customId === "onboarding:dash:close") {
    await interaction
      .update({ content: "Dashboard closed.", embeds: [], components: [] })
      .catch(() => {});
    return;
  }

  // Setup Wizard
  if (customId === "onboarding:dash:setup") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const config = await db.ensureConfig(guildId);
    const payload = await adminUi.buildWizardPayload(
      interaction.guild,
      config,
      1,
    );
    await respondAdmin(interaction, payload);
    return;
  }

  // Application Types
  if (customId === "onboarding:dash:types") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const payload = await adminUi.buildApplicationTypesPayload(guildId);
    await respondAdmin(interaction, payload);
    return;
  }

  // Create new application type
  if (customId === "onboarding:type:create") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const canManage = await requirePermission(interaction, "canManage");
    if (!canManage) return;

    // Show a modal for creating an application type
    const {
      ModalBuilder,
      TextInputBuilder,
      TextInputStyle,
    } = require("discord.js");

    const modal = new ModalBuilder()
      .setCustomId("onboarding:modal:createtype")
      .setTitle("Create Application Type");

    const nameInput = new TextInputBuilder()
      .setCustomId("name")
      .setLabel("Internal Name")
      .setPlaceholder("e.g., new_member")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(50);

    const titleInput = new TextInputBuilder()
      .setCustomId("publicTitle")
      .setLabel("Public Title")
      .setPlaceholder("e.g., New Member Application")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(80);

    const descInput = new TextInputBuilder()
      .setCustomId("publicDescription")
      .setLabel("Public Description")
      .setPlaceholder("Brief description shown on the panel button")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(200);

    const btnLabelInput = new TextInputBuilder()
      .setCustomId("buttonLabel")
      .setLabel("Button Label")
      .setPlaceholder("Apply Now")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(80);

    const instructionsInput = new TextInputBuilder()
      .setCustomId("instructions")
      .setLabel("Instructions (shown before starting)")
      .setPlaceholder("Please fill in all fields honestly...")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(btnLabelInput),
      new ActionRowBuilder().addComponents(instructionsInput),
    );

    await interaction.showModal(modal);
    return;
  }

  // Publish
  if (customId === "onboarding:dash:publish") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const canManage = await requirePermission(interaction, "canManage");
    if (!canManage) return;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const result = await publishPanel(guildId, client);

    if (result.success) {
      await interaction.editReply({
        content: `✅ Panel ${result.action} successfully!\nMessage ID: ${result.messageId}`,
      });
    } else {
      await interaction.editReply({
        content: `❌ Failed to publish panel: ${result.error}`,
      });
    }
    return;
  }

  // Repair
  if (customId === "onboarding:dash:repair") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const canManage = await requirePermission(interaction, "canManage");
    if (!canManage) return;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // Clear panel message ID and republish
    await db.updateConfig(guildId, { panelMessageId: null });
    const result = await publishPanel(guildId, client);

    if (result.success) {
      await interaction.editReply({
        content: `✅ Panel repaired and published successfully!\nNew Message ID: ${result.messageId}`,
      });
    } else {
      await interaction.editReply({
        content: `❌ Failed to repair panel: ${result.error}`,
      });
    }
    return;
  }

  // Toggle enable/disable
  if (customId === "onboarding:dash:toggle") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const canManage = await requirePermission(interaction, "canManage");
    if (!canManage) return;

    const config = await db.getConfig(guildId);
    const newEnabled = !config?.enabled;

    const updatedConfig = await db.updateConfig(guildId, {
      enabled: newEnabled,
    });

    await interaction.deferUpdate().catch(() => {});

    // Refresh the dashboard in place
    await showDashboard(
      interaction,
      client,
      updatedConfig || { ...config, enabled: newEnabled },
      await isOnboardingPremiumActive(guildId),
    );
    return;
  }

  // View Applications
  if (customId === "onboarding:dash:viewapp") {
    await interaction.reply({
      embeds: [
        buildSimpleEmbed(
          "🔍 View Applications",
          "Choose how you want to search for applications:",
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("onboarding:view:latest")
            .setLabel("Latest Applications")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📋"),
          new ButtonBuilder()
            .setCustomId("onboarding:view:search")
            .setLabel("Search by ID")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🔢"),
          new ButtonBuilder()
            .setCustomId("onboarding:view:user")
            .setLabel("Search by User")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("👤"),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("onboarding:dash:back")
            .setLabel("Back to Dashboard")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⬅️"),
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Review Queue
  if (customId === "onboarding:dash:review") {
    const pending = await db.getApplicationsByStatus(guildId, "PENDING", 10);

    if (!pending.length) {
      await interaction.reply({
        embeds: [
          buildSimpleEmbed(
            "📝 Review Queue",
            "No pending applications to review.",
            "#57f287",
          ),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("onboarding:dash:back")
              .setLabel("Back to Dashboard")
              .setStyle(ButtonStyle.Secondary)
              .setEmoji("⬅️"),
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("📝 Review Queue")
      .setDescription(`${pending.length} pending application(s)`)
      .setColor("#5865F2");

    for (const app of pending.slice(0, 10)) {
      embed.addFields({
        name: `Application #${formatAppNumber(app.applicationNumber)}`,
        value: `Applicant: <@${app.applicantId}>\nSubmitted: ${app.submittedAt ? new Date(app.submittedAt).toLocaleString() : "N/A"}`,
        inline: true,
      });
    }

    const rows = [];
    for (const app of pending.slice(0, 5)) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`onboarding:review:view:${app.id}`)
            .setLabel(`#${formatAppNumber(app.applicationNumber)}`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji("👁️"),
          new ButtonBuilder()
            .setCustomId(`onboarding:review:approve:${app.id}`)
            .setLabel("Approve")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`onboarding:review:deny:${app.id}`)
            .setLabel("Deny")
            .setStyle(ButtonStyle.Danger),
        ),
      );
    }

    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("onboarding:dash:back")
          .setLabel("Back to Dashboard")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("⬅️"),
      ),
    );

    await interaction.reply({
      embeds: [embed],
      components: rows,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Settings
  if (customId === "onboarding:dash:settings") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const config = await db.getConfig(guildId);

    await interaction.reply({
      embeds: [
        buildSimpleEmbed(
          "⚙️ Settings",
          `**Panel Channel:** ${config?.panelChannelId ? `<#${config.panelChannelId}>` : "Not set"}\n` +
            `**Review Channel:** ${config?.defaultReviewChannelId ? `<#${config.defaultReviewChannelId}>` : "Not set"}\n` +
            `**Enabled:** ${config?.enabled ? "Yes" : "No"}\n` +
            `**DM Flow:** ${config?.allowDmFlow !== false ? "Enabled" : "Disabled"}\n` +
            `**Draft Expiry:** ${config?.draftExpiryHours || 72} hours\n` +
            `**Keep Applications:** ${config?.keepSubmittedApplications !== false ? "Yes" : "No"}\n` +
            `**Server Icon:** ${config?.useServerIcon !== false ? "Yes" : "No"}\n` +
            `**Server Banner:** ${config?.useServerBanner ? "Yes" : "No"}\n` +
            `**Discore Branding:** ${config?.showDiscoreBranding !== false ? "Yes" : "No"}\n`,
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("onboarding:dash:configpanel")
            .setLabel("Set Panel Channel")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📌"),
          new ButtonBuilder()
            .setCustomId("onboarding:dash:configreview")
            .setLabel("Set Review Channel")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📋"),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("onboarding:dash:back")
            .setLabel("Back to Dashboard")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⬅️"),
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Permissions
  if (customId === "onboarding:dash:permissions") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const payload = await adminUi.buildPermissionsPayload(guildId);
    await respondAdmin(interaction, payload);
    return;
  }

  // Role Routing
  if (customId === "onboarding:dash:routing") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const payload = await adminUi.buildRoleRoutingPayload(guildId);
    await respondAdmin(interaction, payload);
    return;
  }

  // Accepted / Denied Action Builder
  if (customId === "onboarding:dash:actions") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const payload = await adminUi.buildActionsPayload(guildId);
    await respondAdmin(interaction, payload);
    return;
  }

  // Review Behaviour
  if (customId === "onboarding:dash:reviewsettings") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const payload = await adminUi.buildReviewBehaviourPayload(guildId);
    await respondAdmin(interaction, payload);
    return;
  }

  // Panel Design
  if (customId === "onboarding:dash:paneldesign") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const config = await db.getConfig(guildId);
    const payload = await adminUi.buildPanelDesignPayload(
      interaction.guild,
      config,
    );
    await respondAdmin(interaction, payload);
    return;
  }

  // Back to Dashboard
  if (customId === "onboarding:dash:back") {
    const config = await db.getConfig(guildId);
    const premiumActive = await isOnboardingPremiumActive(guildId);

    await showDashboard(interaction, client, config, premiumActive);
    return;
  }

  // Config Panel Channel
  if (customId === "onboarding:dash:configpanel") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    await respondAdmin(interaction, {
      content: "Select a channel for the public application panel:",
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId("onboarding:select:panelchannel")
            .setPlaceholder("Select a panel channel...")
            .setChannelTypes([ChannelType.GuildText]),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("onboarding:dash:back")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⬅️"),
        ),
      ],
    });
    return;
  }

  // Config Review Channel
  if (customId === "onboarding:dash:configreview") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    await respondAdmin(interaction, {
      content: "Select a channel for the application review queue:",
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId("onboarding:select:reviewchannel")
            .setPlaceholder("Select a review channel...")
            .setChannelTypes([ChannelType.GuildText]),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("onboarding:dash:back")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⬅️"),
        ),
      ],
    });
    return;
  }

  // Preview User Flow
  if (customId === "onboarding:dash:preview") {
    const config = await db.getConfig(guildId);
    const payload = await adminUi.buildPreviewFlowPayload(
      interaction.guild,
      config,
    );

    await respondAdmin(interaction, payload);
    return;
  }

  // View Latest Applications
  if (customId === "onboarding:view:latest") {
    const apps = await db.getLatestApplications(guildId, 10);
    if (!apps.length) {
      await interaction.reply({
        content: "No applications found.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("📋 Latest Applications")
      .setColor("#5865F2");

    for (const app of apps) {
      embed.addFields({
        name: `#${formatAppNumber(app.applicationNumber)} — ${app.status}`,
        value: `<@${app.applicantId}> — ${app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : "Draft"}`,
        inline: true,
      });
    }

    await interaction.reply({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("onboarding:dash:back")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⬅️"),
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Search by ID - will trigger modal
  if (customId === "onboarding:view:search") {
    const {
      ModalBuilder,
      TextInputBuilder,
      TextInputStyle,
    } = require("discord.js");

    const modal = new ModalBuilder()
      .setCustomId("onboarding:modal:search")
      .setTitle("Search Application");

    const idInput = new TextInputBuilder()
      .setCustomId("searchId")
      .setLabel("Application ID (e.g., 1, 0001, #0001)")
      .setPlaceholder("1")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10);

    modal.addComponents(new ActionRowBuilder().addComponents(idInput));

    await interaction.showModal(modal);
    return;
  }

  // Search by User - open user select
  if (customId === "onboarding:view:user") {
    await interaction.reply({
      content: "Select a user to view their application history:",
      components: [
        new ActionRowBuilder().addComponents(
          new (require("discord.js").UserSelectMenuBuilder)()
            .setCustomId("onboarding:select:userapp")
            .setPlaceholder("Select a user..."),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("onboarding:dash:back")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⬅️"),
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Add Permission Role
  if (customId === "onboarding:perm:add") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const canManage = await requirePermission(interaction, "canManage");
    if (!canManage) return;

    await interaction.reply({
      content: "Select a role to add onboarding permissions to:",
      components: [
        new ActionRowBuilder().addComponents(
          new (require("discord.js").RoleSelectMenuBuilder)()
            .setCustomId("onboarding:select:permrole")
            .setPlaceholder("Select a role..."),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("onboarding:dash:back")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⬅️"),
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  /** ── Wizard Step 1: Enable ── */
  if (customId === "onboarding:wizard:step1") {
    const config = await db.getConfig(guildId);
    const payload = await adminUi.buildWizardPayload(
      interaction.guild,
      config,
      1,
    );
    await respondAdmin(interaction, payload);
    return;
  }

  if (customId.startsWith("onboarding:wizard:step:")) {
    const step = parseInt(customId.split(":")[3], 10) || 1;
    const config = await db.getConfig(guildId);
    const payload = await adminUi.buildWizardPayload(
      interaction.guild,
      config,
      step,
    );
    await respondAdmin(interaction, payload);
    return;
  }

  if (customId === "onboarding:wizard:enable") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const canManage = await requirePermission(interaction, "canManage");
    if (!canManage) return;

    await db.updateConfig(guildId, { enabled: true });
    const config = await db.getConfig(guildId);
    const payload = await adminUi.buildWizardPayload(
      interaction.guild,
      config,
      2,
    );

    await respondAdmin(interaction, payload);
    return;
  }

  if (customId === "onboarding:wizard:save") {
    await respondAdmin(interaction, {
      content:
        "Saved. This wizard persists each setting as soon as you configure it.",
    });
    return;
  }

  if (customId === "onboarding:wizard:cancel") {
    await interaction
      .update({
        content: "Setup wizard cancelled.",
        embeds: [],
        components: [],
      })
      .catch(async () => {
        await interaction.reply({
          content: "Setup wizard cancelled.",
          flags: [MessageFlags.Ephemeral],
        });
      });
    return;
  }

  /** ── Type Edit ── **/
  if (customId.startsWith("onboarding:type:edit:")) {
    const appTypeId = customId.split(":")[3];
    const payload = await adminUi.buildTypeManagerPayload(guildId, appTypeId);
    await respondAdmin(interaction, payload);
    return;
  }

  /** ── Type Toggle ── **/
  if (customId.startsWith("onboarding:type:toggle:")) {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const canManage = await requirePermission(interaction, "canManage");
    if (!canManage) return;

    const appTypeId = customId.split(":")[3];
    const appType = await db.getApplicationType(appTypeId);
    if (!appType) {
      await interaction.reply({
        content: "Application type not found.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await db.updateApplicationType(appTypeId, { enabled: !appType.enabled });
    await respondAdmin(interaction, {
      content: `${appType.enabled ? "⛔ Disabled" : "✅ Enabled"} **${appType.publicTitle || appType.name}**.`,
      components: [],
    });
    return;
  }

  /** ── Type Form Builder ── **/
  if (customId.startsWith("onboarding:type:form:")) {
    const appTypeId = customId.split(":")[3];
    const payload = await adminUi.buildFormBuilderPayload(appTypeId);
    await respondAdmin(interaction, payload);
    return;
  }

  if (customId.startsWith("onboarding:type:previewform:")) {
    const appTypeId = customId.split(":")[3];
    const pages = await db.getFormPages(appTypeId);
    const appType = await db.getApplicationType(appTypeId);
    let desc = `**Application:** ${appType?.publicTitle || appType?.name}\n\n`;
    for (const page of pages) {
      const fields = await db.getFormFields(page.id);
      desc += `**${page.title}**\n`;
      desc += fields.length
        ? fields
            .map((f) => `- ${adminUi.fieldTypeLabel(f.fieldType)}: ${f.label}`)
            .join("\n")
        : "- No fields";
      desc += "\n\n";
    }
    await respondAdmin(interaction, {
      embeds: [buildSimpleEmbed("Form Preview", desc || "No pages yet.")],
    });
    return;
  }

  if (customId.startsWith("onboarding:type:button:")) {
    const appTypeId = customId.split(":")[3];
    const appType = await db.getApplicationType(appTypeId);
    if (!appType) return;

    await respondAdmin(interaction, {
      embeds: [
        buildSimpleEmbed(
          "Configure Application Button",
          `**Current label:** ${appType.buttonLabel || "Apply"}\n` +
            `**Current emoji:** ${appType.buttonEmoji || "None"}\n` +
            `**Current style:** ${appType.buttonStyle || "PRIMARY"}\n\n` +
            "Discord supports Primary/Blue, Secondary/Grey, Success/Green, and Danger/Red button styles.",
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`onboarding:select:typestyle:${appTypeId}`)
            .setPlaceholder("Choose button style")
            .addOptions([
              { label: "Primary / Blue", value: "PRIMARY" },
              { label: "Secondary / Grey", value: "SECONDARY" },
              { label: "Success / Green", value: "SUCCESS" },
              { label: "Danger / Red", value: "DANGER" },
            ]),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`onboarding:type:buttonmodal:${appTypeId}`)
            .setLabel("Edit Label / Emoji")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`onboarding:type:edit:${appTypeId}`)
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
    return;
  }

  if (customId.startsWith("onboarding:type:buttonmodal:")) {
    const appTypeId = customId.split(":")[3];
    const appType = await db.getApplicationType(appTypeId);
    if (!appType) return;
    const {
      ModalBuilder,
      TextInputBuilder,
      TextInputStyle,
    } = require("discord.js");
    const modal = new ModalBuilder()
      .setCustomId(`onboarding:modal:typebutton:${appTypeId}`)
      .setTitle("Application Button");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("buttonLabel")
          .setLabel("Button label")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
          .setValue(appType.buttonLabel || "Apply"),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("buttonEmoji")
          .setLabel("Button emoji (optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(40)
          .setValue(appType.buttonEmoji || ""),
      ),
    );
    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith("onboarding:type:instructions:")) {
    const appTypeId = customId.split(":")[3];
    const appType = await db.getApplicationType(appTypeId);
    if (!appType) return;
    const {
      ModalBuilder,
      TextInputBuilder,
      TextInputStyle,
    } = require("discord.js");
    const modal = new ModalBuilder()
      .setCustomId(`onboarding:modal:typeinstructions:${appTypeId}`)
      .setTitle("Application Instructions");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("instructions")
          .setLabel("Instructions shown before start")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(1000)
          .setValue(appType.instructions || ""),
      ),
    );
    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith("onboarding:type:reviewchannel:")) {
    const appTypeId = customId.split(":")[3];
    await respondAdmin(interaction, {
      content: "Select the review channel override for this application type:",
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(`onboarding:select:typereview:${appTypeId}`)
            .setPlaceholder("Per-type review channel")
            .setChannelTypes([ChannelType.GuildText]),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`onboarding:type:edit:${appTypeId}`)
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
    return;
  }

  if (customId.startsWith("onboarding:type:actions:")) {
    const appTypeId = customId.split(":")[3];
    const payload = await adminUi.buildActionsPayload(guildId, appTypeId);
    await respondAdmin(interaction, payload);
    return;
  }

  if (customId.startsWith("onboarding:type:routing:")) {
    const appTypeId = customId.split(":")[3];
    const payload = await adminUi.buildRoleRoutingPayload(guildId, appTypeId);
    await respondAdmin(interaction, payload);
    return;
  }

  if (customId.startsWith("onboarding:type:review:")) {
    const appTypeId = customId.split(":")[3];
    const payload = await adminUi.buildReviewBehaviourPayload(
      guildId,
      appTypeId,
    );
    await respondAdmin(interaction, payload);
    return;
  }

  if (customId.startsWith("onboarding:type:setroles:")) {
    const [, , , roleKind, appTypeId] = customId.split(":");
    const maxValues = roleKind === "pending" || roleKind === "denied" ? 1 : 10;
    await respondAdmin(interaction, {
      content: "Select role(s) to save for this action:",
      components: [
        new ActionRowBuilder().addComponents(
          new (require("discord.js").RoleSelectMenuBuilder)()
            .setCustomId(`onboarding:select:setroles:${roleKind}:${appTypeId}`)
            .setPlaceholder("Select roles")
            .setMinValues(0)
            .setMaxValues(maxValues),
        ),
      ],
    });
    return;
  }

  if (customId.startsWith("onboarding:type:denytoggles:")) {
    const appTypeId = customId.split(":")[3];
    const appType = await db.getApplicationType(appTypeId);
    if (!appType) return;
    await respondAdmin(interaction, {
      embeds: [
        buildSimpleEmbed(
          "Denied Action Toggles",
          `**DM applicant:** ${appType.sendDmOnDecision !== false ? "Yes" : "No"}\n` +
            `**Kick on deny:** ${appType.kickOnDeny ? "Yes" : "No"}\n` +
            `**Ban on deny:** ${appType.banOnDeny ? "Yes" : "No"}\n\n` +
            "Kick/ban stay disabled by default and must be explicitly toggled here.",
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `onboarding:type:toggleflag:sendDmOnDecision:${appTypeId}`,
            )
            .setLabel("Toggle DM")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`onboarding:type:toggleflag:kickOnDeny:${appTypeId}`)
            .setLabel("Toggle Kick")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`onboarding:type:toggleflag:banOnDeny:${appTypeId}`)
            .setLabel("Toggle Ban")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`onboarding:type:actions:${appTypeId}`)
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
    return;
  }

  if (customId.startsWith("onboarding:type:toggleflag:")) {
    const [, , , flag, appTypeId] = customId.split(":");
    const appType = await db.getApplicationType(appTypeId);
    if (!appType) return;
    const allowed = ["sendDmOnDecision", "kickOnDeny", "banOnDeny"];
    if (!allowed.includes(flag)) return;
    await db.updateApplicationType(appTypeId, { [flag]: !appType[flag] });
    const payload = await adminUi.buildActionsPayload(guildId, appTypeId);
    await respondAdmin(interaction, {
      content: `Saved ${flag}: ${!appType[flag] ? "Yes" : "No"}`,
      ...payload,
    });
    return;
  }

  if (customId.startsWith("onboarding:page:open:")) {
    const pageId = customId.split(":")[3];
    const payload = await adminUi.buildPageBuilderPayload(pageId);
    await respondAdmin(interaction, payload);
    return;
  }

  if (customId.startsWith("onboarding:page:addfield:")) {
    const pageId = customId.split(":")[3];
    const embed = new EmbedBuilder()
      .setTitle("Add a Question")
      .setColor("#5865F2")
      .setDescription(
        "Choose what kind of answer you need. The next screen only asks for the details that matter for that type.\n\n" +
          "**Fast fields:** Yes / No, Confirmation, User, Role, Channel, and File Upload only need the question text.\n" +
          "**Choice fields:** Single Choice and Multi Choice ask for the choices, one per line.\n" +
          "**Written fields:** Short Text and Paragraph Text can optionally set answer length.",
      );
    await respondAdmin(interaction, {
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`onboarding:select:fieldtype:${pageId}`)
            .setPlaceholder("What should the applicant answer?")
            .addOptions(
              adminUi.FIELD_TYPES.map((fieldType) => ({
                label: fieldType.label,
                value: fieldType.value,
                description: fieldType.description,
              })),
            ),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`onboarding:page:open:${pageId}`)
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
    return;
  }

  if (customId.startsWith("onboarding:page:preview:")) {
    const pageId = customId.split(":")[3];
    const payload = await adminUi.buildPageBuilderPayload(pageId);
    await respondAdmin(interaction, {
      content:
        "Page preview uses the same configured field order the applicant will see.",
      ...payload,
    });
    return;
  }

  if (customId.startsWith("onboarding:field:view:")) {
    const fieldId = customId.split(":")[3];
    const payload = await adminUi.buildFieldManagerPayload(fieldId);
    await respondAdmin(interaction, payload);
    return;
  }

  if (customId.startsWith("onboarding:field:edit:")) {
    const fieldId = customId.split(":")[3];
    const {
      ModalBuilder,
      TextInputBuilder,
      TextInputStyle,
    } = require("discord.js");
    const modal = new ModalBuilder()
      .setCustomId(`onboarding:modal:editfield:${fieldId}`)
      .setTitle("Edit Field");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("label")
          .setLabel("Question / Label")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("helpText")
          .setLabel("Help text")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(300),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("required")
          .setLabel("Required? yes/no")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(5),
      ),
    );
    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith("onboarding:field:options:")) {
    const fieldId = customId.split(":")[3];
    const {
      ModalBuilder,
      TextInputBuilder,
      TextInputStyle,
    } = require("discord.js");
    const modal = new ModalBuilder()
      .setCustomId(`onboarding:modal:fieldoptions:${fieldId}`)
      .setTitle("Set Field Options");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("options")
          .setLabel("Options, one per line")
          .setPlaceholder("Mobile\nPC\nBoth")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000),
      ),
    );
    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith("onboarding:field:delete:")) {
    const fieldId = customId.split(":")[3];
    await db.deleteFormField(fieldId);
    await interaction.reply({
      content: "Field deleted.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (customId === "onboarding:panel:embed") {
    const config = await db.getConfig(guildId);
    const {
      ModalBuilder,
      TextInputBuilder,
      TextInputStyle,
    } = require("discord.js");
    const modal = new ModalBuilder()
      .setCustomId("onboarding:modal:panelembed")
      .setTitle("Panel Embed Text");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Panel title")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(100)
          .setValue(config?.panelEmbedTitle || ""),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Panel description")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(1500)
          .setValue(config?.panelEmbedDescription || ""),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("footer")
          .setLabel("Footer")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(100)
          .setValue(config?.panelEmbedFooter || ""),
      ),
    );
    await interaction.showModal(modal);
    return;
  }

  if (customId === "onboarding:panel:media") {
    const config = await db.getConfig(guildId);
    const {
      ModalBuilder,
      TextInputBuilder,
      TextInputStyle,
    } = require("discord.js");
    const modal = new ModalBuilder()
      .setCustomId("onboarding:modal:panelmedia")
      .setTitle("Panel Media / Color");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("color")
          .setLabel("Embed color hex")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(7)
          .setValue(config?.panelEmbedColor || ""),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("thumbnail")
          .setLabel("Thumbnail URL")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(300)
          .setValue(config?.panelThumbnailUrl || ""),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("image")
          .setLabel("Main image/banner URL")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(300)
          .setValue(config?.panelImageUrl || ""),
      ),
    );
    await interaction.showModal(modal);
    return;
  }

  if (customId === "onboarding:panel:toggles") {
    const config = await db.getConfig(guildId);
    await interaction.reply({
      embeds: [
        buildSimpleEmbed(
          "Panel Design Toggles",
          `**Use server icon:** ${config?.useServerIcon !== false ? "Yes" : "No"}\n` +
            `**Use server banner:** ${config?.useServerBanner ? "Yes" : "No"}\n` +
            `**Show Discore branding:** ${config?.showDiscoreBranding !== false ? "Yes" : "No"}`,
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("onboarding:panel:toggle:useServerIcon")
            .setLabel("Toggle Icon")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("onboarding:panel:toggle:useServerBanner")
            .setLabel("Toggle Banner")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("onboarding:panel:toggle:showDiscoreBranding")
            .setLabel("Toggle Branding")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("onboarding:dash:paneldesign")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (customId.startsWith("onboarding:panel:toggle:")) {
    const field = customId.split(":")[3];
    const config = await db.getConfig(guildId);
    const allowed = ["useServerIcon", "useServerBanner", "showDiscoreBranding"];
    if (!allowed.includes(field)) return;
    await db.updateConfig(guildId, { [field]: !config?.[field] });
    const updated = await db.getConfig(guildId);
    const payload = await adminUi.buildPanelDesignPayload(
      interaction.guild,
      updated,
    );
    await interaction.reply({
      content: `Saved ${field}: ${!config?.[field] ? "Yes" : "No"}`,
      ...payload,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  /** ── Type Delete ── **/
  if (customId.startsWith("onboarding:type:delete:")) {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const canManage = await requirePermission(interaction, "canManage");
    if (!canManage) return;

    const appTypeId = customId.split(":")[3];
    const appType = await db.getApplicationType(appTypeId);
    if (!appType) {
      await interaction.reply({
        content: "Application type not found.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await db.deleteApplicationType(appTypeId);
    await interaction.reply({
      content: `🗑️ Deleted **${appType.publicTitle || appType.name}**.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  /** ── Type Add Page ── **/
  if (customId.startsWith("onboarding:type:addpage:")) {
    const appTypeId = customId.split(":")[3];
    const modal = new (require("discord.js").ModalBuilder)()
      .setCustomId(`onboarding:modal:addpage:${appTypeId}`)
      .setTitle("Add Form Page");

    const titleInput = new (require("discord.js").TextInputBuilder)()
      .setCustomId("title")
      .setLabel("Page Title")
      .setPlaceholder("e.g., Basic Info")
      .setStyle(require("discord.js").TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(80);

    const descInput = new (require("discord.js").TextInputBuilder)()
      .setCustomId("description")
      .setLabel("Page Description (optional)")
      .setPlaceholder("Fill in your basic information...")
      .setStyle(require("discord.js").TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(200);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput),
    );

    await interaction.showModal(modal);
    return;
  }

  // Remove Permission Role
  if (customId === "onboarding:perm:remove") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const canManage = await requirePermission(interaction, "canManage");
    if (!canManage) return;

    const permRoles = await db.getPermissionRoles(guildId);
    if (!permRoles.length) {
      await interaction.reply({
        content: "No permission roles configured to remove.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const { StringSelectMenuBuilder } = require("discord.js");

    const options = permRoles.map((pr) => ({
      label: `Role ID: ${pr.roleId}`,
      value: pr.roleId,
    }));

    await interaction.reply({
      content: "Select a role to remove onboarding permissions from:",
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("onboarding:select:removeperm")
            .setPlaceholder("Select a role to remove...")
            .addOptions(options.slice(0, 25)),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("onboarding:dash:back")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⬅️"),
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // If no handler matched, reply to avoid timeout
  await interaction
    .reply({
      content:
        "That action is not available. Please try refreshing the dashboard.",
      flags: [MessageFlags.Ephemeral],
    })
    .catch(() => {});
}

/**
 * Export an array of handler descriptors for each customId prefix
 * this module handles.  This keeps the component loader's longest-prefix
 * logic working correctly without the old over-broad id: "onboarding"
 * shadowing the review / apply / dm / modal / select handlers.
 */
module.exports = [
  { customIdPrefix: "onboarding:dash:", execute: handle },
  { customIdPrefix: "onboarding:view:", execute: handle },
  { customIdPrefix: "onboarding:type:", execute: handle },
  { customIdPrefix: "onboarding:page:", execute: handle },
  { customIdPrefix: "onboarding:field:", execute: handle },
  { customIdPrefix: "onboarding:panel:", execute: handle },
  { customIdPrefix: "onboarding:perm:", execute: handle },
  { customIdPrefix: "onboarding:wizard:", execute: handle },
];
