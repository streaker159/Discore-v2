"use strict";

const { PermissionFlagsBits } = require("discord.js");
const prisma = require("../../lib/prisma");
const { automodCache } = require("../../lib/cache");
const { isBotOwner } = require("../../lib/ownerGuard");
const { hasFeature } = require("../../lib/premiumGate");
const { generateAutoModId } = require("../../lib/publicIdGenerator");

// ── Constants ──────────────────────────────────────────────────────────────

const FREE_RULE_LIMIT = 3;
const PREMIUM_RULE_LIMIT = 25;

const MATCH_TYPES = [
  "CONTAINS",
  "EXACT",
  "STARTS_WITH",
  "ENDS_WITH",
  "WORD_BOUNDARY",
];
const ACTIONS = [
  "REVIEW",
  "DELETE",
  "WARN",
  "TIMEOUT",
  "DELETE_AND_TIMEOUT",
  "SILENT_LOG",
];
const SEVERITIES = ["LOW", "MEDIUM", "HIGH"];
const SEVERITY_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 };

const MATCH_TYPE_LABELS = {
  CONTAINS: "Contains",
  EXACT: "Exact match",
  STARTS_WITH: "Starts with",
  ENDS_WITH: "Ends with",
  WORD_BOUNDARY: "Word boundary",
  REGEX: "Regex (legacy)",
};

const ACTION_LABELS = {
  REVIEW: "Review message",
  DELETE: "Delete message",
  WARN: "Warn user",
  TIMEOUT: "Timeout user",
  DELETE_AND_TIMEOUT: "Delete + Timeout",
  SILENT_LOG: "Silent log",
  MUTE: "Mute (legacy)",
};

const SEVERITY_LABELS = {
  LOW: "🟢 Low",
  MEDIUM: "🟡 Medium",
  HIGH: "🔴 High",
};

// 5m, 10m, 30m, 1h, 6h, 12h, 1d, 3d, 7d
const TIMEOUT_OPTIONS = [
  { label: "5 minutes", value: 300 },
  { label: "10 minutes", value: 600 },
  { label: "30 minutes", value: 1800 },
  { label: "1 hour", value: 3600 },
  { label: "6 hours", value: 21600 },
  { label: "12 hours", value: 43200 },
  { label: "1 day", value: 86400 },
  { label: "3 days", value: 259200 },
  { label: "7 days", value: 604800 },
];
const MAX_DISCORD_TIMEOUT_SECONDS = 28 * 24 * 60 * 60; // Discord hard cap

const MAX_NAME_LEN = 50;
const MAX_PHRASE_LEN = 100;
const MAX_USER_MESSAGE_LEN = 700;

// ── Access control ─────────────────────────────────────────────────────────

/**
 * Users allowed to manage automod:
 * Manage Guild, Manage Messages, Moderate Members, Administrator, or bot owner.
 */
function checkAutomodAccess(interaction) {
  if (isBotOwner(interaction.user.id)) return true;
  const perms = interaction.memberPermissions;
  if (!perms) return false;
  return (
    perms.has(PermissionFlagsBits.Administrator) ||
    perms.has(PermissionFlagsBits.ManageGuild) ||
    perms.has(PermissionFlagsBits.ManageMessages) ||
    perms.has(PermissionFlagsBits.ModerateMembers)
  );
}

async function hasAdvancedAccess(guildId) {
  return hasFeature(guildId, "automod.advanced");
}

// ── Cache ────────────────────────────────────────────────────────────────

function invalidateCache(guildId) {
  automodCache.delete(guildId);
}

/**
 * Cached bundle of { enabled, reviewChannelId, defaultAction, moderationLogChannelId,
 * logChannelId, rules[] (enabled rules only) } used by the messageCreate enforcement
 * path so it never has to query the DB per message. TTL 5 minutes, invalidated
 * immediately whenever a rule or automod setting changes.
 */
async function getAutomodContext(guildId) {
  const cached = automodCache.get(guildId);
  if (cached) return cached;

  const [dbGuild, rules] = await Promise.all([
    prisma.guild.findUnique({
      where: { id: guildId },
      select: {
        automodEnabled: true,
        automodReviewChannelId: true,
        automodDefaultAction: true,
        moderationLogChannelId: true,
        logChannelId: true,
      },
    }),
    prisma.autoModRule.findMany({ where: { guildId, enabled: true } }),
  ]);

  const ctx = {
    enabled: dbGuild?.automodEnabled ?? true,
    reviewChannelId: dbGuild?.automodReviewChannelId || null,
    defaultAction: dbGuild?.automodDefaultAction || "REVIEW",
    moderationLogChannelId: dbGuild?.moderationLogChannelId || null,
    logChannelId: dbGuild?.logChannelId || null,
    rules,
  };

  automodCache.set(guildId, ctx);
  return ctx;
}

// ── Guild settings ───────────────────────────────────────────────────────

async function getGuildAutomodSettings(guildId) {
  const dbGuild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      automodEnabled: true,
      automodReviewChannelId: true,
      automodDefaultAction: true,
      moderationLogChannelId: true,
      logChannelId: true,
    },
  });
  return (
    dbGuild || {
      automodEnabled: true,
      automodReviewChannelId: null,
      automodDefaultAction: "REVIEW",
      moderationLogChannelId: null,
      logChannelId: null,
    }
  );
}

async function updateGuildAutomodSettings(guildId, data) {
  const updated = await prisma.guild.update({
    where: { id: guildId },
    data,
  });
  invalidateCache(guildId);
  return updated;
}

/**
 * Resolve the channel to send a log/review embed to.
 * Priority: rule override > guild automod review channel > moderation log channel
 * > general log channel > null (caller should console.warn and not crash).
 */
function resolveLogChannelId(rule, ctxOrGuild) {
  return (
    rule?.reviewChannelId ||
    ctxOrGuild?.reviewChannelId ||
    ctxOrGuild?.automodReviewChannelId ||
    ctxOrGuild?.moderationLogChannelId ||
    ctxOrGuild?.logChannelId ||
    null
  );
}

// ── CRUD ─────────────────────────────────────────────────────────────────

async function getRuleCount(guildId) {
  return prisma.autoModRule.count({ where: { guildId } });
}

async function getRuleLimit(guildId) {
  const advanced = await hasAdvancedAccess(guildId);
  return advanced ? PREMIUM_RULE_LIMIT : FREE_RULE_LIMIT;
}

async function getRules(guildId) {
  return prisma.autoModRule.findMany({
    where: { guildId },
    orderBy: { createdAt: "asc" },
  });
}

async function getRule(ruleId, guildId) {
  return prisma.autoModRule.findFirst({ where: { id: ruleId, guildId } });
}

async function createRule(guildId, data) {
  const rule = await prisma.autoModRule.create({
    data: {
      guildId,
      name: data.name || null,
      phrase: data.phrase.toLowerCase(),
      matchType: data.matchType || "CONTAINS",
      action: data.action || "REVIEW",
      severity: data.severity || "MEDIUM",
      enabled: data.enabled ?? true,
      exemptRoleIds: data.exemptRoleIds || null,
      ignoredChannelIds: data.ignoredChannelIds || null,
      reviewChannelId: data.reviewChannelId || null,
      timeoutSeconds: data.timeoutSeconds || null,
      deleteMessage: data.deleteMessage ?? false,
      userMessage: data.userMessage || null,
      appealEnabled: data.appealEnabled ?? false,
      createdBy: data.createdBy,
    },
  });
  invalidateCache(guildId);
  return rule;
}

async function updateRule(ruleId, guildId, data) {
  const result = await prisma.autoModRule.updateMany({
    where: { id: ruleId, guildId },
    data,
  });
  invalidateCache(guildId);
  return result;
}

async function deleteRule(ruleId, guildId) {
  const result = await prisma.autoModRule.deleteMany({
    where: { id: ruleId, guildId },
  });
  invalidateCache(guildId);
  return result;
}

async function toggleRule(ruleId, guildId) {
  const rule = await getRule(ruleId, guildId);
  if (!rule) return null;
  const updated = await prisma.autoModRule.update({
    where: { id: ruleId },
    data: { enabled: !rule.enabled },
  });
  invalidateCache(guildId);
  return updated;
}

// ── Validation ───────────────────────────────────────────────────────────

function validateName(name) {
  if (!name || typeof name !== "string") return "Rule name is required.";
  if (name.trim().length < 1) return "Rule name is required.";
  if (name.length > MAX_NAME_LEN)
    return `Rule name must be ${MAX_NAME_LEN} characters or less.`;
  return null;
}

function validatePhrase(phrase) {
  if (!phrase || typeof phrase !== "string")
    return "Phrase/keyword is required.";
  if (phrase.trim().length < 1) return "Phrase/keyword is required.";
  if (phrase.length > MAX_PHRASE_LEN)
    return `Phrase must be ${MAX_PHRASE_LEN} characters or less.`;
  return null;
}

function validateMatchType(matchType) {
  if (!MATCH_TYPES.includes(matchType)) {
    return `Match type must be one of: ${MATCH_TYPES.join(", ")}.`;
  }
  return null;
}

function validateAction(action) {
  if (!ACTIONS.includes(action)) {
    return `Action must be one of: ${ACTIONS.join(", ")}.`;
  }
  return null;
}

function validateSeverity(severity) {
  if (!SEVERITIES.includes(severity)) {
    return `Severity must be one of: ${SEVERITIES.join(", ")}.`;
  }
  return null;
}

function validateUserMessage(message) {
  if (message && message.length > MAX_USER_MESSAGE_LEN) {
    return `User message must be ${MAX_USER_MESSAGE_LEN} characters or less.`;
  }
  return null;
}

function normalizeTimeoutSeconds(seconds) {
  const s = parseInt(seconds, 10);
  if (isNaN(s) || s <= 0) return null;
  return Math.min(s, MAX_DISCORD_TIMEOUT_SECONDS);
}

// ── Matching engine ──────────────────────────────────────────────────────

function normalizeContent(content) {
  return String(content || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check a single rule against already-normalized message content.
 * Returns { matched: boolean, matchedText: string|null }.
 */
function matchRule(rule, normalizedContent) {
  const phrase = (rule.phrase || "").toLowerCase().trim();
  if (!phrase) return { matched: false, matchedText: null };

  switch (rule.matchType) {
    case "EXACT":
      return normalizedContent === phrase
        ? { matched: true, matchedText: phrase }
        : { matched: false, matchedText: null };

    case "STARTS_WITH":
      return normalizedContent.startsWith(phrase)
        ? { matched: true, matchedText: phrase }
        : { matched: false, matchedText: null };

    case "ENDS_WITH":
      return normalizedContent.endsWith(phrase)
        ? { matched: true, matchedText: phrase }
        : { matched: false, matchedText: null };

    case "WORD_BOUNDARY": {
      try {
        const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i");
        return re.test(normalizedContent)
          ? { matched: true, matchedText: phrase }
          : { matched: false, matchedText: null };
      } catch {
        return { matched: false, matchedText: null };
      }
    }

    case "REGEX": {
      // Legacy rules only — new rules cannot be created with REGEX from the
      // dashboard. Sandboxed to a simple case-insensitive test, never thrown.
      try {
        const re = new RegExp(rule.phrase, "i");
        return re.test(normalizedContent)
          ? { matched: true, matchedText: rule.phrase }
          : { matched: false, matchedText: null };
      } catch {
        return { matched: false, matchedText: null };
      }
    }

    case "CONTAINS":
    default:
      return normalizedContent.includes(phrase)
        ? { matched: true, matchedText: phrase }
        : { matched: false, matchedText: null };
  }
}

/**
 * Given a list of candidate (already-filtered for exempt/ignored) enabled
 * rules, find the single highest-severity match. Ties broken by rule order
 * (earliest created first, since rules are fetched ordered by createdAt).
 */
function pickBestMatch(rules, normalizedContent) {
  let best = null;
  let bestRank = -1;

  for (const rule of rules) {
    const { matched, matchedText } = matchRule(rule, normalizedContent);
    if (!matched) continue;
    const rank = SEVERITY_RANK[rule.severity] || SEVERITY_RANK.MEDIUM;
    if (rank > bestRank) {
      best = { rule, matchedText };
      bestRank = rank;
    }
  }

  return best;
}

function isExempt(rule, message) {
  const exemptRoleIds = Array.isArray(rule.exemptRoleIds)
    ? rule.exemptRoleIds
    : [];
  const ignoredChannelIds = Array.isArray(rule.ignoredChannelIds)
    ? rule.ignoredChannelIds
    : [];

  if (ignoredChannelIds.includes(message.channel.id)) return true;

  if (exemptRoleIds.length > 0 && message.member) {
    const memberRoleIds = message.member.roles?.cache
      ? [...message.member.roles.cache.keys()]
      : [];
    if (memberRoleIds.some((id) => exemptRoleIds.includes(id))) return true;
  }

  return false;
}

// ── Trigger logging ──────────────────────────────────────────────────────

async function recordTrigger(rule, data) {
  const publicId = await generateAutoModId(async (id) => {
    const exists = await prisma.autoModCase.findUnique({
      where: { publicId: id },
    });
    return !!exists;
  });

  const cleanupAfter = new Date();
  cleanupAfter.setDate(cleanupAfter.getDate() + 7);

  const [triggerLog] = await Promise.all([
    prisma.autoModCase.create({
      data: {
        publicId,
        guildId: rule.guildId,
        userId: data.userId,
        channelId: data.channelId,
        messageId: data.messageId || null,
        ruleId: rule.id,
        matchedText: data.matchedText || null,
        messageExcerpt: (data.messageExcerpt || "").slice(0, 500),
        actionTaken: rule.action,
        status: data.status || "PENDING",
        resolutionAction: data.resolutionAction || null,
        moderationCaseId: data.moderationCaseId || null,
        cleanupAfter,
      },
    }),
    prisma.autoModRule.update({
      where: { id: rule.id },
      data: {
        triggerCount: { increment: 1 },
        lastTriggeredAt: new Date(),
      },
    }),
  ]);

  return triggerLog;
}

async function getTriggerLog(publicId, guildId) {
  return prisma.autoModCase.findFirst({
    where: { publicId, guildId },
    include: { rule: true },
  });
}

async function updateTriggerLog(id, data) {
  return prisma.autoModCase.update({ where: { id }, data });
}

module.exports = {
  // Constants
  FREE_RULE_LIMIT,
  PREMIUM_RULE_LIMIT,
  MATCH_TYPES,
  ACTIONS,
  SEVERITIES,
  MATCH_TYPE_LABELS,
  ACTION_LABELS,
  SEVERITY_LABELS,
  TIMEOUT_OPTIONS,
  MAX_DISCORD_TIMEOUT_SECONDS,
  MAX_NAME_LEN,
  MAX_PHRASE_LEN,
  MAX_USER_MESSAGE_LEN,
  // Access
  checkAutomodAccess,
  hasAdvancedAccess,
  // Cache
  invalidateCache,
  getAutomodContext,
  // Settings
  getGuildAutomodSettings,
  updateGuildAutomodSettings,
  resolveLogChannelId,
  // CRUD
  getRuleCount,
  getRuleLimit,
  getRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  toggleRule,
  // Validation
  validateName,
  validatePhrase,
  validateMatchType,
  validateAction,
  validateSeverity,
  validateUserMessage,
  normalizeTimeoutSeconds,
  // Matching
  normalizeContent,
  matchRule,
  pickBestMatch,
  isExempt,
  // Trigger log
  recordTrigger,
  getTriggerLog,
  updateTriggerLog,
};
