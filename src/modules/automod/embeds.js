"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  ACTION_LABELS,
  MATCH_TYPE_LABELS,
  SEVERITY_LABELS,
  FREE_RULE_LIMIT,
} = require("./service");

// ── Dashboard ──────────────────────────────────────────────────────────────

async function buildDashboardEmbed({ guild, settings, rules, hasAdvanced }) {
  const total = rules.length;
  const active = rules.filter((r) => r.enabled).length;

  const lastTrigger = rules
    .filter((r) => r.lastTriggeredAt)
    .sort(
      (a, b) => new Date(b.lastTriggeredAt) - new Date(a.lastTriggeredAt),
    )[0];
  const lastTriggerStr = lastTrigger
    ? `<t:${Math.floor(new Date(lastTrigger.lastTriggeredAt).getTime() / 1000)}:R>`
    : "None";

  const reviewChannelStr = settings.automodReviewChannelId
    ? `<#${settings.automodReviewChannelId}>`
    : "Not set";
  const logChannelId = settings.moderationLogChannelId || settings.logChannelId;
  const logChannelStr = logChannelId ? `<#${logChannelId}>` : "Not set";

  const embed = new EmbedBuilder()
    .setTitle("🛡️ Discore Automod")
    .setDescription(
      "Automod watches configured phrases and takes action before your staff " +
        "have to start chasing chaos goblins around the server.",
    )
    .setColor(settings.automodEnabled ? "#5865F2" : "#95a5a6")
    .addFields(
      {
        name: "🔌 Status",
        value: settings.automodEnabled ? "🟢 Enabled" : "🔴 Disabled",
        inline: true,
      },
      {
        name: "📌 Rules",
        value: `${active} active / ${total} total${hasAdvanced ? "" : ` (max ${FREE_RULE_LIMIT} free)`}`,
        inline: true,
      },
      {
        name: "💎 Advanced Actions",
        value: hasAdvanced ? "✅ Unlocked" : "🔒 Premium",
        inline: true,
      },
      {
        name: "📨 Review Channel",
        value: reviewChannelStr,
        inline: true,
      },
      {
        name: "📋 Log Channel",
        value: logChannelStr,
        inline: true,
      },
      {
        name: "⚡ Default Action",
        value: ACTION_LABELS[settings.automodDefaultAction] || "Review message",
        inline: true,
      },
      {
        name: "🕐 Last Trigger",
        value: lastTriggerStr,
        inline: true,
      },
      {
        name: "🧠 Mode",
        value: "Fast cached matching",
        inline: true,
      },
    )
    .setFooter({ text: "Discore Automod • Premium moderation tools" })
    .setTimestamp();

  return embed;
}

function buildDashboardButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("automod:add")
        .setLabel("Add Rule")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("automod:list")
        .setLabel("View Rules")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("automod:edit")
        .setLabel("Edit Rule")
        .setEmoji("✏️")
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("automod:action")
        .setLabel("Actions")
        .setEmoji("⚡")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("automod:settings")
        .setLabel("Settings")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("automod:test")
        .setLabel("Test Rule")
        .setEmoji("🧪")
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("automod:delete")
        .setLabel("Delete Rule")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("automod:toggle")
        .setLabel("Enable/Disable")
        .setEmoji("⏸️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("automod:dashboard")
        .setLabel("Refresh")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ── Premium locked embed ──────────────────────────────────────────────────

function buildAdvancedLockedEmbed() {
  return new EmbedBuilder()
    .setTitle("🔒 Advanced Automod is Premium")
    .setDescription(
      "This action requires **Discore Premium**.\n\n" +
        "### What Premium unlocks:\n" +
        "• **⏳ Timeout & Delete+Timeout actions** — real Discord timeouts\n" +
        "• **📝 Appeals integration** — users can appeal automod timeouts\n" +
        "• **💬 Custom user-facing messages** — with placeholders\n" +
        "• **🛡️ Exempt roles & ignored channels**\n" +
        "• **🧪 Test Rule** — preview matches without a real trigger\n" +
        `• **More than ${FREE_RULE_LIMIT} rules** per server\n\n` +
        "### 💰 How to Upgrade\n" +
        "Run `/premium` to manage your subscription.",
    )
    .setColor("#F1C40F");
}

// ── Rule list ──────────────────────────────────────────────────────────────

function buildRuleListEmbed(rules, page, pageSize = 5) {
  const totalPages = Math.max(1, Math.ceil(rules.length / pageSize));
  const start = page * pageSize;
  const pageRules = rules.slice(start, start + pageSize);

  const embed = new EmbedBuilder()
    .setTitle("📋 Automod Rules")
    .setColor("#5865F2")
    .setFooter({
      text: `Page ${page + 1}/${totalPages} • Total: ${rules.length} rule(s)`,
    });

  if (rules.length === 0) {
    embed.setDescription(
      "No automod rules configured yet. Click **➕ Add Rule** to create one.",
    );
    return embed;
  }

  let description = "";
  for (const rule of pageRules) {
    const status = rule.enabled ? "🟢" : "⚪";
    description += `${status} **${rule.name || rule.phrase}**\n`;
    description += `Phrase: \`${rule.phrase}\`\n`;
    description += `Match: ${MATCH_TYPE_LABELS[rule.matchType] || rule.matchType}\n`;
    description += `Action: ${ACTION_LABELS[rule.action] || rule.action}\n`;
    description += `Triggers: ${rule.triggerCount}`;
    if (rule.lastTriggeredAt) {
      description += ` • Last: <t:${Math.floor(new Date(rule.lastTriggeredAt).getTime() / 1000)}:R>`;
    }
    description += "\n\n";
  }

  embed.setDescription(description.trim());
  return embed;
}

// ── Rule detail ─────────────────────────────────────────────────────────────

function buildRuleDetailEmbed(rule) {
  const embed = new EmbedBuilder()
    .setTitle(`${rule.enabled ? "🟢" : "⚪"} ${rule.name || rule.phrase}`)
    .setColor(rule.enabled ? "#5865F2" : "#95a5a6")
    .addFields(
      { name: "Phrase", value: `\`${rule.phrase}\``, inline: true },
      {
        name: "Match Type",
        value: MATCH_TYPE_LABELS[rule.matchType] || rule.matchType,
        inline: true,
      },
      {
        name: "Action",
        value: ACTION_LABELS[rule.action] || rule.action,
        inline: true,
      },
      {
        name: "Severity",
        value: SEVERITY_LABELS[rule.severity] || rule.severity,
        inline: true,
      },
      {
        name: "Status",
        value: rule.enabled ? "🟢 Enabled" : "⚪ Disabled",
        inline: true,
      },
      {
        name: "Triggers",
        value: String(rule.triggerCount || 0),
        inline: true,
      },
    );

  if (rule.action === "TIMEOUT" || rule.action === "DELETE_AND_TIMEOUT") {
    embed.addFields({
      name: "Timeout Duration",
      value: rule.timeoutSeconds
        ? `${Math.round(rule.timeoutSeconds / 60)} minute(s)`
        : "Not set (default 10m)",
      inline: true,
    });
  }

  embed.addFields(
    {
      name: "Appeals",
      value: rule.appealEnabled ? "✅ Enabled" : "❌ Disabled",
      inline: true,
    },
    {
      name: "Exempt Roles",
      value:
        Array.isArray(rule.exemptRoleIds) && rule.exemptRoleIds.length
          ? rule.exemptRoleIds.map((id) => `<@&${id}>`).join(", ")
          : "None",
      inline: false,
    },
    {
      name: "Ignored Channels",
      value:
        Array.isArray(rule.ignoredChannelIds) && rule.ignoredChannelIds.length
          ? rule.ignoredChannelIds.map((id) => `<#${id}>`).join(", ")
          : "None",
      inline: false,
    },
  );

  if (rule.userMessage) {
    embed.addFields({
      name: "User Message",
      value:
        rule.userMessage.length > 300
          ? `${rule.userMessage.slice(0, 300)}...`
          : rule.userMessage,
      inline: false,
    });
  }

  if (rule.lastTriggeredAt) {
    embed.addFields({
      name: "Last Triggered",
      value: `<t:${Math.floor(new Date(rule.lastTriggeredAt).getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  embed.setFooter({ text: `ID: ${rule.id}` }).setTimestamp(rule.updatedAt);
  return embed;
}

// ── Wizard step embed ────────────────────────────────────────────────────

function buildStepEmbed(
  step,
  totalSteps,
  title,
  description,
  color = "#5865F2",
) {
  return new EmbedBuilder()
    .setTitle(`🛡️ Automod Rule Setup — ${title}`)
    .setDescription(description)
    .setColor(color)
    .setFooter({ text: `Step ${step} of ${totalSteps}` });
}

// ── Preview embed ────────────────────────────────────────────────────────

function buildPreviewEmbed(session) {
  const embed = new EmbedBuilder()
    .setTitle("📋 Review Your Automod Rule")
    .setDescription("Review the details before saving.")
    .setColor("#5865F2")
    .addFields(
      { name: "Name", value: session.name || "N/A", inline: true },
      { name: "Phrase", value: `\`${session.phrase || "N/A"}\``, inline: true },
      {
        name: "Match Type",
        value:
          MATCH_TYPE_LABELS[session.matchType] || session.matchType || "N/A",
        inline: true,
      },
      {
        name: "Action",
        value: ACTION_LABELS[session.action] || session.action || "N/A",
        inline: true,
      },
      {
        name: "Severity",
        value: SEVERITY_LABELS[session.severity] || session.severity || "N/A",
        inline: true,
      },
    );

  if (session.action === "TIMEOUT" || session.action === "DELETE_AND_TIMEOUT") {
    embed.addFields({
      name: "Timeout Duration",
      value: session.timeoutSeconds
        ? `${Math.round(session.timeoutSeconds / 60)} minute(s)`
        : "Default (10m)",
      inline: true,
    });
  }

  embed.addFields({
    name: "Appeals Enabled",
    value: session.appealEnabled ? "✅ Yes" : "❌ No",
    inline: true,
  });

  if (session.userMessage) {
    embed.addFields({
      name: "User Message",
      value: session.userMessage,
      inline: false,
    });
  }

  return embed;
}

// ── Success embed ────────────────────────────────────────────────────────

function buildRuleCreatedEmbed(rule) {
  return new EmbedBuilder()
    .setTitle("✅ Automod Rule Created")
    .setColor("#2ecc71")
    .addFields(
      { name: "Name", value: rule.name || rule.phrase, inline: true },
      { name: "Phrase", value: `\`${rule.phrase}\``, inline: true },
      {
        name: "Match Type",
        value: MATCH_TYPE_LABELS[rule.matchType] || rule.matchType,
        inline: true,
      },
      {
        name: "Action",
        value: ACTION_LABELS[rule.action] || rule.action,
        inline: true,
      },
      {
        name: "Timeout Duration",
        value:
          rule.action === "TIMEOUT" || rule.action === "DELETE_AND_TIMEOUT"
            ? rule.timeoutSeconds
              ? `${Math.round(rule.timeoutSeconds / 60)} minute(s)`
              : "Default (10m)"
            : "N/A",
        inline: true,
      },
      {
        name: "Appeals",
        value: rule.appealEnabled ? "✅ Enabled" : "❌ Disabled",
        inline: true,
      },
    )
    .setFooter({ text: `ID: ${rule.id}` });
}

module.exports = {
  buildDashboardEmbed,
  buildDashboardButtons,
  buildAdvancedLockedEmbed,
  buildRuleListEmbed,
  buildRuleDetailEmbed,
  buildStepEmbed,
  buildPreviewEmbed,
  buildRuleCreatedEmbed,
};
