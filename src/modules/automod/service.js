"use strict";

const prisma = require("../../lib/prisma");
const { generateAutoModId } = require("../../lib/publicIdGenerator");

/**
 * Add automod rule
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function addRule(data) {
  return prisma.autoModRule.create({
    data: {
      guildId: data.guildId,
      phrase: data.phrase.toLowerCase(),
      matchType: data.matchType || "CONTAINS",
      action: data.action || "REVIEW",
      enabled: true,
      createdBy: data.createdBy,
    },
  });
}

/**
 * Remove automod rule
 * @param {string} ruleId
 * @returns {Promise<Object>}
 */
async function removeRule(ruleId) {
  return prisma.autoModRule.delete({ where: { id: ruleId } });
}

/**
 * Get all rules for a guild
 * @param {string} guildId
 * @returns {Promise<Array>}
 */
async function getRules(guildId) {
  return prisma.autoModRule.findMany({
    where: { guildId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Check message against rules
 * @param {string} guildId
 * @param {string} content
 * @returns {Promise<Object|null>} Matched rule or null
 */
async function checkMessage(guildId, content) {
  const rules = await prisma.autoModRule.findMany({
    where: { guildId, enabled: true },
  });

  const lowerContent = content.toLowerCase();

  for (const rule of rules) {
    let matched = false;

    switch (rule.matchType) {
      case "EXACT":
        matched = lowerContent === rule.phrase;
        break;
      case "CONTAINS":
        matched = lowerContent.includes(rule.phrase);
        break;
      case "STARTS_WITH":
        matched = lowerContent.startsWith(rule.phrase);
        break;
      case "REGEX":
        try {
          const regex = new RegExp(rule.phrase, "i");
          matched = regex.test(content);
        } catch {
          // Invalid regex, skip
        }
        break;
    }

    if (matched) {
      return rule;
    }
  }

  return null;
}

/**
 * Create automod case
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function createCase(data) {
  const publicId = await generateAutoModId(async (id) => {
    const exists = await prisma.autoModCase.findUnique({
      where: { publicId: id },
    });
    return !!exists;
  });

  const cleanupAfter = new Date();
  cleanupAfter.setDate(cleanupAfter.getDate() + 7); // Cleanup after 7 days

  return prisma.autoModCase.create({
    data: {
      publicId,
      guildId: data.guildId,
      userId: data.userId,
      channelId: data.channelId,
      messageId: data.messageId,
      ruleId: data.ruleId,
      messageExcerpt: data.messageExcerpt.slice(0, 500), // Max 500 chars
      actionTaken: data.actionTaken,
      status: "PENDING",
      cleanupAfter,
    },
  });
}

module.exports = {
  addRule,
  removeRule,
  getRules,
  checkMessage,
  createCase,
};
