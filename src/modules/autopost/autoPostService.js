"use strict";

const { EmbedBuilder } = require("discord.js");
const prisma = require("../../lib/prisma");
const { getPremiumStatus } = require("../premium/service");
const { DateTime, IANAZone } = require("luxon");

const MAX_POSTS_PER_SERVER = 5;
const MAX_FAILURES = 3;
const VALID_TRIGGER_TYPES = ["SCHEDULED", "MEMBER_JOIN", "MENTION", "KEYWORD"];
const VALID_MESSAGE_MODES = ["PLAIN", "EMBED", "BOTH"];
const VALID_MATCH_TYPES = ["CONTAINS", "EXACT"];
const MAX_CONTENT_LEN = 1900;
const MAX_EMBED_TITLE = 256;
const MAX_EMBED_DESC = 4000;
const MAX_FOOTER = 2048;
const MIN_COOLDOWN = 30;
const MAX_COOLDOWN = 86400;
const NAME_MIN = 1;
const NAME_MAX = 50;
const KEYWORD_MIN = 2;
const KEYWORD_MAX = 100;

// ── Validation ───────────────────────────────────────────────────────────

function validateTimezone(tz) {
  try {
    IANAZone.create(tz);
    return true;
  } catch {
    return false;
  }
}

function validateName(name) {
  if (!name || typeof name !== "string") return "Name is required.";
  const trimmed = name.trim();
  if (trimmed.length < NAME_MIN)
    return `Name must be at least ${NAME_MIN} character.`;
  if (trimmed.length > NAME_MAX)
    return `Name must be ${NAME_MAX} characters or less.`;
  return null;
}

function validateContent(content) {
  if (content && content.length > MAX_CONTENT_LEN) {
    return `Message content must be ${MAX_CONTENT_LEN} characters or less.`;
  }
  return null;
}

function validateEmbedTitle(title) {
  if (title && title.length > MAX_EMBED_TITLE) {
    return `Embed title must be ${MAX_EMBED_TITLE} characters or less.`;
  }
  return null;
}

function validateEmbedDescription(desc) {
  if (desc && desc.length > MAX_EMBED_DESC) {
    return `Embed description must be ${MAX_EMBED_DESC} characters or less.`;
  }
  return null;
}

function validateFooter(footer) {
  if (footer && footer.length > MAX_FOOTER) {
    return `Footer must be ${MAX_FOOTER} characters or less.`;
  }
  return null;
}

function validateCooldown(seconds) {
  const s = parseInt(seconds, 10);
  if (isNaN(s)) return "Cooldown must be a number.";
  if (s < MIN_COOLDOWN)
    return `Cooldown must be at least ${MIN_COOLDOWN} seconds.`;
  if (s > MAX_COOLDOWN)
    return `Cooldown must be at most ${MAX_COOLDOWN} seconds.`;
  return null;
}

// ── Permission helpers ───────────────────────────────────────────────────

function isAdmin(interaction) {
  const member = interaction.member;
  if (!member) return false;
  if (
    member.permissions?.has("Administrator") ||
    member.permissions?.has("ManageGuild")
  ) {
    return true;
  }
  return false;
}

async function checkAdmin(interaction) {
  if (isAdmin(interaction)) return true;
  // Also check discore roles
  const guild = await prisma.guild.findUnique({
    where: { id: interaction.guildId },
    select: { disAdminRoleId: true, discoreManagerRoleId: true },
  });
  if (
    guild?.disAdminRoleId &&
    interaction.member?.roles?.cache?.has(guild.disAdminRoleId)
  )
    return true;
  if (
    guild?.discoreManagerRoleId &&
    interaction.member?.roles?.cache?.has(guild.discoreManagerRoleId)
  )
    return true;
  return false;
}

// ── Premium check ────────────────────────────────────────────────────────

async function checkPremiumActive(guildId) {
  const status = await getPremiumStatus(guildId);
  return status.isActive;
}

// ── CRUD ─────────────────────────────────────────────────────────────────

async function getPostCount(guildId) {
  return prisma.autoPost.count({ where: { guildId } });
}

async function getPosts(guildId) {
  return prisma.autoPost.findMany({
    where: { guildId },
    orderBy: { createdAt: "asc" },
  });
}

async function getPost(postId, guildId) {
  return prisma.autoPost.findFirst({
    where: { id: postId, guildId },
  });
}

async function createPost(guildId, data) {
  return prisma.autoPost.create({
    data: {
      guildId,
      name: data.name,
      triggerType: data.triggerType,
      channelId: data.channelId,
      messageMode: data.messageMode || "PLAIN",
      content: data.content || null,
      embedTitle: data.embedTitle || null,
      embedDescription: data.embedDescription || null,
      embedColor: data.embedColor || null,
      embedFooter: data.embedFooter || null,
      embedImageUrl: data.embedImageUrl || null,
      triggerConfig: data.triggerConfig || null,
      scheduleConfig: data.scheduleConfig || null,
      timezone: data.timezone || "UTC",
      nextRunAt: data.nextRunAt || null,
      cooldownSeconds: data.cooldownSeconds ?? 300,
      createdById: data.createdById,
    },
  });
}

async function updatePost(postId, guildId, data) {
  return prisma.autoPost.updateMany({
    where: { id: postId, guildId },
    data,
  });
}

async function deletePost(postId, guildId) {
  return prisma.autoPost.deleteMany({
    where: { id: postId, guildId },
  });
}

async function pausePost(postId, guildId, reason) {
  return prisma.autoPost.update({
    where: { id: postId },
    data: {
      status: "PAUSED",
      pausedReason: reason || "Manually paused",
      nextRunAt: null,
    },
  });
}

async function resumePost(postId, guildId) {
  const post = await prisma.autoPost.findFirst({
    where: { id: postId, guildId },
  });
  if (!post) return null;
  const nextRun =
    post.triggerType === "SCHEDULED" ? calculateNextRun(post) : null;
  return prisma.autoPost.update({
    where: { id: postId },
    data: {
      status: "ACTIVE",
      pausedReason: null,
      failureCount: 0,
      nextRunAt: nextRun,
    },
  });
}

// ── Scheduling logic ─────────────────────────────────────────────────────

function calculateNextRun(post) {
  if (post.triggerType !== "SCHEDULED") return null;
  const cfg = post.scheduleConfig || {};
  const tz = post.timezone || "UTC";
  const recurrence = cfg.recurrence || "daily";
  const time = cfg.time || "09:00";
  const [hourStr, minuteStr] = time.split(":");
  const hour = parseInt(hourStr, 10) || 9;
  const minute = parseInt(minuteStr, 10) || 0;

  let dt;
  try {
    dt = DateTime.now().setZone(tz);
  } catch {
    dt = DateTime.utc();
  }

  const todayTarget = dt.set({ hour, minute, second: 0, millisecond: 0 });

  switch (recurrence) {
    case "once": {
      // If specific dateTime provided
      if (cfg.dateTime) {
        try {
          return DateTime.fromISO(cfg.dateTime, { zone: tz }).toJSDate();
        } catch {
          return null;
        }
      }
      return todayTarget > dt ? todayTarget.toJSDate() : null;
    }

    case "daily": {
      let next = todayTarget;
      if (next <= dt) next = next.plus({ days: 1 });
      return next.toJSDate();
    }

    case "weekly": {
      const weekday = cfg.weekday ?? dt.weekday; // 1=Mon, 7=Sun
      let next = todayTarget.set({ weekday });
      if (next <= dt) next = next.plus({ weeks: 1 });
      return next.toJSDate();
    }

    case "monthly": {
      const dayOfMonth = Math.min(cfg.dayOfMonth || 1, 28);
      let next = dt
        .set({ day: 1, hour, minute })
        .plus({ days: dayOfMonth - 1 });
      if (next <= dt) next = next.plus({ months: 1 });
      return next.toJSDate();
    }

    case "every_x_hours": {
      const interval = Math.max(1, Math.min(168, cfg.intervalHours || 24));
      const now = new Date();
      // If we have a lastRunAt, base it from there
      const base = post.lastRunAt || post.createdAt || now;
      const next = new Date(base.getTime() + interval * 60 * 60 * 1000);
      // If next is in the past relative to now, fast-forward
      if (next <= now) {
        const mult = Math.ceil(
          (now.getTime() - base.getTime()) / (interval * 60 * 60 * 1000),
        );
        return new Date(base.getTime() + mult * interval * 60 * 60 * 1000);
      }
      return next;
    }

    default:
      return null;
  }
}

// ── Placeholder substitution ─────────────────────────────────────────────

function replacePlaceholders(text, vars) {
  if (!text) return text;
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "gi"), value || "");
  }
  return result;
}

function buildMessagePayload(post, triggerVars = {}) {
  const vars = {
    serverName: triggerVars.serverName || "",
    date: triggerVars.date || new Date().toLocaleDateString(),
    time: triggerVars.time || new Date().toLocaleTimeString(),
    memberCount: triggerVars.memberCount || "",
    user: triggerVars.user || triggerVars.username || "",
    userMention: triggerVars.userMention || "",
    username: triggerVars.username || "",
    displayName: triggerVars.displayName || "",
    channel: triggerVars.channel || "",
    trigger: triggerVars.trigger || "",
    ...triggerVars,
  };

  const payload = {
    content: null,
    embeds: [],
  };

  if (post.messageMode === "PLAIN" || post.messageMode === "BOTH") {
    const content = replacePlaceholders(post.content, vars);
    if (content) {
      // Strip @everyone/@here for safety
      payload.content = content
        .replace(/@everyone/gi, "[blocked]")
        .replace(/@here/gi, "[blocked]");
    }
  }

  if (post.messageMode === "EMBED" || post.messageMode === "BOTH") {
    const embed = new EmbedBuilder();
    if (post.embedTitle)
      embed.setTitle(replacePlaceholders(post.embedTitle, vars));
    if (post.embedDescription)
      embed.setDescription(replacePlaceholders(post.embedDescription, vars));
    if (post.embedColor) {
      try {
        embed.setColor(post.embedColor);
      } catch {
        embed.setColor("#5865F2");
      }
    } else {
      embed.setColor("#5865F2");
    }
    if (post.embedFooter)
      embed.setFooter({ text: replacePlaceholders(post.embedFooter, vars) });
    if (post.embedImageUrl)
      embed.setImage(replacePlaceholders(post.embedImageUrl, vars));
    payload.embeds.push(embed);
  }

  return payload;
}

// ── Send auto post to channel ────────────────────────────────────────────

async function sendAutoPost(client, post, triggerVars = {}, testMode = false) {
  let channel;
  try {
    channel = await client.channels.fetch(post.channelId);
  } catch {
    return { success: false, error: "channel_not_found" };
  }

  if (!channel || !channel.isTextBased()) {
    return { success: false, error: "invalid_channel" };
  }

  const guild = channel.guild;
  if (!guild) return { success: false, error: "no_guild" };

  const botMember = guild.members.me;
  const perms = channel.permissionsFor(botMember);

  if (!perms?.has("SendMessages")) {
    return { success: false, error: "no_send_permission" };
  }

  const payload = buildMessagePayload(post, triggerVars);

  if (testMode) {
    if (payload.content) {
      payload.content = `${payload.content}\n\n-# 🧪 Test Auto Post • Sent by Admin`;
    }
    if (payload.embeds.length > 0) {
      const last = payload.embeds[payload.embeds.length - 1];
      const oldFooter = last.data.footer?.text || "";
      last.setFooter({
        text: oldFooter ? `${oldFooter} | 🧪 Test` : "🧪 Test Auto Post",
      });
    }
  }

  // Safe allowed mentions - no @everyone/@here
  const allowedMentions = {
    parse: [],
    users: [],
    roles: [],
  };

  // If triggerVars has a specific user to mention
  if (triggerVars.userMention && /^<@\d+>$/.test(triggerVars.userMention)) {
    const userId = triggerVars.userMention.replace(/[<@!>]/g, "");
    if (userId) allowedMentions.users = [userId];
  }

  try {
    await channel.send({
      content: payload.content || undefined,
      embeds: payload.embeds.length > 0 ? payload.embeds : undefined,
      allowedMentions,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Increment failure / auto-pause ───────────────────────────────────────

async function recordFailure(postId) {
  const post = await prisma.autoPost.findUnique({ where: { id: postId } });
  if (!post) return;
  const newCount = (post.failureCount || 0) + 1;
  if (newCount >= MAX_FAILURES) {
    await prisma.autoPost.update({
      where: { id: postId },
      data: {
        failureCount: newCount,
        status: "PAUSED",
        pausedReason: "Auto-paused: 3 consecutive send failures",
        nextRunAt: null,
      },
    });
  } else {
    await prisma.autoPost.update({
      where: { id: postId },
      data: { failureCount: newCount },
    });
  }
}

// ── Logging ──────────────────────────────────────────────────────────────

async function logAutoPostAction(guildId, action, actorId, meta = {}) {
  try {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { logChannelId: true, moderationLogChannelId: true },
    });
    const logChanId = guild?.moderationLogChannelId || guild?.logChannelId;
    // We'll log via the auditLog table
    await prisma.auditLog.create({
      data: {
        guildId,
        action: `AUTOPOST_${action}`,
        actorId,
        targetId: meta.postId || null,
        meta,
      },
    });
  } catch {
    // Non-critical
  }
}

// ── Cooldown check for triggers ──────────────────────────────────────────

async function isOnCooldown(post) {
  if (!post.lastTriggeredAt) return false;
  const elapsed = (Date.now() - post.lastTriggeredAt.getTime()) / 1000;
  return elapsed < post.cooldownSeconds;
}

async function markTriggered(postId) {
  return prisma.autoPost.update({
    where: { id: postId },
    data: { lastTriggeredAt: new Date() },
  });
}

module.exports = {
  MAX_POSTS_PER_SERVER,
  MAX_FAILURES,
  VALID_TRIGGER_TYPES,
  VALID_MESSAGE_MODES,
  VALID_MATCH_TYPES,
  MAX_CONTENT_LEN,
  MAX_EMBED_TITLE,
  MAX_EMBED_DESC,
  MAX_FOOTER,
  MIN_COOLDOWN,
  MAX_COOLDOWN,
  validateTimezone,
  validateName,
  validateContent,
  validateEmbedTitle,
  validateEmbedDescription,
  validateFooter,
  validateCooldown,
  isAdmin,
  checkAdmin,
  checkPremiumActive,
  getPostCount,
  getPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  pausePost,
  resumePost,
  calculateNextRun,
  replacePlaceholders,
  buildMessagePayload,
  sendAutoPost,
  recordFailure,
  logAutoPostAction,
  isOnCooldown,
  markTriggered,
};
