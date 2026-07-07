"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");
const automodService = require("../../../modules/automod/service");
const enforcement = require("../../../modules/automod/enforcement");
const {
  buildDashboardEmbed,
  buildDashboardButtons,
  buildAdvancedLockedEmbed,
  buildRuleListEmbed,
  buildRuleDetailEmbed,
  buildStepEmbed,
  buildPreviewEmbed,
  buildRuleCreatedEmbed,
} = require("../../../modules/automod/embeds");
const {
  getSession,
  setSession,
  clearSession,
} = require("../../../modules/automod/sessions");

const PAGE_SIZE = 5;

// ── Helpers ──────────────────────────────────────────────────────────────

function requireAccess(interaction) {
  if (!automodService.checkAutomodAccess(interaction)) {
    interaction
      .reply({
        content:
          "🔒 You need Manage Guild, Manage Messages, Moderate Members, or Administrator permission.",
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return false;
  }
  return true;
}

function ruleActionButtons(ruleId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`automod:rule:edit:${ruleId}`)
        .setLabel("Edit")
        .setEmoji("✏️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`automod:rule:action:${ruleId}`)
        .setLabel("Change Action")
        .setEmoji("⚡")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`automod:rule:toggle:${ruleId}`)
        .setLabel("Enable/Disable")
        .setEmoji("⏸️")
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`automod:rule:test:${ruleId}`)
        .setLabel("Test")
        .setEmoji("🧪")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`automod:rule:delete:${ruleId}`)
        .setLabel("Delete")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("automod:list")
        .setLabel("Back to List")
        .setEmoji("⬅️")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function renderDashboard(interaction) {
  const guildId = interaction.guildId;
  const [settings, rules, hasAdvanced] = await Promise.all([
    automodService.getGuildAutomodSettings(guildId),
    automodService.getRules(guildId),
    automodService.hasAdvancedAccess(guildId),
  ]);

  const embed = await buildDashboardEmbed({
    guild: interaction.guild,
    settings,
    rules,
    hasAdvanced,
  });

  return interaction.editReply({
    embeds: [embed],
    components: buildDashboardButtons(),
  });
}

async function renderRuleList(interaction, page = 0) {
  const rules = await automodService.getRules(interaction.guildId);
  const totalPages = Math.max(1, Math.ceil(rules.length / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 0), totalPages - 1);
  setSession(interaction.user.id, { listPage: clampedPage });

  const embed = buildRuleListEmbed(rules, clampedPage, PAGE_SIZE);
  const pageRules = rules.slice(
    clampedPage * PAGE_SIZE,
    clampedPage * PAGE_SIZE + PAGE_SIZE,
  );

  const components = [];

  if (pageRules.length > 0) {
    const options = pageRules.map((r) =>
      new StringSelectMenuOptionBuilder()
        .setLabel((r.name || r.phrase).substring(0, 100))
        .setDescription(
          `${automodService.ACTION_LABELS[r.action] || r.action} • ${r.enabled ? "Enabled" : "Disabled"}`,
        )
        .setValue(r.id)
        .setEmoji(r.enabled ? "🟢" : "⚪"),
    );
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("automod:select:rule")
          .setPlaceholder("Select a rule to manage...")
          .addOptions(options),
      ),
    );
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("automod:list:prev")
        .setLabel("Previous")
        .setEmoji("◀️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(clampedPage === 0),
      new ButtonBuilder()
        .setCustomId("automod:list:next")
        .setLabel("Next")
        .setEmoji("▶️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(clampedPage >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId("automod:dashboard")
        .setLabel("Back")
        .setEmoji("⬅️")
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return interaction.editReply({ embeds: [embed], components });
}

async function showRuleSelect(interaction, intent, title) {
  setSession(interaction.user.id, { selectIntent: intent });
  const rules = await automodService.getRules(interaction.guildId);

  if (rules.length === 0) {
    return interaction.editReply({
      content:
        "No automod rules configured yet. Click **➕ Add Rule** on the dashboard first.",
      embeds: [],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("automod:dashboard")
            .setLabel("Back")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  }

  const options = rules.slice(0, 25).map((r) =>
    new StringSelectMenuOptionBuilder()
      .setLabel((r.name || r.phrase).substring(0, 100))
      .setDescription(
        `${automodService.ACTION_LABELS[r.action] || r.action} • ${r.enabled ? "Enabled" : "Disabled"}`,
      )
      .setValue(r.id)
      .setEmoji(r.enabled ? "🟢" : "⚪"),
  );

  const embed = new EmbedBuilder()
    .setTitle(`🛡️ ${title}`)
    .setDescription("Select a rule below.")
    .setColor("#5865F2");

  return interaction.editReply({
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("automod:select:rule")
          .setPlaceholder("Select a rule...")
          .addOptions(options),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("automod:dashboard")
          .setLabel("Back")
          .setEmoji("⬅️")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

async function showRuleDetail(interaction, ruleId) {
  const rule = await automodService.getRule(ruleId, interaction.guildId);
  if (!rule) {
    return interaction.editReply({
      content: "❌ Rule not found. It may have been deleted.",
      embeds: [],
      components: [],
    });
  }
  const embed = buildRuleDetailEmbed(rule);
  return interaction.editReply({
    embeds: [embed],
    components: ruleActionButtons(rule.id),
  });
}

function createBasicsModal() {
  const modal = new ModalBuilder()
    .setCustomId("automod:modal:create")
    .setTitle("Add Automod Rule");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("name")
        .setLabel("Rule Name (1-50 chars)")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(50)
        .setPlaceholder("e.g., Bad Language Filter")
        .setRequired(true),
    ),
  );
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("phrase")
        .setLabel("Phrase / Keyword")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setPlaceholder("e.g., badword")
        .setRequired(true),
    ),
  );
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("matchType")
        .setLabel("Match Type")
        .setPlaceholder("contains/exact/starts_with/ends_with/word_boundary")
        .setStyle(TextInputStyle.Short)
        .setValue("contains")
        .setRequired(true),
    ),
  );
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("action")
        .setLabel("Action")
        .setPlaceholder(
          "review/delete/warn/timeout/delete_and_timeout/silent_log",
        )
        .setStyle(TextInputStyle.Short)
        .setValue("review")
        .setRequired(true),
    ),
  );
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("severity")
        .setLabel("Severity: low/medium/high")
        .setStyle(TextInputStyle.Short)
        .setValue("medium")
        .setRequired(false),
    ),
  );

  return modal;
}

function configureMessageModal(action) {
  const modal = new ModalBuilder()
    .setCustomId("automod:modal:configure:message")
    .setTitle("Configure Action Options");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("userMessage")
        .setLabel("User-facing message (optional)")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(700)
        .setPlaceholder(
          "{userMention} triggered automod and was timed out for {duration}. {appealInfo}",
        )
        .setRequired(false),
    ),
  );

  if (action === "TIMEOUT" || action === "DELETE_AND_TIMEOUT") {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("timeoutDuration")
          .setLabel("Timeout duration (e.g. 10m, 1h, 1d)")
          .setStyle(TextInputStyle.Short)
          .setValue("10m")
          .setRequired(true),
      ),
    );
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("appealEnabled")
          .setLabel("Allow appeals? (yes/no)")
          .setStyle(TextInputStyle.Short)
          .setValue("yes")
          .setRequired(true),
      ),
    );
    if (action === "TIMEOUT") {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("deleteOriginal")
            .setLabel("Delete the original message? (yes/no)")
            .setStyle(TextInputStyle.Short)
            .setValue("no")
            .setRequired(true),
        ),
      );
    }
  } else if (action === "WARN") {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("appealEnabled")
          .setLabel("Allow appeals? (yes/no)")
          .setStyle(TextInputStyle.Short)
          .setValue("no")
          .setRequired(true),
      ),
    );
  }

  return modal;
}

function exemptStepEmbedAndButtons(session) {
  const exemptRoleIds = session.exemptRoleIds || [];
  const ignoredChannelIds = session.ignoredChannelIds || [];

  const embed = buildStepEmbed(
    3,
    4,
    "Exempt Roles & Ignored Channels",
    `**Exempt roles:** ${exemptRoleIds.length ? exemptRoleIds.map((id) => `<@&${id}>`).join(", ") : "None"}\n` +
      `**Ignored channels:** ${ignoredChannelIds.length ? ignoredChannelIds.map((id) => `<#${id}>`).join(", ") : "None"}\n\n` +
      "Optional — configure below or skip to preview.",
  );

  const components = [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("automod:select:exemptroles")
        .setPlaceholder("Select exempt roles (optional)...")
        .setMinValues(0)
        .setMaxValues(10),
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("automod:select:ignoredchannels")
        .setPlaceholder("Select ignored channels (optional)...")
        .setChannelTypes([ChannelType.GuildText, ChannelType.GuildAnnouncement])
        .setMinValues(0)
        .setMaxValues(10),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("automod:wizard:preview")
        .setLabel("Continue to Preview")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("automod:wizard:cancel")
        .setLabel("Cancel")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, components };
}

async function goToExemptStepOrPreview(interaction) {
  const hasAdvanced = await automodService.hasAdvancedAccess(
    interaction.guildId,
  );
  if (!hasAdvanced) {
    return showPreview(interaction);
  }
  const session = getSession(interaction.user.id);
  const { embed, components } = exemptStepEmbedAndButtons(session);
  return interaction.editReply({ embeds: [embed], components });
}

async function showPreview(interaction) {
  const session = getSession(interaction.user.id);
  const embed = buildPreviewEmbed(session);
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("automod:wizard:save")
      .setLabel(session.editingRuleId ? "Save Changes" : "Save Rule")
      .setEmoji("💾")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("automod:wizard:cancel")
      .setLabel("Cancel")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Secondary),
  );
  return interaction.editReply({ embeds: [embed], components: [buttons] });
}

/**
 * Pre-populate the wizard session with an existing rule's full config before
 * opening the edit-basics modal, so skipping later wizard steps (message
 * config / exempt roles / ignored channels) preserves the current values
 * instead of wiping them back to defaults on save.
 */
function primeEditSession(userId, rule) {
  setSession(userId, {
    editingRuleId: rule.id,
    name: rule.name || rule.phrase,
    phrase: rule.phrase,
    matchType: rule.matchType,
    action: rule.action,
    severity: rule.severity,
    exemptRoleIds: Array.isArray(rule.exemptRoleIds) ? rule.exemptRoleIds : [],
    ignoredChannelIds: Array.isArray(rule.ignoredChannelIds)
      ? rule.ignoredChannelIds
      : [],
    reviewChannelId: rule.reviewChannelId || null,
    timeoutSeconds: rule.timeoutSeconds || null,
    deleteMessage: rule.deleteMessage ?? false,
    userMessage: rule.userMessage || null,
    appealEnabled: rule.appealEnabled ?? false,
  });
}

function buildEditBasicsModal(rule) {
  const modal = new ModalBuilder()
    .setCustomId("automod:modal:edit:basics")
    .setTitle("Edit Automod Rule");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("name")
        .setLabel("Rule Name (1-50 chars)")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(50)
        .setValue(rule.name || rule.phrase)
        .setRequired(true),
    ),
  );
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("phrase")
        .setLabel("Phrase / Keyword")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setValue(rule.phrase)
        .setRequired(true),
    ),
  );
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("matchType")
        .setLabel("Match Type")
        .setPlaceholder("contains/exact/starts_with/ends_with/word_boundary")
        .setStyle(TextInputStyle.Short)
        .setValue(rule.matchType.toLowerCase())
        .setRequired(true),
    ),
  );
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("action")
        .setLabel("Action")
        .setPlaceholder(
          "review/delete/warn/timeout/delete_and_timeout/silent_log",
        )
        .setStyle(TextInputStyle.Short)
        .setValue(rule.action.toLowerCase())
        .setRequired(true),
    ),
  );
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("severity")
        .setLabel("Severity: low/medium/high")
        .setStyle(TextInputStyle.Short)
        .setValue((rule.severity || "MEDIUM").toLowerCase())
        .setRequired(false),
    ),
  );

  return modal;
}

function buildTestModal(ruleId) {
  const modal = new ModalBuilder()
    .setCustomId(`automod:modal:test:${ruleId}`)
    .setTitle("Test Automod Rule");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("testMessage")
        .setLabel("Sample message to test")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(true),
    ),
  );
  return modal;
}

async function showActionButtons(interaction, ruleId) {
  const rule = await automodService.getRule(ruleId, interaction.guildId);
  if (!rule) {
    return interaction.editReply({
      content: "❌ Rule not found.",
      embeds: [],
      components: [],
    });
  }
  const rows = [];
  const buttons = automodService.ACTIONS.map((a) =>
    new ButtonBuilder()
      .setCustomId(`automod:rule:setaction:${ruleId}:${a}`)
      .setLabel(automodService.ACTION_LABELS[a] || a)
      .setStyle(
        a === rule.action ? ButtonStyle.Success : ButtonStyle.Secondary,
      ),
  );
  for (let i = 0; i < buttons.length; i += 3) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 3)));
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`automod:rule:edit:${ruleId}`)
        .setLabel("Back to Rule")
        .setEmoji("⬅️")
        .setStyle(ButtonStyle.Secondary),
    ),
  );
  return interaction.editReply({
    content: `Choose a new action for **${rule.name || rule.phrase}**:`,
    embeds: [],
    components: rows,
  });
}

async function showDeleteConfirm(interaction, ruleId) {
  const rule = await automodService.getRule(ruleId, interaction.guildId);
  if (!rule) {
    return interaction.editReply({
      content: "❌ Rule not found.",
      embeds: [],
      components: [],
    });
  }
  const embed = new EmbedBuilder()
    .setTitle("🗑️ Confirm Deletion")
    .setDescription(
      `Are you sure you want to delete **${rule.name || rule.phrase}**?\n\nThis cannot be undone.`,
    )
    .setColor("#E74C3C");
  return interaction.editReply({
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`automod:rule:delete:confirm:${ruleId}`)
          .setLabel("Confirm Delete")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("automod:dashboard")
          .setLabel("Cancel")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = [
  // Dashboard refresh / back
  {
    customIdPrefix: "automod:dashboard",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      clearSession(interaction.user.id);
      await renderDashboard(interaction);
    },
  },

  // Add Rule
  {
    customIdPrefix: "automod:add",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      const [count, limit] = await Promise.all([
        automodService.getRuleCount(interaction.guildId),
        automodService.getRuleLimit(interaction.guildId),
      ]);
      if (count >= limit) {
        const hasAdvanced = await automodService.hasAdvancedAccess(
          interaction.guildId,
        );
        if (!hasAdvanced) {
          return interaction.reply({
            embeds: [buildAdvancedLockedEmbed()],
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.reply({
          content: `⚠️ This server already has ${limit} automod rules. Delete one before adding another.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      clearSession(interaction.user.id);
      await interaction.showModal(createBasicsModal());
    },
  },

  // View Rules (list)
  {
    customIdPrefix: "automod:list:prev",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      const session = getSession(interaction.user.id);
      await renderRuleList(interaction, (session.listPage || 0) - 1);
    },
  },
  {
    customIdPrefix: "automod:list:next",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      const session = getSession(interaction.user.id);
      await renderRuleList(interaction, (session.listPage || 0) + 1);
    },
  },
  {
    customIdPrefix: "automod:list",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      await renderRuleList(interaction, 0);
    },
  },

  // Edit Rule (dashboard shortcut -> select)
  {
    customIdPrefix: "automod:edit",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      await showRuleSelect(interaction, "edit", "Edit Rule");
    },
  },

  // Actions (change action type shortcut -> select)
  {
    customIdPrefix: "automod:action",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      await showRuleSelect(interaction, "action", "Change Rule Action");
    },
  },

  // Test Rule
  {
    customIdPrefix: "automod:test",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      const hasAdvanced = await automodService.hasAdvancedAccess(
        interaction.guildId,
      );
      if (!hasAdvanced) {
        return interaction.reply({
          embeds: [buildAdvancedLockedEmbed()],
          flags: MessageFlags.Ephemeral,
        });
      }
      await interaction.deferUpdate().catch(() => {});
      await showRuleSelect(interaction, "test", "Test Rule");
    },
  },

  // Delete Rule (dashboard shortcut -> select)
  {
    customIdPrefix: "automod:delete",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      await showRuleSelect(interaction, "delete", "Delete Rule");
    },
  },

  // Enable/Disable (dashboard shortcut -> select)
  {
    customIdPrefix: "automod:toggle",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      await showRuleSelect(interaction, "toggle", "Enable/Disable Rule");
    },
  },

  // Settings
  {
    customIdPrefix: "automod:settings:toggle",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      const settings = await automodService.getGuildAutomodSettings(
        interaction.guildId,
      );
      await automodService.updateGuildAutomodSettings(interaction.guildId, {
        automodEnabled: !settings.automodEnabled,
      });
      await renderDashboard(interaction);
    },
  },
  {
    customIdPrefix: "automod:settings:reviewchannel",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      await interaction.editReply({
        content: "Select the channel for automod review/log embeds:",
        embeds: [],
        components: [
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId("automod:select:reviewchannel")
              .setPlaceholder("Choose a channel...")
              .setChannelTypes([
                ChannelType.GuildText,
                ChannelType.GuildAnnouncement,
              ]),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("automod:settings")
              .setLabel("Back")
              .setEmoji("⬅️")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
    },
  },
  {
    customIdPrefix: "automod:settings:defaultaction",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      const options = automodService.ACTIONS.map((a) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(automodService.ACTION_LABELS[a] || a)
          .setValue(a),
      );
      await interaction.editReply({
        content: "Select the default action for new REVIEW escalations:",
        embeds: [],
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("automod:select:defaultaction")
              .setPlaceholder("Choose default action...")
              .addOptions(options),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("automod:settings")
              .setLabel("Back")
              .setEmoji("⬅️")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
    },
  },
  {
    customIdPrefix: "automod:settings",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      const settings = await automodService.getGuildAutomodSettings(
        interaction.guildId,
      );
      const embed = new EmbedBuilder()
        .setTitle("⚙️ Automod Settings")
        .setColor("#5865F2")
        .addFields(
          {
            name: "Status",
            value: settings.automodEnabled ? "🟢 Enabled" : "🔴 Disabled",
            inline: true,
          },
          {
            name: "Review Channel",
            value: settings.automodReviewChannelId
              ? `<#${settings.automodReviewChannelId}>`
              : "Not set",
            inline: true,
          },
          {
            name: "Default Action",
            value:
              automodService.ACTION_LABELS[settings.automodDefaultAction] ||
              "Review message",
            inline: true,
          },
        );

      await interaction.editReply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("automod:settings:toggle")
              .setLabel(
                settings.automodEnabled ? "Disable Automod" : "Enable Automod",
              )
              .setEmoji("🔌")
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId("automod:settings:reviewchannel")
              .setLabel("Set Review Channel")
              .setEmoji("📨")
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId("automod:settings:defaultaction")
              .setLabel("Set Default Action")
              .setEmoji("⚡")
              .setStyle(ButtonStyle.Secondary),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("automod:dashboard")
              .setLabel("Back")
              .setEmoji("⬅️")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
    },
  },

  // Per-rule detail buttons
  {
    customIdPrefix: "automod:rule:edit:",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      const ruleId = interaction.customId.split(":")[3];
      const rule = await automodService.getRule(ruleId, interaction.guildId);
      if (!rule) {
        return interaction.reply({
          content: "❌ Rule not found.",
          flags: MessageFlags.Ephemeral,
        });
      }
      primeEditSession(interaction.user.id, rule);
      await interaction.showModal(buildEditBasicsModal(rule));
    },
  },
  {
    customIdPrefix: "automod:rule:toggle:",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      const ruleId = interaction.customId.split(":")[3];
      const updated = await automodService.toggleRule(
        ruleId,
        interaction.guildId,
      );
      if (!updated) {
        return interaction.editReply({
          content: "❌ Rule not found.",
          embeds: [],
          components: [],
        });
      }
      await showRuleDetail(interaction, ruleId);
    },
  },
  {
    customIdPrefix: "automod:rule:test:",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      const hasAdvanced = await automodService.hasAdvancedAccess(
        interaction.guildId,
      );
      if (!hasAdvanced) {
        return interaction.reply({
          embeds: [buildAdvancedLockedEmbed()],
          flags: MessageFlags.Ephemeral,
        });
      }
      const ruleId = interaction.customId.split(":")[3];
      await interaction.showModal(buildTestModal(ruleId));
    },
  },
  {
    customIdPrefix: "automod:rule:delete:",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      const ruleId = interaction.customId.split(":")[3];
      await showDeleteConfirm(interaction, ruleId);
    },
  },
  {
    customIdPrefix: "automod:rule:delete:confirm:",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      const ruleId = interaction.customId.split(":")[4];
      const rule = await automodService.getRule(ruleId, interaction.guildId);
      const name = rule?.name || rule?.phrase || "Unknown";
      await automodService.deleteRule(ruleId, interaction.guildId);
      await interaction.editReply({
        content: `🗑️ **${name}** has been deleted.`,
        embeds: [],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("automod:dashboard")
              .setLabel("Back to Dashboard")
              .setEmoji("⬅️")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
    },
  },
  {
    customIdPrefix: "automod:rule:action:",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      const ruleId = interaction.customId.split(":")[3];
      await showActionButtons(interaction, ruleId);
    },
  },
  {
    customIdPrefix: "automod:rule:setaction:",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      const parts = interaction.customId.split(":");
      const ruleId = parts[3];
      const action = parts[4];

      if (action === "TIMEOUT" || action === "DELETE_AND_TIMEOUT") {
        const hasAdvanced = await automodService.hasAdvancedAccess(
          interaction.guildId,
        );
        if (!hasAdvanced) {
          return interaction.reply({
            embeds: [buildAdvancedLockedEmbed()],
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      await interaction.deferUpdate().catch(() => {});
      await automodService.updateRule(ruleId, interaction.guildId, { action });
      await showRuleDetail(interaction, ruleId);
    },
  },

  // ── Rule creation/edit wizard ────────────────────────────────────────────
  {
    customIdPrefix: "automod:wizard:configure:message",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      const session = getSession(interaction.user.id);
      await interaction.showModal(configureMessageModal(session.action));
    },
  },
  {
    customIdPrefix: "automod:wizard:skip:message",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      const session = getSession(interaction.user.id);
      // Only reset to defaults for brand-new rules. When editing an existing
      // rule, "Skip" means "leave the current message/timeout/appeal config
      // as-is" — it must not wipe values the rule already had.
      if (!session.editingRuleId) {
        setSession(interaction.user.id, {
          userMessage: null,
          timeoutSeconds: null,
          appealEnabled: false,
          deleteMessage: false,
        });
      }
      await goToExemptStepOrPreview(interaction);
    },
  },
  {
    customIdPrefix: "automod:wizard:preview",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      await showPreview(interaction);
    },
  },
  {
    customIdPrefix: "automod:wizard:cancel",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      clearSession(interaction.user.id);
      await renderDashboard(interaction);
    },
  },
  {
    customIdPrefix: "automod:wizard:save",
    async execute(interaction) {
      if (!requireAccess(interaction)) return;
      await interaction.deferUpdate().catch(() => {});
      const session = getSession(interaction.user.id);

      if (!session.name || !session.phrase || !session.action) {
        return interaction.editReply({
          content: "❌ Missing required fields. Please start again.",
          embeds: [],
          components: [],
        });
      }

      const ruleData = {
        name: session.name,
        phrase: session.phrase,
        matchType: session.matchType || "CONTAINS",
        action: session.action,
        severity: session.severity || "MEDIUM",
        exemptRoleIds: session.exemptRoleIds || null,
        ignoredChannelIds: session.ignoredChannelIds || null,
        timeoutSeconds: session.timeoutSeconds || null,
        deleteMessage: session.deleteMessage ?? false,
        userMessage: session.userMessage || null,
        appealEnabled: session.appealEnabled ?? false,
      };

      let rule;
      try {
        if (session.editingRuleId) {
          await automodService.updateRule(
            session.editingRuleId,
            interaction.guildId,
            ruleData,
          );
          rule = await automodService.getRule(
            session.editingRuleId,
            interaction.guildId,
          );
        } else {
          const [count, limit] = await Promise.all([
            automodService.getRuleCount(interaction.guildId),
            automodService.getRuleLimit(interaction.guildId),
          ]);
          if (count >= limit) {
            clearSession(interaction.user.id);
            return interaction.editReply({
              content: `⚠️ This server already has ${limit} automod rules. Delete one before adding another.`,
              embeds: [],
              components: [],
            });
          }
          rule = await automodService.createRule(interaction.guildId, {
            ...ruleData,
            createdBy: interaction.user.id,
          });
        }
      } catch (err) {
        return interaction.editReply({
          content: `❌ Failed to save rule: ${err.message}`,
          embeds: [],
          components: [],
        });
      }

      clearSession(interaction.user.id);

      const embed = buildRuleCreatedEmbed(rule);
      await interaction.editReply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("automod:dashboard")
              .setLabel("Back to Dashboard")
              .setEmoji("⬅️")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
    },
  },

  // ── Staff review action buttons ─────────────────────────────────────────
  {
    customIdPrefix: "automod:review:",
    async execute(interaction) {
      const parts = interaction.customId.split(":");
      const reviewAction = parts[2];
      const logId = parts.slice(3).join(":");
      await enforcement.handleReviewAction(interaction, reviewAction, logId);
    },
  },
];

module.exports.goToExemptStepOrPreview = goToExemptStepOrPreview;
module.exports.showPreview = showPreview;
module.exports.showRuleDetail = showRuleDetail;
module.exports.renderDashboard = renderDashboard;
module.exports.renderRuleList = renderRuleList;
module.exports.buildEditBasicsModal = buildEditBasicsModal;
module.exports.buildTestModal = buildTestModal;
module.exports.showActionButtons = showActionButtons;
module.exports.showDeleteConfirm = showDeleteConfirm;
module.exports.requireAccess = requireAccess;
module.exports.primeEditSession = primeEditSession;
