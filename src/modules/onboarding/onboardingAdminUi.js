"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const db = require("./onboardingDb");
const { buildPublicPanelEmbed } = require("./onboardingEmbeds");

const FIELD_TYPES = [
  {
    label: "Short Text",
    value: "TEXT_SHORT",
    description: "One-line text answer",
  },
  {
    label: "Paragraph Text",
    value: "TEXT_PARAGRAPH",
    description: "Long-form written answer",
  },
  { label: "Yes / No", value: "YES_NO", description: "Boolean yes/no answer" },
  {
    label: "Single Choice",
    value: "SINGLE_SELECT",
    description: "One option from a configured list",
  },
  {
    label: "Multi Choice",
    value: "MULTI_SELECT",
    description: "Multiple options from a configured list",
  },
  {
    label: "User Select",
    value: "USER_SELECT",
    description: "Discord user selector",
  },
  {
    label: "Role Select",
    value: "ROLE_SELECT",
    description: "Discord role selector",
  },
  {
    label: "Mentionable Select",
    value: "MENTIONABLE_SELECT",
    description: "Mentionable selector fallback",
  },
  {
    label: "Channel Select",
    value: "CHANNEL_SELECT",
    description: "Discord channel selector",
  },
  {
    label: "File Upload",
    value: "FILE_UPLOAD",
    description: "Image or file upload question",
  },
  {
    label: "Confirmation / Agreement",
    value: "CONFIRMATION",
    description: "Required yes/confirmed answer",
  },
];

const WIZARD_STEPS = [
  { id: 1, title: "Enable Applications", key: "enabled" },
  { id: 2, title: "Select Public Panel Channel", key: "panel" },
  { id: 3, title: "Select Review Channel", key: "review" },
  { id: 4, title: "Configure Staff Permissions", key: "permissions" },
  { id: 5, title: "Create Application Types", key: "types" },
  { id: 6, title: "Build Application Forms", key: "forms" },
  { id: 7, title: "Configure Role Routing", key: "routing" },
  { id: 8, title: "Configure Accepted / Denied Actions", key: "actions" },
  { id: 9, title: "Configure Review Behaviour", key: "reviewBehaviour" },
  { id: 10, title: "Design Public Application Panel", key: "panelDesign" },
  { id: 11, title: "Preview Full Flow", key: "preview" },
  { id: 12, title: "Publish / Repair Panel", key: "publish" },
];

function button(
  customId,
  label,
  style = ButtonStyle.Secondary,
  disabled = false,
) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label.slice(0, 80))
    .setStyle(style)
    .setDisabled(disabled);
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function roleList(ids) {
  return ids?.length ? ids.map((id) => `<@&${id}>`).join(" ") : "None";
}

function fieldTypeLabel(type) {
  return FIELD_TYPES.find((f) => f.value === type)?.label || type || "Unknown";
}

function fieldSummary(field, options = []) {
  if (field.fieldType === "SINGLE_SELECT") {
    return options.length
      ? `Choices: ${options.map((option) => option.label).join(", ")}`.slice(
          0,
          1024,
        )
      : "Choices: none yet";
  }
  if (field.fieldType === "MULTI_SELECT") {
    const choiceLimit = field.maxChoices
      ? ` • Pick up to ${field.maxChoices}`
      : "";
    return options.length
      ? `Choices: ${options.map((option) => option.label).join(", ")}${choiceLimit}`.slice(
          0,
          1024,
        )
      : `Choices: none yet${choiceLimit}`;
  }
  if (field.fieldType === "FILE_UPLOAD") {
    return field.allowedFileTypes?.length
      ? `Allowed files: ${field.allowedFileTypes.join(", ")}`
      : "Any file type allowed";
  }
  if (
    field.fieldType === "TEXT_SHORT" ||
    field.fieldType === "TEXT_PARAGRAPH"
  ) {
    const min = field.minLength ? `Min ${field.minLength}` : null;
    const max = field.maxLength ? `Max ${field.maxLength}` : null;
    return [min, max].filter(Boolean).join(" • ") || "Written answer";
  }
  return "Simple answer field";
}

function guideBlock(goal, doNow, next) {
  return (
    `**Goal:** ${goal}\n` + `**Do now:** ${doNow}\n` + `**Next:** ${next}\n\n`
  );
}

function wizardStepGuide(step) {
  const guides = {
    enabled: [
      "Turn the application system on for this server.",
      "Click Save: Enable, then move to channel setup.",
      "Choose where users will see the public application panel.",
    ],
    panel: [
      "Choose the public channel where members start applications.",
      "Select the channel that should hold the application panel.",
      "Choose the private staff review channel.",
    ],
    review: [
      "Choose where submitted applications are sent for staff review.",
      "Select a staff-only review channel.",
      "Configure which staff roles can manage, review, approve, and download.",
    ],
    permissions: [
      "Give the right staff roles access without handing everyone full admin control.",
      "Open Permissions and assign reviewer, approver, download, and admin roles.",
      "Create the application type applicants will click on the panel.",
    ],
    types: [
      "Create the public application choices users can start from the panel.",
      "Create or select an application type, then configure its button and instructions.",
      "Build the pages and questions for that application type.",
    ],
    forms: [
      "Build the actual questions applicants answer in DMs.",
      "Open a type, add up to 3 pages, then add fields to each page.",
      "Configure role routing from answers such as games, platform, or yes/no choices.",
    ],
    routing: [
      "Map answers to roles so approval can automatically grant the right access.",
      "Select type, field, condition, then the roles to add on approval.",
      "Configure accepted and denied decision actions.",
    ],
    actions: [
      "Decide what happens when staff approves or denies an application.",
      "Set accepted, pending, remove, and denied roles. Keep kick/ban off unless needed.",
      "Tune review behaviour such as channels, request changes, and threads.",
    ],
    reviewBehaviour: [
      "Control how staff reviews applications after users submit them.",
      "Confirm the default/per-type review channels and review-thread behaviour.",
      "Design the public application panel users will see.",
    ],
    panelDesign: [
      "Make the public panel clear, branded, and easy for members to use.",
      "Edit title, description, color, images, branding, and button presentation.",
      "Preview the complete user and staff flow before publishing.",
    ],
    preview: [
      "Review the full experience before exposing it to members.",
      "Check panel, DM intro, form pages, submission preview, staff card, and decision flow.",
      "Publish or repair the panel once the preview looks right.",
    ],
    publish: [
      "Post or repair the live application panel.",
      "Click Publish Panel for first setup, or Repair Panel if the tracked message is missing.",
      "Run a test application from the public panel.",
    ],
  };
  const [goal, doNow, next] = guides[step.key] || [
    "Configure this setup step.",
    "Use the controls below.",
    "Move to the next step when ready.",
  ];
  return guideBlock(goal, doNow, next);
}

async function getWizardStatus(guildId, config, appTypes) {
  const permissionRoles = await db.getPermissionRoles(guildId);
  const roleRules = await db.getRoleRules(guildId);
  let pageCount = 0;
  let fieldCount = 0;
  for (const type of appTypes) {
    const pages = await db.getFormPages(type.id);
    pageCount += pages.length;
    for (const page of pages) {
      fieldCount += (await db.getFormFields(page.id)).length;
    }
  }

  return {
    enabled: !!config?.enabled,
    panel: !!config?.panelChannelId,
    review: !!config?.defaultReviewChannelId,
    permissions: permissionRoles.length > 0,
    types: appTypes.length > 0,
    forms: pageCount > 0 && fieldCount > 0,
    routing:
      roleRules.length > 0 ||
      appTypes.some((t) => t.acceptRoleIds?.length || t.pendingRoleId),
    actions: appTypes.some(
      (t) =>
        t.acceptRoleIds?.length ||
        t.denyRoleId ||
        t.pendingRoleId ||
        t.denyAction ||
        t.sendDmOnDecision !== false,
    ),
    reviewBehaviour:
      !!config?.defaultReviewChannelId ||
      appTypes.some((t) => t.reviewChannelId || t.allowReviewThread !== false),
    panelDesign: !!(
      config?.panelEmbedTitle ||
      config?.panelEmbedDescription ||
      config?.panelEmbedColor
    ),
    preview: appTypes.length > 0,
    publish: !!config?.panelMessageId,
    pageCount,
    fieldCount,
    permissionRoles,
    roleRules,
  };
}

function statusLine(done, current) {
  if (done) return "Ready";
  return current ? "Needs setup now" : "Missing";
}

async function buildWizardPayload(guild, config, stepNumber = 1) {
  const guildId = guild.id;
  const appTypes = await db.getApplicationTypes(guildId);
  const status = await getWizardStatus(guildId, config, appTypes);
  const step = WIZARD_STEPS.find((s) => s.id === stepNumber) || WIZARD_STEPS[0];
  const done = status[step.key];

  const embed = new EmbedBuilder()
    .setTitle(`Setup Wizard — Step ${step.id} of ${WIZARD_STEPS.length}`)
    .setColor(done ? "#57f287" : "#fee75c")
    .setDescription(
      wizardStepGuide(step) +
        `**Configuring:** ${step.title}\n` +
        `**Status:** ${statusLine(done, true)}\n\n` +
        wizardStepDescription(step, config, appTypes, status),
    )
    .setFooter({
      text: "Use Back/Next to move through setup. Save buttons persist immediately.",
    })
    .setTimestamp();

  const components = buildWizardComponents(step, config, appTypes, status);
  return { embeds: [embed], components };
}

function wizardStepDescription(step, config, appTypes, status) {
  switch (step.key) {
    case "enabled":
      return `**Current saved value:** ${yesNo(config?.enabled)}\n**Missing warning:** ${config?.enabled ? "None" : "Applications are disabled until saved."}`;
    case "panel":
      return `**Current saved value:** ${config?.panelChannelId ? `<#${config.panelChannelId}>` : "Not set"}\n**Missing warning:** ${config?.panelChannelId ? "None" : "Users cannot see a public application panel yet."}`;
    case "review":
      return `**Current saved value:** ${config?.defaultReviewChannelId ? `<#${config.defaultReviewChannelId}>` : "Not set"}\n**Missing warning:** ${config?.defaultReviewChannelId ? "None" : "Submitted applications have nowhere to go."}`;
    case "permissions":
      return `**Current saved value:** ${status.permissionRoles.length} configured role(s)\nOwner and Administrator are always allowed. Manage Guild access is currently allowed by policy.\n**Missing warning:** ${status.permissionRoles.length ? "None" : "No staff roles configured yet."}`;
    case "types":
      return `**Current saved value:** ${appTypes.length}/3 application type(s)\n${appTypes.map((t) => `- ${t.enabled ? "Enabled" : "Disabled"}: ${t.publicTitle || t.name}`).join("\n") || "No application types yet."}`;
    case "forms":
      return `**Current saved value:** ${status.pageCount} page(s), ${status.fieldCount} field(s)\n**Missing warning:** ${status.forms ? "None" : "At least one page and one field are required for a real flow."}`;
    case "routing":
      return `**Current saved value:** ${status.roleRules.length} answer-based rule(s)\n**Missing warning:** ${status.routing ? "None" : "No decision or answer-based role routing configured."}`;
    case "actions":
      return `**Current saved value:** Configure per application type.\nAccepted roles, pending roles, denied roles, DM decision behaviour, kick/ban safeguards are managed here.`;
    case "reviewBehaviour":
      return `**Current saved value:** Default review channel ${config?.defaultReviewChannelId ? `<#${config.defaultReviewChannelId}>` : "not set"}\nPer-type overrides and review-thread behaviour are managed here.`;
    case "panelDesign":
      return `**Current saved value:**\nTitle: ${config?.panelEmbedTitle || "Default"}\nDescription: ${config?.panelEmbedDescription ? "Custom" : "Default"}\nColor: ${config?.panelEmbedColor || "Default"}`;
    case "preview":
      return "Preview the public panel, DM intro, configured form pages, submission state, staff review card, and decision messaging before publishing.";
    case "publish":
      return `**Current saved value:** ${config?.panelMessageId ? `Published message ${config.panelMessageId}` : "No tracked panel message"}\nUse Publish or Repair after the checks above are ready.`;
    default:
      return "Configure this step and continue.";
  }
}

function buildWizardComponents(step, config, appTypes, status) {
  const rows = [];
  const actionRow = new ActionRowBuilder();

  if (step.key === "enabled")
    actionRow.addComponents(
      button("onboarding:wizard:enable", "Save: Enable", ButtonStyle.Success),
    );
  if (step.key === "panel") {
    actionRow.addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("onboarding:select:panelchannel")
        .setPlaceholder("Select public panel channel")
        .setChannelTypes([ChannelType.GuildText]),
    );
  }
  if (step.key === "review") {
    actionRow.addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("onboarding:select:reviewchannel")
        .setPlaceholder("Select default review channel")
        .setChannelTypes([ChannelType.GuildText]),
    );
  }
  if (step.key === "permissions")
    actionRow.addComponents(
      button(
        "onboarding:dash:permissions",
        "Open Permissions",
        ButtonStyle.Primary,
      ),
    );
  if (step.key === "types")
    actionRow.addComponents(
      button(
        "onboarding:dash:types",
        "Open Application Types",
        ButtonStyle.Primary,
      ),
    );
  if (step.key === "forms")
    actionRow.addComponents(
      button(
        "onboarding:dash:types",
        "Choose Type / Build Forms",
        ButtonStyle.Primary,
      ),
    );
  if (step.key === "routing")
    actionRow.addComponents(
      button(
        "onboarding:dash:routing",
        "Open Role Routing",
        ButtonStyle.Primary,
      ),
    );
  if (step.key === "actions")
    actionRow.addComponents(
      button(
        "onboarding:dash:actions",
        "Open Action Builder",
        ButtonStyle.Primary,
      ),
    );
  if (step.key === "reviewBehaviour")
    actionRow.addComponents(
      button(
        "onboarding:dash:reviewsettings",
        "Open Review Behaviour",
        ButtonStyle.Primary,
      ),
    );
  if (step.key === "panelDesign")
    actionRow.addComponents(
      button(
        "onboarding:dash:paneldesign",
        "Open Panel Design",
        ButtonStyle.Primary,
      ),
    );
  if (step.key === "preview")
    actionRow.addComponents(
      button(
        "onboarding:dash:preview",
        "Preview Full Flow",
        ButtonStyle.Primary,
      ),
    );
  if (step.key === "publish") {
    actionRow.addComponents(
      button(
        "onboarding:dash:publish",
        "Publish Panel",
        ButtonStyle.Success,
        !config?.enabled || !config?.panelChannelId,
      ),
      button(
        "onboarding:dash:repair",
        "Repair Panel",
        ButtonStyle.Secondary,
        !config?.panelChannelId,
      ),
    );
  }
  if (actionRow.components.length) rows.push(actionRow);

  rows.push(
    new ActionRowBuilder().addComponents(
      button(
        `onboarding:wizard:step:${Math.max(1, step.id - 1)}`,
        "Back",
        ButtonStyle.Secondary,
        step.id <= 1,
      ),
      button(
        `onboarding:wizard:step:${Math.min(WIZARD_STEPS.length, step.id + 1)}`,
        "Next",
        ButtonStyle.Primary,
        step.id >= WIZARD_STEPS.length,
      ),
      button("onboarding:wizard:save", "Save", ButtonStyle.Success),
      button("onboarding:wizard:cancel", "Cancel", ButtonStyle.Danger),
      button("onboarding:dash:back", "Dashboard", ButtonStyle.Secondary),
    ),
  );

  return rows;
}

async function buildPermissionsPayload(guildId) {
  const permRoles = await db.getPermissionRoles(guildId);
  const grouped = {
    manage: permRoles.filter((p) => p.canManage).map((p) => p.roleId),
    build: permRoles.filter((p) => p.canBuildForms).map((p) => p.roleId),
    review: permRoles.filter((p) => p.canReview).map((p) => p.roleId),
    approve: permRoles.filter((p) => p.canApproveDeny).map((p) => p.roleId),
    download: permRoles.filter((p) => p.canDownload).map((p) => p.roleId),
    delete: permRoles.filter((p) => p.canDelete).map((p) => p.roleId),
  };

  const embed = new EmbedBuilder()
    .setTitle("Staff Permissions")
    .setColor("#5865F2")
    .setDescription(
      guideBlock(
        "Choose who can build, review, approve, download, and clean up applications.",
        "Select roles in each permission menu. A role can be selected in more than one group.",
        "After permissions, create or select an application type.",
      ) +
        "Server owner and Administrator are always allowed. Manage Guild users currently receive management/build access.\n\n" +
        `**Manage Roles:** ${roleList(grouped.manage)}\n` +
        `**Build/Edit Forms:** ${roleList(grouped.build)}\n` +
        `**Reviewer Roles:** ${roleList(grouped.review)}\n` +
        `**Approver Roles:** ${roleList(grouped.approve)}\n` +
        `**Download Roles:** ${roleList(grouped.download)}\n` +
        `**Delete/Admin Roles:** ${roleList(grouped.delete)}\n\n` +
        "Use the role selectors below to assign each permission group. Selecting the same role in multiple groups combines permissions.",
    )
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("onboarding:select:permgroup:manage")
          .setPlaceholder("Manage roles")
          .setMinValues(0)
          .setMaxValues(10),
      ),
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("onboarding:select:permgroup:review")
          .setPlaceholder("Reviewer roles")
          .setMinValues(0)
          .setMaxValues(10),
      ),
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("onboarding:select:permgroup:approve")
          .setPlaceholder("Approver roles")
          .setMinValues(0)
          .setMaxValues(10),
      ),
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("onboarding:select:permgroup:download")
          .setPlaceholder("Download roles")
          .setMinValues(0)
          .setMaxValues(10),
      ),
      new ActionRowBuilder().addComponents(
        button("onboarding:wizard:step:5", "Next", ButtonStyle.Primary),
        button("onboarding:wizard:step:3", "Back", ButtonStyle.Secondary),
        button("onboarding:dash:back", "Dashboard", ButtonStyle.Secondary),
      ),
    ],
  };
}

async function buildApplicationTypesPayload(guildId) {
  const appTypes = await db.getApplicationTypes(guildId);
  const embed = new EmbedBuilder()
    .setTitle("Application Type Manager")
    .setColor("#5865F2")
    .setDescription(
      guideBlock(
        "Create the application buttons users will choose from the public panel.",
        appTypes.length
          ? "Select an application type to configure its button, form, actions, and routing."
          : "Click Create Application Type to make the first application users can start.",
        "Once a type exists, build its form pages and fields.",
      ) +
        `${appTypes.filter((t) => t.enabled).length}/3 active application types. Select a type below for editing, form building, actions, role routing, and review behaviour.`,
    )
    .setTimestamp();

  for (const type of appTypes.slice(0, 3)) {
    const pages = await db.getFormPages(type.id);
    let fieldCount = 0;
    for (const page of pages)
      fieldCount += (await db.getFormFields(page.id)).length;
    const rules = await db.getRoleRules(guildId, type.id);
    embed.addFields({
      name: `${type.enabled ? "Enabled" : "Disabled"} — ${type.publicTitle || type.name}`,
      value:
        `Internal: ${type.name}\n` +
        `Description: ${type.publicDescription || "None"}\n` +
        `Button: ${type.buttonEmoji || ""} ${type.buttonLabel || "Apply"} (${type.buttonStyle || "PRIMARY"})\n` +
        `Review override: ${type.reviewChannelId ? `<#${type.reviewChannelId}>` : "Default"}\n` +
        `Pages/Fields: ${pages.length}/${fieldCount}\n` +
        `Accepted roles: ${type.acceptRoleIds?.length || 0}; Role rules: ${rules.length}`,
      inline: false,
    });
  }

  const rows = [];
  if (appTypes.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("onboarding:select:typeadmin")
          .setPlaceholder("Select application type to manage")
          .addOptions(
            appTypes.slice(0, 25).map((t) => ({
              label: (t.publicTitle || t.name).slice(0, 100),
              value: t.id,
              description: `${t.enabled ? "Enabled" : "Disabled"} • ${t.buttonStyle || "PRIMARY"}`,
            })),
          ),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      button(
        "onboarding:type:create",
        "Create Application Type",
        ButtonStyle.Success,
        appTypes.filter((t) => t.enabled).length >= 3,
      ),
      button("onboarding:wizard:step:6", "Next", ButtonStyle.Primary),
      button("onboarding:wizard:step:4", "Back", ButtonStyle.Secondary),
      button("onboarding:dash:back", "Dashboard", ButtonStyle.Secondary),
    ),
  );

  return { embeds: [embed], components: rows };
}

async function buildTypeManagerPayload(guildId, appTypeId) {
  const type = await db.getApplicationType(appTypeId);
  if (!type)
    return simplePayload(
      "Application Type Missing",
      "That application type no longer exists.",
    );
  const pages = await db.getFormPages(appTypeId);
  let fieldCount = 0;
  for (const page of pages)
    fieldCount += (await db.getFormFields(page.id)).length;
  const rules = await db.getRoleRules(guildId, appTypeId);
  const embed = new EmbedBuilder()
    .setTitle(`Application Type — ${type.publicTitle || type.name}`)
    .setColor(type.themeColor || "#5865F2")
    .setDescription(
      guideBlock(
        "Finish one application type before moving to the next.",
        pages.length && fieldCount
          ? "Review button, actions, role routing, and review channel settings."
          : "Start with Build Forms so applicants have real questions to answer.",
        "After the form is built, configure accepted/denied actions and role routing.",
      ) +
        `**Internal name:** ${type.name}\n` +
        `**Public title:** ${type.publicTitle}\n` +
        `**Description:** ${type.publicDescription || "None"}\n` +
        `**Instructions:** ${type.instructions ? "Configured" : "None"}\n` +
        `**Button:** ${type.buttonEmoji || ""} ${type.buttonLabel || "Apply"} (${type.buttonStyle || "PRIMARY"})\n` +
        `**Enabled:** ${yesNo(type.enabled)}\n` +
        `**Review channel override:** ${type.reviewChannelId ? `<#${type.reviewChannelId}>` : "Default"}\n` +
        `**Pages / Fields:** ${pages.length} / ${fieldCount}\n` +
        `**Accepted roles:** ${type.acceptRoleIds?.length || 0}\n` +
        `**Role rules:** ${rules.length}`,
    )
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        button(
          `onboarding:type:form:${type.id}`,
          "Build Forms",
          ButtonStyle.Primary,
        ),
        button(
          `onboarding:type:button:${type.id}`,
          "Configure Button",
          ButtonStyle.Secondary,
        ),
        button(
          `onboarding:type:instructions:${type.id}`,
          "Instructions",
          ButtonStyle.Secondary,
        ),
        button(
          `onboarding:type:reviewchannel:${type.id}`,
          "Review Channel",
          ButtonStyle.Secondary,
        ),
      ),
      new ActionRowBuilder().addComponents(
        button(
          `onboarding:type:actions:${type.id}`,
          "Accepted / Denied",
          ButtonStyle.Primary,
        ),
        button(
          `onboarding:type:routing:${type.id}`,
          "Role Routing",
          ButtonStyle.Primary,
        ),
        button(
          `onboarding:type:toggle:${type.id}`,
          type.enabled ? "Disable" : "Enable",
          type.enabled ? ButtonStyle.Danger : ButtonStyle.Success,
        ),
        button(
          `onboarding:type:delete:${type.id}`,
          "Delete",
          ButtonStyle.Danger,
        ),
      ),
      new ActionRowBuilder().addComponents(
        button("onboarding:dash:types", "Back to Types", ButtonStyle.Secondary),
        button("onboarding:dash:back", "Dashboard", ButtonStyle.Secondary),
      ),
    ],
  };
}

async function buildFormBuilderPayload(appTypeId) {
  const appType = await db.getApplicationType(appTypeId);
  if (!appType)
    return simplePayload("Form Builder", "Application type not found.");
  const pages = await db.getFormPages(appTypeId);
  const embed = new EmbedBuilder()
    .setTitle(`Form Builder — ${appType.publicTitle || appType.name}`)
    .setColor(appType.themeColor || "#5865F2")
    .setDescription(
      guideBlock(
        "Create a clear page-by-page DM application form.",
        pages.length
          ? "Open a page, then add or edit fields inside that page."
          : "Click Add Page and create Page 1, usually Basic Info.",
        "After fields are added, preview the form and configure answer-based role routing.",
      ) + "Limits for now: up to 3 pages, 4 fields per page.",
    )
    .setTimestamp();

  if (!pages.length) {
    embed.addFields({
      name: "Pages",
      value: "No pages yet. Create Page 1 to begin.",
    });
  } else {
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index];
      const fields = await db.getFormFields(page.id);
      embed.addFields({
        name: `${index + 1}. ${page.title}`,
        value: `${fields.length} field(s)${page.description ? `\n${page.description}` : ""}`,
        inline: false,
      });
    }
  }

  const rows = [];
  if (pages.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`onboarding:select:openpage:${appTypeId}`)
          .setPlaceholder("Open a form page")
          .addOptions(
            pages.slice(0, 25).map((p, i) => ({
              label: `${i + 1}. ${p.title}`.slice(0, 100),
              value: p.id,
              description: `${p.sortOrder ?? i} • page builder`,
            })),
          ),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      button(
        `onboarding:type:addpage:${appTypeId}`,
        "Add Page",
        ButtonStyle.Success,
        pages.length >= 3,
      ),
      button(
        `onboarding:type:previewform:${appTypeId}`,
        "Preview Form",
        ButtonStyle.Primary,
        !pages.length,
      ),
      button(
        `onboarding:type:edit:${appTypeId}`,
        "Back to Type",
        ButtonStyle.Secondary,
      ),
      button("onboarding:dash:back", "Dashboard", ButtonStyle.Secondary),
    ),
  );
  return { embeds: [embed], components: rows };
}

async function buildPageBuilderPayload(pageId) {
  const pageRows = await db.getFormPagesForLookup?.(pageId);
  void pageRows;
  const page = await getPageById(pageId);
  if (!page) return simplePayload("Page Builder", "Page not found.");
  const appType = await db.getApplicationType(page.applicationTypeId);
  const fields = await db.getFormFields(pageId);
  const embed = new EmbedBuilder()
    .setTitle(`Page Builder — ${page.title}`)
    .setColor(appType?.themeColor || "#5865F2")
    .setDescription(
      guideBlock(
        "Add the questions applicants answer on this page.",
        fields.length
          ? "Select a field to edit it, or click Add Field to create another question."
          : "Click Add Field, choose the answer type, then enter only the question details that type needs.",
        "When this page is done, go back to the form and add the next page or preview.",
      ) +
        `${page.description || "No page description."}\n\nUp to 4 fields per page. Keep each page short so every answer control stays visible.`,
    )
    .setTimestamp();

  if (!fields.length) {
    embed.addFields({
      name: "Fields",
      value: "No fields yet. Add the first question.",
    });
  } else {
    for (let index = 0; index < fields.length; index++) {
      const field = fields[index];
      const options = await db.getFieldOptions(field.id);
      embed.addFields({
        name: `${index + 1}. ${field.label}`,
        value:
          `Type: ${fieldTypeLabel(field.fieldType)} • Required: ${yesNo(field.required !== false)}\n` +
          fieldSummary(field, options),
        inline: false,
      });
    }
  }

  const rows = [];
  if (fields.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`onboarding:select:fieldadmin:${pageId}`)
          .setPlaceholder("Select field to edit/delete/configure roles")
          .addOptions(
            fields.slice(0, 25).map((f, i) => ({
              label: `${i + 1}. ${f.label}`.slice(0, 100),
              value: f.id,
              description: fieldTypeLabel(f.fieldType).slice(0, 100),
            })),
          ),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      button(
        `onboarding:page:addfield:${pageId}`,
        "Add Field",
        ButtonStyle.Success,
        fields.length >= 4,
      ),
      button(
        `onboarding:page:preview:${pageId}`,
        "Preview Page",
        ButtonStyle.Primary,
      ),
      button(
        `onboarding:type:form:${page.applicationTypeId}`,
        "Back to Form",
        ButtonStyle.Secondary,
      ),
      button("onboarding:dash:back", "Dashboard", ButtonStyle.Secondary),
    ),
  );
  return { embeds: [embed], components: rows };
}

async function getPageById(pageId) {
  const prisma = require("../..//lib/prisma");
  const rows = await prisma
    .$queryRawUnsafe(
      `SELECT * FROM "OnboardingFormPage" WHERE "id" = $1`,
      pageId,
    )
    .catch(() => []);
  return rows?.[0] || null;
}

async function buildFieldManagerPayload(fieldId) {
  const field = await getFieldById(fieldId);
  if (!field) return simplePayload("Field Builder", "Field not found.");
  const options = await db.getFieldOptions(fieldId);
  const embed = new EmbedBuilder()
    .setTitle(`Field Builder — ${field.label}`)
    .setColor("#5865F2")
    .setDescription(
      guideBlock(
        "Make this question useful for both applicants and staff.",
        field.fieldType === "SINGLE_SELECT" ||
          field.fieldType === "MULTI_SELECT"
          ? "Use Set Options to define choices. Then use Role Routing if choices should grant roles."
          : "Use Edit Field to adjust the question, help text, and required setting.",
        "Return to the page to add the next field, or open Role Routing for answer-based roles.",
      ) +
        `**Type:** ${fieldTypeLabel(field.fieldType)}\n` +
        `**Required:** ${yesNo(field.required !== false)}\n` +
        `**Help:** ${field.helpText || "None"}\n` +
        `**Placeholder:** ${field.placeholder || "None"}\n` +
        `**Text Length:** ${field.minLength || 0}-${field.maxLength || "default"}\n` +
        `**Choices:** ${field.minChoices || 0}-${field.maxChoices || "default"}\n` +
        `**Allowed Files:** ${field.allowedFileTypes?.join(", ") || "Any"}\n` +
        `**Max File Size:** ${field.maxFileSize ? `${Math.round(field.maxFileSize / 1024 / 1024)} MB` : "Not set"}\n\n` +
        (options.length
          ? options
              .map(
                (o, i) =>
                  `${i + 1}. ${o.emoji || ""} ${o.label} (${o.value}) — roles ${roleList(o.linkedRoleIds)}`,
              )
              .join("\n")
          : "No configured options."),
    )
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        button(
          `onboarding:field:edit:${field.id}`,
          "Edit Field",
          ButtonStyle.Primary,
        ),
        button(
          `onboarding:field:options:${field.id}`,
          "Set Options",
          ButtonStyle.Secondary,
          !(
            field.fieldType === "SINGLE_SELECT" ||
            field.fieldType === "MULTI_SELECT"
          ),
        ),
        button(
          `onboarding:field:delete:${field.id}`,
          "Delete Field",
          ButtonStyle.Danger,
        ),
      ),
      new ActionRowBuilder().addComponents(
        button(
          `onboarding:page:open:${field.pageId}`,
          "Back to Page",
          ButtonStyle.Secondary,
        ),
        button("onboarding:dash:routing", "Role Routing", ButtonStyle.Primary),
        button("onboarding:dash:back", "Dashboard", ButtonStyle.Secondary),
      ),
    ],
  };
}

async function getFieldById(fieldId) {
  const prisma = require("../..//lib/prisma");
  const rows = await prisma
    .$queryRawUnsafe(
      `SELECT * FROM "OnboardingFormField" WHERE "id" = $1`,
      fieldId,
    )
    .catch(() => []);
  return rows?.[0] || null;
}

async function buildRoleRoutingPayload(guildId, appTypeId = null) {
  const appTypes = await db.getApplicationTypes(guildId);
  const rules = await db.getRoleRules(guildId, appTypeId);
  const embed = new EmbedBuilder()
    .setTitle("Role Routing Builder")
    .setColor("#5865F2")
    .setDescription(
      guideBlock(
        "Automatically apply roles based on application answers.",
        "Select application type, select the field, select the answer/option condition, then select roles to add on approval.",
        "Configure accepted/denied action roles after answer routing is in place.",
      ) +
        "Option-linked roles are applied on approval by default; explicit role rules can add/remove roles on submit, approval, or manual staff confirmation.",
    )
    .setTimestamp();

  if (!rules.length)
    embed.addFields({
      name: "Answer-Based Rules",
      value: "No answer-based rules configured yet.",
    });
  for (const rule of rules.slice(0, 10)) {
    const type = appTypes.find((t) => t.id === rule.applicationTypeId);
    embed.addFields({
      name: `${rule.applyWhen || "APPROVED"} — ${type?.publicTitle || "Any Type"}`,
      value:
        `Trigger: ${rule.triggerType || "DECISION"}${rule.triggerOptionValue ? ` = ${rule.triggerOptionValue}` : ""}\n` +
        `Add: ${roleList(rule.rolesToAdd)}\nRemove: ${roleList(rule.rolesToRemove)}\nStaff confirm: ${yesNo(rule.requiresStaffConfirm)}`,
      inline: false,
    });
  }

  const rows = [];
  if (appTypes.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("onboarding:select:routingtype")
          .setPlaceholder("Choose application type for rule")
          .addOptions(
            appTypes.slice(0, 25).map((t) => ({
              label: (t.publicTitle || t.name).slice(0, 100),
              value: t.id,
            })),
          ),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      button(
        "onboarding:dash:actions",
        "Decision Roles / Actions",
        ButtonStyle.Primary,
      ),
      button("onboarding:wizard:step:8", "Next", ButtonStyle.Primary),
      button("onboarding:wizard:step:6", "Back", ButtonStyle.Secondary),
      button("onboarding:dash:back", "Dashboard", ButtonStyle.Secondary),
    ),
  );
  return { embeds: [embed], components: rows };
}

async function buildActionsPayload(guildId, appTypeId = null) {
  const appTypes = await db.getApplicationTypes(guildId);
  const selected = appTypeId
    ? await db.getApplicationType(appTypeId)
    : appTypes[0];
  const embed = new EmbedBuilder()
    .setTitle("Accepted / Denied Action Builder")
    .setColor(selected?.themeColor || "#5865F2")
    .setDescription(
      guideBlock(
        "Define what the bot does when staff approves or denies.",
        selected
          ? "Set the roles to give on accept, roles to remove on accept, pending role, and denied role. Give/remove role lists are capped at 5 each."
          : "Create an application type first, then return here.",
        "After actions, review staff behaviour and panel design.",
      ) +
        (selected
          ? `**Application type:** ${selected.publicTitle || selected.name}\n` +
            `**Give on accept, up to 5:** ${roleList(selected.acceptRoleIds)}\n` +
            `**Remove on accept, up to 5:** ${roleList(selected.removeRoleIds)}\n` +
            `**Pending role:** ${selected.pendingRoleId ? `<@&${selected.pendingRoleId}>` : "None"}\n` +
            `**Denied role:** ${selected.denyRoleId ? `<@&${selected.denyRoleId}>` : "None"}\n` +
            `**Denied action:** ${selected.denyAction || "DM_ONLY"}\n` +
            `**DM applicant on decision:** ${yesNo(selected.sendDmOnDecision !== false)}\n` +
            `**Kick on deny:** ${yesNo(selected.kickOnDeny)}\n` +
            `**Ban on deny:** ${yesNo(selected.banOnDeny)}\n\n` +
            "Defaults: approval gives accepted roles plus selected option-linked roles; deny sends DM only; kick/ban are disabled unless explicitly set."
          : "Create an application type before configuring actions."),
    )
    .setTimestamp();

  const rows = [];
  if (appTypes.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("onboarding:select:actiontype")
          .setPlaceholder("Select application type")
          .addOptions(
            appTypes.slice(0, 25).map((t) => ({
              label: (t.publicTitle || t.name).slice(0, 100),
              value: t.id,
            })),
          ),
      ),
    );
  }
  if (selected) {
    rows.push(
      new ActionRowBuilder().addComponents(
        button(
          `onboarding:type:setroles:accept:${selected.id}`,
          "Give Roles on Accept",
          ButtonStyle.Success,
        ),
        button(
          `onboarding:type:setroles:remove:${selected.id}`,
          "Remove Roles on Accept",
          ButtonStyle.Secondary,
        ),
        button(
          `onboarding:type:setroles:pending:${selected.id}`,
          "Pending Role",
          ButtonStyle.Secondary,
        ),
        button(
          `onboarding:type:setroles:denied:${selected.id}`,
          "Denied Role",
          ButtonStyle.Secondary,
        ),
      ),
    );
    rows.push(
      new ActionRowBuilder().addComponents(
        button(
          `onboarding:type:denytoggles:${selected.id}`,
          "Deny Toggles",
          ButtonStyle.Danger,
        ),
        button(
          `onboarding:type:review:${selected.id}`,
          "Review Behaviour",
          ButtonStyle.Primary,
        ),
        button("onboarding:wizard:step:9", "Next", ButtonStyle.Primary),
        button("onboarding:dash:back", "Dashboard", ButtonStyle.Secondary),
      ),
    );
  }
  return { embeds: [embed], components: rows };
}

async function buildReviewBehaviourPayload(guildId, appTypeId = null) {
  const config = await db.getConfig(guildId);
  const appTypes = await db.getApplicationTypes(guildId);
  const selected = appTypeId
    ? await db.getApplicationType(appTypeId)
    : appTypes[0];
  const embed = new EmbedBuilder()
    .setTitle("Review Behaviour Settings")
    .setColor("#5865F2")
    .setDescription(
      guideBlock(
        "Decide how staff receives and works each application.",
        "Confirm the default review channel, then choose a type if it needs a channel override or custom review behaviour.",
        "After review settings, design the public panel and preview the full flow.",
      ) +
        `**Default review channel:** ${config?.defaultReviewChannelId ? `<#${config.defaultReviewChannelId}>` : "Not set"}\n` +
        (selected
          ? `**Selected type:** ${selected.publicTitle || selected.name}\n` +
            `**Override channel:** ${selected.reviewChannelId ? `<#${selected.reviewChannelId}>` : "Default"}\n` +
            `**Staff notes:** Yes\n` +
            `**Request changes:** ${yesNo(selected.allowRequestChanges !== false)}\n` +
            `**Applicant edit after request:** ${yesNo(selected.allowApplicantEdit)}\n` +
            `**Review threads:** ${yesNo(selected.allowReviewThread !== false)}\n` +
            `**Auto-create review thread:** No\n` +
            `**Pull applicant into thread:** ${yesNo(selected.allowPullApplicantIntoThread !== false)}\n` +
            `**Receipt TXT:** Yes\n` +
            `**Long answers:** Summary first; View Full for complete detail\n` +
            `**Claim system:** Not enabled`
          : "Create an application type before configuring per-type behaviour."),
    )
    .setTimestamp();

  const rows = [];
  rows.push(
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("onboarding:select:reviewchannel")
        .setPlaceholder("Default review channel")
        .setChannelTypes([ChannelType.GuildText]),
    ),
  );
  if (appTypes.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("onboarding:select:reviewtype")
          .setPlaceholder("Select application type")
          .addOptions(
            appTypes.slice(0, 25).map((t) => ({
              label: (t.publicTitle || t.name).slice(0, 100),
              value: t.id,
            })),
          ),
      ),
    );
  }
  if (selected)
    rows.push(
      new ActionRowBuilder().addComponents(
        button(
          `onboarding:type:reviewchannel:${selected.id}`,
          "Per-Type Review Channel",
          ButtonStyle.Primary,
        ),
        button(
          `onboarding:type:reviewtoggles:${selected.id}`,
          "Toggle Behaviour",
          ButtonStyle.Secondary,
        ),
        button("onboarding:wizard:step:10", "Next", ButtonStyle.Primary),
        button("onboarding:dash:back", "Dashboard", ButtonStyle.Secondary),
      ),
    );
  return { embeds: [embed], components: rows };
}

async function buildPanelDesignPayload(guild, config) {
  const appTypes = await db.getApplicationTypes(guild.id);
  const embed = buildPublicPanelEmbed(
    config,
    guild,
    appTypes.filter((t) => t.enabled),
    false,
  );
  return {
    content:
      guideBlock(
        "Design the public message members use to start applications.",
        "Edit the embed text/media first, then adjust button labels/styles from Application Types.",
        "Preview the full flow before publishing or repairing the live panel.",
      ) +
      "Public panel design preview. The embed below is what users will see.",
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        button(
          "onboarding:panel:embed",
          "Edit Embed Text",
          ButtonStyle.Primary,
        ),
        button(
          "onboarding:panel:media",
          "Images / Color",
          ButtonStyle.Secondary,
        ),
        button(
          "onboarding:panel:toggles",
          "Icon/Banner/Branding",
          ButtonStyle.Secondary,
        ),
      ),
      new ActionRowBuilder().addComponents(
        button(
          "onboarding:dash:types",
          "Button Labels / Styles",
          ButtonStyle.Primary,
        ),
        button(
          "onboarding:dash:preview",
          "Preview Full Flow",
          ButtonStyle.Primary,
        ),
        button("onboarding:wizard:step:11", "Next", ButtonStyle.Primary),
        button("onboarding:dash:back", "Dashboard", ButtonStyle.Secondary),
      ),
    ],
  };
}

async function buildPreviewFlowPayload(guild, config) {
  const appTypes = await db.getApplicationTypes(guild.id);
  const firstType = appTypes[0];
  const pages = firstType ? await db.getFormPages(firstType.id) : [];
  let fields = [];
  if (firstType) fields = await db.getAllFormFieldsForType(firstType.id);
  const embed = new EmbedBuilder()
    .setTitle("Preview Full User Flow")
    .setColor(config?.panelEmbedColor || firstType?.themeColor || "#5865F2")
    .setDescription(
      guideBlock(
        "Check the whole experience before users see it.",
        "Review the panel, DM start, form pages, submission preview, staff card, and decision outcome below.",
        "If anything is missing, go back to the relevant builder. If it looks right, publish the panel.",
      ) +
        "This preview shows the major user/staff surfaces before publishing. It does not submit a real application.\n\n" +
        `**1. Public panel:** ${config?.panelEmbedTitle || "Application Forms"}\n` +
        `**2. Server reply:** Application started. Check your DMs.\n` +
        `**3. DM intro:** Applying for ${firstType?.publicTitle || "an application type"}.\n` +
        `**4. Form pages:** ${pages.length} page(s), ${fields.length} field(s).\n` +
        `**5. Submission preview:** User reviews answers, can edit pages, submit, or cancel.\n` +
        `**6. Staff review card:** Summary first, selected roles, notes/thread/receipt status.\n` +
        `**7. Decision preview:** Approve applies accepted + linked roles; deny follows configured action.`,
    )
    .setTimestamp();
  if (fields.length) {
    embed.addFields({
      name: "Configured Fields",
      value: fields
        .slice(0, 10)
        .map((f) => `- ${fieldTypeLabel(f.fieldType)}: ${f.label}`)
        .join("\n"),
    });
  }
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        button(
          "onboarding:dash:paneldesign",
          "Panel Design",
          ButtonStyle.Secondary,
        ),
        button(
          "onboarding:dash:publish",
          "Publish Panel",
          ButtonStyle.Success,
          !config?.enabled || !config?.panelChannelId,
        ),
        button("onboarding:wizard:step:12", "Next", ButtonStyle.Primary),
        button("onboarding:dash:back", "Dashboard", ButtonStyle.Secondary),
      ),
    ],
  };
}

function simplePayload(title, description) {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor("#5865F2"),
    ],
    components: [],
  };
}

module.exports = {
  FIELD_TYPES,
  WIZARD_STEPS,
  buildWizardPayload,
  buildPermissionsPayload,
  buildApplicationTypesPayload,
  buildTypeManagerPayload,
  buildFormBuilderPayload,
  buildPageBuilderPayload,
  buildFieldManagerPayload,
  buildRoleRoutingPayload,
  buildActionsPayload,
  buildReviewBehaviourPayload,
  buildPanelDesignPayload,
  buildPreviewFlowPayload,
  fieldTypeLabel,
  simplePayload,
};
