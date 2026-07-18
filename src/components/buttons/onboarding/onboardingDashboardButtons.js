"use strict";

const {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
} = require("discord.js");
const db = require("../../../modules/onboarding/onboardingDb");
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

    await interaction.reply({
      embeds: [
        buildSimpleEmbed(
          "🧙 Setup Wizard",
          "The Setup Wizard will guide you through configuring onboarding applications.\n\n" +
            "**Steps:**\n" +
            "1. Enable Applications\n" +
            "2. Choose Panel Channel\n" +
            "3. Choose Review Channel\n" +
            "4. Configure Permissions\n" +
            "5. Create Application Types\n" +
            "6. Build Forms\n" +
            "7. Configure Roles\n" +
            "8. Review Behaviour\n" +
            "9. Panel Design\n" +
            "10. Publish\n\n" +
            "Use the buttons below to navigate through setup.",
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("onboarding:wizard:step1")
            .setLabel("Start Setup")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("▶️"),
          new ButtonBuilder()
            .setCustomId("onboarding:dash:configpanel")
            .setLabel("Set Panel Channel")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📌"),
          new ButtonBuilder()
            .setCustomId("onboarding:dash:configreview")
            .setLabel("Set Review Channel")
            .setStyle(ButtonStyle.Secondary)
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

  // Application Types
  if (customId === "onboarding:dash:types") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const appTypes = await db.getApplicationTypes(guildId);
    const rows = [];

    for (const at of appTypes) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`onboarding:type:edit:${at.id}`)
            .setLabel(`${at.enabled ? "✅" : "⛔"} ${at.name}`)
            .setStyle(at.enabled ? ButtonStyle.Primary : ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`onboarding:type:toggle:${at.id}`)
            .setLabel(at.enabled ? "Disable" : "Enable")
            .setStyle(at.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`onboarding:type:form:${at.id}`)
            .setLabel("Form Builder")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📝"),
          new ButtonBuilder()
            .setCustomId(`onboarding:type:delete:${at.id}`)
            .setLabel("Delete")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🗑️"),
        ),
      );
    }

    // Add New button
    const currentCount = appTypes.filter((t) => t.enabled).length;
    const maxTypes = 3;
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("onboarding:type:create")
          .setLabel(`Create Application Type (${currentCount}/${maxTypes})`)
          .setStyle(ButtonStyle.Success)
          .setEmoji("➕")
          .setDisabled(currentCount >= maxTypes),
      ),
    );

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
      embeds: [
        buildSimpleEmbed(
          "📋 Application Types",
          `Manage your application types below.\n**${currentCount}/${maxTypes}** active application types used.\n\nClick a type to edit it, toggle it on/off, build its form, or delete it.`,
        ),
      ],
      components: rows,
      flags: [MessageFlags.Ephemeral],
    });
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

    const permRoles = await db.getPermissionRoles(guildId);

    let desc = "**Configured Permission Roles:**\n";
    if (permRoles.length) {
      for (const pr of permRoles) {
        const perms = [];
        if (pr.canManage) perms.push("Manage");
        if (pr.canBuildForms) perms.push("Build Forms");
        if (pr.canReview) perms.push("Review");
        if (pr.canApproveDeny) perms.push("Approve/Deny");
        if (pr.canOpenThreads) perms.push("Threads");
        if (pr.canDownload) perms.push("Download");
        if (pr.canDelete) perms.push("Delete");
        desc += `- <@&${pr.roleId}>: ${perms.join(", ") || "None"}\n`;
      }
    } else {
      desc +=
        "No role-based permissions configured.\nServer Owner, Admin, and Manage Guild have full access.";
    }

    await interaction.reply({
      embeds: [buildSimpleEmbed("🔑 Permissions", desc)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("onboarding:perm:add")
            .setLabel("Add Permission Role")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("➕"),
          new ButtonBuilder()
            .setCustomId("onboarding:perm:remove")
            .setLabel("Remove Permission Role")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("➖"),
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

    await interaction.reply({
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
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Config Review Channel
  if (customId === "onboarding:dash:configreview") {
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    await interaction.reply({
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
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Preview User Flow
  if (customId === "onboarding:dash:preview") {
    const config = await db.getConfig(guildId);
    const appTypes = await db.getApplicationTypes(guildId);
    const {
      buildPublicPanelEmbed,
    } = require("../../../modules/onboarding/onboardingEmbeds");

    const embed = buildPublicPanelEmbed(
      config,
      interaction.guild,
      appTypes,
      false,
    );

    await interaction.reply({
      content: "👁️ **Public Panel Preview** (what users will see):",
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
    });
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
    const hasPremium = await requireOnboardingPremium(interaction);
    if (!hasPremium) return;

    const canManage = await requirePermission(interaction, "canManage");
    if (!canManage) return;

    await db.updateConfig(guildId, { enabled: true });

    await interaction.reply({
      embeds: [
        buildSimpleEmbed(
          "✅ Step 1 — Applications Enabled",
          "Onboarding applications have been enabled.\n\n" +
            "**Next:** Set your Panel Channel using the button below, or use **Back to Dashboard**.",
          "#57f287",
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

  /** ── Type Edit ── **/
  if (customId.startsWith("onboarding:type:edit:")) {
    const appTypeId = customId.split(":")[3];
    const appType = await db.getApplicationType(appTypeId);
    if (!appType) {
      await interaction.reply({
        content: "Application type not found.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.reply({
      embeds: [
        buildSimpleEmbed(
          `✏️ Edit: ${appType.name}`,
          `**Public Title:** ${appType.publicTitle}\n` +
            `**Description:** ${appType.publicDescription || "None"}\n` +
            `**Button Label:** ${appType.buttonLabel}\n` +
            `**Button Emoji:** ${appType.buttonEmoji || "None"}\n` +
            `**Button Style:** ${appType.buttonStyle}\n` +
            `**Enabled:** ${appType.enabled ? "Yes" : "No"}\n\n` +
            `Use the buttons below to edit settings or build the form.`,
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`onboarding:type:form:${appType.id}`)
            .setLabel("📝 Form Builder")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`onboarding:type:toggle:${appType.id}`)
            .setLabel(appType.enabled ? "⛔ Disable" : "✅ Enable")
            .setStyle(
              appType.enabled ? ButtonStyle.Danger : ButtonStyle.Success,
            ),
          new ButtonBuilder()
            .setCustomId(`onboarding:type:delete:${appType.id}`)
            .setLabel("🗑️ Delete")
            .setStyle(ButtonStyle.Danger),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("onboarding:dash:types")
            .setLabel("Back to Types")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⬅️"),
        ),
      ],
      flags: [MessageFlags.Ephemeral],
    });
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
    await interaction.reply({
      content: `${appType.enabled ? "⛔ Disabled" : "✅ Enabled"} **${appType.publicTitle || appType.name}**.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  /** ── Type Form Builder ── **/
  if (customId.startsWith("onboarding:type:form:")) {
    const appTypeId = customId.split(":")[3];
    const appType = await db.getApplicationType(appTypeId);
    if (!appType) {
      await interaction.reply({
        content: "Application type not found.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const pages = await db.getFormPages(appTypeId);
    let desc = `**Form pages for: ${appType.publicTitle || appType.name}**\n\n`;
    if (pages.length) {
      for (const p of pages) {
        const fields = await db.getFormFields(p.id);
        desc += `📄 **${p.title}** (${fields.length} fields)\n`;
      }
    } else {
      desc += "No pages configured yet.\n";
    }
    desc += "\nUse **Add Page** to create your first form page.";

    await interaction.reply({
      embeds: [buildSimpleEmbed("📝 Form Builder", desc)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`onboarding:type:addpage:${appTypeId}`)
            .setLabel("Add Page")
            .setStyle(ButtonStyle.Success)
            .setEmoji("➕"),
          new ButtonBuilder()
            .setCustomId(`onboarding:type:edit:${appTypeId}`)
            .setLabel("Back to Type Settings")
            .setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("onboarding:dash:back")
            .setLabel("Dashboard")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⬅️"),
        ),
      ],
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
  { customIdPrefix: "onboarding:perm:", execute: handle },
  { customIdPrefix: "onboarding:wizard:", execute: handle },
];
