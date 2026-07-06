"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { getPremiumStatus } = require("../premium/service");

// ── Constants ──────────────────────────────────────────────────────────────

const TRIGGER_LABELS = {
  SCHEDULED: "⏰ Scheduled Time",
  MEMBER_JOIN: "👋 Member Join",
  MENTION: "💬 Mention Trigger",
  KEYWORD: "🔑 Keyword/Phrase",
};

const TRIGGER_EMOJIS = {
  SCHEDULED: "⏰",
  MEMBER_JOIN: "👋",
  MENTION: "💬",
  KEYWORD: "🔑",
};

const STATUS_LABELS = {
  ACTIVE: "🟢 Active",
  PAUSED: "🟡 Paused",
  FAILED: "🔴 Failed",
};

const RECURRENCE_LABELS = {
  once: "Once",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  every_x_hours: "Every X Hours",
};

// ── Dashboard embed ────────────────────────────────────────────────────────

async function buildDashboardEmbed(guildId, guild) {
  const premium = await getPremiumStatus(guildId);
  const srv = require("../../lib/prisma");
  const posts = await srv.autoPost.findMany({ where: { guildId } });
  const total = posts.length;
  const active = posts.filter((p) => p.status === "ACTIVE").length;
  const paused = posts.filter((p) => p.status === "PAUSED").length;
  const failed = posts.filter((p) => p.status === "FAILED").length;

  // Find next scheduled run
  let nextRunStr = "None";
  const scheduledPosts = posts.filter(
    (p) =>
      p.triggerType === "SCHEDULED" && p.status === "ACTIVE" && p.nextRunAt,
  );
  if (scheduledPosts.length > 0) {
    const next = scheduledPosts.sort(
      (a, b) => new Date(a.nextRunAt) - new Date(b.nextRunAt),
    )[0];
    const unix = Math.floor(new Date(next.nextRunAt).getTime() / 1000);
    nextRunStr = `<t:${unix}:F> (<t:${unix}:R>)`;
  }

  const lastRun = posts
    .filter((p) => p.lastRunAt)
    .sort((a, b) => new Date(b.lastRunAt) - new Date(a.lastRunAt))[0];
  const lastRunStr = lastRun
    ? `<t:${Math.floor(new Date(lastRun.lastRunAt).getTime() / 1000)}:R>`
    : "Never";

  const embed = new EmbedBuilder()
    .setTitle("📣 Discore Auto Posts")
    .setDescription(
      "Create automated posts for reminders, announcements, welcomes, role mentions, and timed community messages.\n\n" +
        "*Times are shown using Discord's local timestamp display.*",
    )
    .setColor("#5865F2")
    .addFields(
      {
        name: "💎 Premium",
        value: premium.isActive ? "✅ Active" : "🔒 Inactive",
        inline: true,
      },
      {
        name: "📊 Auto Posts",
        value: `${total} / 5`,
        inline: true,
      },
      {
        name: "📈 Status",
        value: `Active: ${active} • Paused: ${paused}${failed > 0 ? ` • Failed: ${failed}` : ""}`,
        inline: true,
      },
      {
        name: "⏭️ Next Scheduled Run",
        value: nextRunStr,
        inline: false,
      },
      {
        name: "🕐 Last Post Sent",
        value: lastRunStr,
        inline: true,
      },
      {
        name: "🌍 Timezone Mode",
        value: "Discord timestamps (local time for each user)",
        inline: true,
      },
    )
    .setFooter({ text: "Discore Auto Posts • Premium Feature" })
    .setTimestamp();

  return embed;
}

// ── Premium locked embed ──────────────────────────────────────────────────

function buildPremiumLockedEmbed() {
  return new EmbedBuilder()
    .setTitle("🔒 Auto Posts are Premium")
    .setDescription(
      "Automated scheduled and trigger-based posts are a **Premium Discore** feature.\n\n" +
        "### What you get with Auto Posts:\n" +
        "• **📅 Scheduled Posts** — Daily, weekly, monthly, or custom intervals\n" +
        "• **👋 Join-triggered Posts** — Welcome messages with placeholders\n" +
        "• **💬 Mention Triggers** — Auto-reply when roles/users are mentioned\n" +
        "• **🔑 Keyword Triggers** — Auto-reply on specific phrases\n" +
        "• **🧪 Test Send** — Preview before going live\n" +
        "• **⏸️ Pause/Resume** — Full control\n" +
        "• **Max 5 Auto Posts** per server\n\n" +
        "### 💰 How to Upgrade\n" +
        "Run `/premium` to manage your subscription.",
    )
    .setColor("#F1C40F");
}

// ── List embed for a specific post ────────────────────────────────────────

function buildPostDetailEmbed(post, guild) {
  const triggerLabel = TRIGGER_LABELS[post.triggerType] || post.triggerType;
  const statusLabel = STATUS_LABELS[post.status] || post.status;
  const messageModeLabel =
    post.messageMode === "PLAIN"
      ? "Plain Text"
      : post.messageMode === "EMBED"
        ? "Embed"
        : "Message + Embed";

  const embed = new EmbedBuilder()
    .setTitle(`${TRIGGER_EMOJIS[post.triggerType] || "📌"} ${post.name}`)
    .setColor(post.embedColor || "#5865F2")
    .addFields(
      { name: "Status", value: statusLabel, inline: true },
      { name: "Trigger", value: triggerLabel, inline: true },
      { name: "Message Mode", value: messageModeLabel, inline: true },
      {
        name: "Channel",
        value: post.channelId ? `<#${post.channelId}>` : "Not set",
        inline: true,
      },
    );

  if (post.triggerType === "SCHEDULED") {
    const cfg = post.scheduleConfig || {};
    const recurrence =
      RECURRENCE_LABELS[cfg.recurrence] || cfg.recurrence || "daily";
    const time = cfg.time || "09:00";
    const tz = post.timezone || "UTC";
    embed.addFields(
      {
        name: "Schedule",
        value: `${recurrence} at ${time} (${tz})`,
        inline: true,
      },
      {
        name: "Next Run",
        value: post.nextRunAt
          ? `<t:${Math.floor(new Date(post.nextRunAt).getTime() / 1000)}:F>`
          : "N/A",
        inline: true,
      },
    );
  }

  if (post.lastRunAt) {
    embed.addFields({
      name: "Last Run",
      value: `<t:${Math.floor(new Date(post.lastRunAt).getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  if (post.triggerType === "MEMBER_JOIN") {
    embed.addFields({
      name: "Trigger",
      value: "When a member joins the server",
      inline: false,
    });
  }

  if (post.triggerType === "MENTION" || post.triggerType === "KEYWORD") {
    const cfg = post.triggerConfig || {};
    embed.addFields(
      {
        name: post.triggerType === "MENTION" ? "Watching For" : "Keyword",
        value: cfg.targetId
          ? post.triggerType === "MENTION"
            ? `<@&${cfg.targetId}>`
            : `\`${cfg.phrase || cfg.targetId}\``
          : cfg.phrase || "Not configured",
        inline: true,
      },
      {
        name: "Cooldown",
        value: `${post.cooldownSeconds}s`,
        inline: true,
      },
    );
  }

  if (post.failureCount > 0) {
    embed.addFields({
      name: "⚠️ Failures",
      value: `${post.failureCount} consecutive failures`,
      inline: true,
    });
  }

  if (post.pausedReason) {
    embed.addFields({
      name: "⏸️ Pause Reason",
      value: post.pausedReason,
      inline: false,
    });
  }

  // Show content preview
  if (post.content) {
    const preview =
      post.content.length > 200
        ? post.content.substring(0, 200) + "..."
        : post.content;
    embed.addFields({
      name: "📝 Content Preview",
      value: preview,
      inline: false,
    });
  }

  if (post.embedTitle) {
    embed.addFields({
      name: "📋 Embed Title",
      value:
        post.embedTitle.length > 250
          ? post.embedTitle.substring(0, 250) + "..."
          : post.embedTitle,
      inline: false,
    });
  }

  embed.setFooter({ text: `ID: ${post.id}` }).setTimestamp(post.updatedAt);

  return embed;
}

// ── Create flow embeds ───────────────────────────────────────────────────

function buildStepEmbed(step, title, description, color = "#5865F2") {
  return new EmbedBuilder()
    .setTitle(`📣 Auto Post Setup — ${title}`)
    .setDescription(description)
    .setColor(color)
    .setFooter({ text: `Step ${step} of 5` });
}

// ── Preview embed ────────────────────────────────────────────────────────

function buildPreviewEmbed(post) {
  const embed = new EmbedBuilder()
    .setTitle("📋 Auto Post Preview")
    .setDescription("This is how your auto post will look when sent.")
    .setColor(post.embedColor || "#5865F2");

  if (post.embedTitle)
    embed.addFields({ name: "Title", value: post.embedTitle, inline: false });
  if (post.embedDescription)
    embed.addFields({
      name: "Description",
      value: post.embedDescription,
      inline: false,
    });
  if (post.content) {
    embed.addFields({
      name: "Message Content",
      value:
        post.content.length > 500
          ? post.content.substring(0, 500) + "..."
          : post.content,
      inline: false,
    });
  }
  if (post.embedFooter) embed.setFooter({ text: post.embedFooter });

  return embed;
}

// ── List view ─────────────────────────────────────────────────────────────

function buildPostListEmbed(posts, guild) {
  const embed = new EmbedBuilder()
    .setTitle("📋 Auto Posts List")
    .setColor("#5865F2")
    .setFooter({ text: `Total: ${posts.length} / 5 • Select one to manage` });

  if (posts.length === 0) {
    embed.setDescription(
      "No auto posts configured yet. Click **➕ Create** to set one up.",
    );
    return embed;
  }

  let description = "";
  for (const post of posts) {
    const status =
      post.status === "ACTIVE" ? "🟢" : post.status === "PAUSED" ? "🟡" : "🔴";
    const trigger = TRIGGER_EMOJIS[post.triggerType] || "📌";
    const chan = post.channelId ? `<#${post.channelId}>` : "No channel";
    description += `${status} ${trigger} **${post.name}** — ${chan}\n`;
  }

  embed.setDescription(description);
  return embed;
}

function buildDashboardButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("autopost:create")
        .setLabel("Create")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("autopost:list")
        .setLabel("List")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("autopost:edit")
        .setLabel("Edit")
        .setEmoji("✏️")
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("autopost:pause_resume")
        .setLabel("Pause/Resume")
        .setEmoji("⏸️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("autopost:delete_post")
        .setLabel("Delete")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("autopost:test_send")
        .setLabel("Test Send")
        .setEmoji("🧪")
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("autopost:refresh")
        .setLabel("Refresh")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("autopost:help")
        .setLabel("Help / Guide")
        .setEmoji("❓")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

module.exports = {
  TRIGGER_LABELS,
  TRIGGER_EMOJIS,
  STATUS_LABELS,
  RECURRENCE_LABELS,
  buildDashboardEmbed,
  buildPremiumLockedEmbed,
  buildPostDetailEmbed,
  buildStepEmbed,
  buildPreviewEmbed,
  buildPostListEmbed,
  buildDashboardButtons,
};
