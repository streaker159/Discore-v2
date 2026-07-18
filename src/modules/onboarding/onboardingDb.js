"use strict";

const prisma = require("../../lib/prisma");
const logger = require("../../lib/logger");
const crypto = require("crypto");

function cuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Filters an `updates` object down to only the keys present in `allowList`,
 * before it is used to build a dynamic SQL SET clause. This prevents any
 * caller (current or future) from injecting arbitrary column identifiers
 * into raw SQL via Object.keys(updates) — the actual values are still safely
 * parameterized, but the *column names* themselves were previously taken
 * from caller input with no validation.
 */
function sanitizeUpdates(updates, allowList, context) {
  const safe = {};
  for (const key of Object.keys(updates || {})) {
    if (allowList.includes(key)) {
      safe[key] = updates[key];
    } else {
      logger.error("[Onboarding] Rejected disallowed update column", {
        context,
        key,
      });
    }
  }
  return safe;
}

const CONFIG_UPDATABLE_FIELDS = [
  "enabled",
  "premiumLockedAt",
  "lastPremiumActiveAt",
  "panelChannelId",
  "panelMessageId",
  "defaultReviewChannelId",
  "fallbackToAppealsChannel",
  "useServerIcon",
  "useServerBanner",
  "showDiscoreBranding",
  "maxApplicationTypes",
  "allowDmFlow",
  "allowThreadFallback",
  "draftExpiryHours",
  "keepSubmittedApplications",
  "panelEmbedTitle",
  "panelEmbedDescription",
  "panelEmbedFooter",
  "panelEmbedColor",
  "panelThumbnailUrl",
  "panelImageUrl",
];

const APPLICATION_TYPE_UPDATABLE_FIELDS = [
  "name",
  "publicTitle",
  "publicDescription",
  "instructions",
  "buttonLabel",
  "buttonEmoji",
  "buttonStyle",
  "enabled",
  "sortOrder",
  "reviewChannelId",
  "themeColor",
  "thumbnailUrl",
  "imageUrl",
  "allowFiles",
  "allowRequestChanges",
  "allowApplicantEdit",
  "allowReviewThread",
  "allowPullApplicantIntoThread",
  "acceptRoleIds",
  "removeRoleIds",
  "denyAction",
  "denyRoleId",
  "pendingRoleId",
  "kickOnDeny",
  "banOnDeny",
  "sendDmOnDecision",
];

const FORM_PAGE_UPDATABLE_FIELDS = ["title", "description", "sortOrder"];

const FORM_FIELD_UPDATABLE_FIELDS = [
  "fieldType",
  "label",
  "helpText",
  "placeholder",
  "required",
  "minLength",
  "maxLength",
  "minChoices",
  "maxChoices",
  "allowedFileTypes",
  "maxFileSize",
  "sortOrder",
];

const FIELD_OPTION_UPDATABLE_FIELDS = [
  "label",
  "value",
  "emoji",
  "sortOrder",
  "linkedRoleIds",
];

const APPLICATION_UPDATABLE_FIELDS = [
  "applicationTypeId",
  "status",
  "serverMemberStatus",
  "submittedAt",
  "decidedAt",
  "decidedById",
  "decisionReason",
  "reviewChannelId",
  "reviewMessageId",
  "reviewThreadId",
  "reviewThreadStatus",
  "receiptGeneratedAt",
  "threadTranscriptCreatedAt",
];

const SESSION_UPDATABLE_FIELDS = [
  "applicationTypeId",
  "applicationId",
  "currentPage",
  "stateJson",
  "expiresAt",
];

// ── Config ──────────────────────────────────────────────────────────────────

async function getConfig(guildId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingConfig" WHERE "guildId" = $1`,
      guildId,
    );
    return rows?.[0] || null;
  } catch (e) {
    logger.error("[Onboarding] getConfig failed", {
      guildId,
      error: e.message,
    });
    return null;
  }
}

async function ensureConfig(guildId) {
  try {
    let config = await getConfig(guildId);
    if (config) return config;

    const id = cuid();
    await prisma.$queryRawUnsafe(
      `INSERT INTO "OnboardingConfig" ("id", "guildId") VALUES ($1, $2) ON CONFLICT ("guildId") DO NOTHING`,
      id,
      guildId,
    );
    return await getConfig(guildId);
  } catch (e) {
    logger.error("[Onboarding] ensureConfig failed", {
      guildId,
      error: e.message,
    });
    return null;
  }
}

async function updateConfig(guildId, updates) {
  try {
    const safeUpdates = sanitizeUpdates(
      updates,
      CONFIG_UPDATABLE_FIELDS,
      "updateConfig",
    );
    const keys = Object.keys(safeUpdates);
    if (!keys.length) return;
    const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`);
    const values = keys.map((k) => safeUpdates[k]);
    const sql = `UPDATE "OnboardingConfig" SET ${setClauses.join(", ")}, "updatedAt" = NOW() WHERE "guildId" = $1`;
    await prisma.$queryRawUnsafe(sql, guildId, ...values);
  } catch (e) {
    logger.error("[Onboarding] updateConfig failed", {
      guildId,
      error: e.message,
    });
  }
}

async function deleteConfig(guildId) {
  try {
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingConfig" WHERE "guildId" = $1`,
      guildId,
    );
  } catch (e) {
    logger.error("[Onboarding] deleteConfig failed", {
      guildId,
      error: e.message,
    });
  }
}

// ── Application Types ───────────────────────────────────────────────────────

async function getApplicationTypes(guildId) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingApplicationType" WHERE "guildId" = $1 ORDER BY "sortOrder" ASC`,
      guildId,
    );
  } catch (e) {
    logger.error("[Onboarding] getApplicationTypes failed", {
      guildId,
      error: e.message,
    });
    return [];
  }
}

async function getApplicationType(id) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingApplicationType" WHERE "id" = $1`,
      id,
    );
    return rows?.[0] || null;
  } catch (e) {
    logger.error("[Onboarding] getApplicationType failed", {
      id,
      error: e.message,
    });
    return null;
  }
}

async function createApplicationType(data) {
  try {
    const id = cuid();
    await prisma.$queryRawUnsafe(
      `INSERT INTO "OnboardingApplicationType" ("id", "guildId", "name", "publicTitle", "publicDescription", "instructions", "buttonLabel", "buttonEmoji", "buttonStyle", "enabled", "sortOrder", "reviewChannelId", "themeColor", "thumbnailUrl", "imageUrl", "allowFiles", "allowRequestChanges", "allowApplicantEdit", "allowReviewThread", "allowPullApplicantIntoThread", "acceptRoleIds", "removeRoleIds", "denyAction", "denyRoleId", "pendingRoleId", "kickOnDeny", "banOnDeny", "sendDmOnDecision")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
      id,
      data.guildId,
      data.name,
      data.publicTitle || data.name,
      data.publicDescription || null,
      data.instructions || null,
      data.buttonLabel || "Apply",
      data.buttonEmoji || null,
      data.buttonStyle || "PRIMARY",
      data.enabled !== false,
      data.sortOrder || 0,
      data.reviewChannelId || null,
      data.themeColor || null,
      data.thumbnailUrl || null,
      data.imageUrl || null,
      data.allowFiles || false,
      data.allowRequestChanges !== false,
      data.allowApplicantEdit || false,
      data.allowReviewThread !== false,
      data.allowPullApplicantIntoThread !== false,
      data.acceptRoleIds || [],
      data.removeRoleIds || [],
      data.denyAction || "DM_ONLY",
      data.denyRoleId || null,
      data.pendingRoleId || null,
      data.kickOnDeny || false,
      data.banOnDeny || false,
      data.sendDmOnDecision !== false,
    );
    return await getApplicationType(id);
  } catch (e) {
    logger.error("[Onboarding] createApplicationType failed", {
      error: e.message,
    });
    return null;
  }
}

async function updateApplicationType(id, updates) {
  try {
    const safeUpdates = sanitizeUpdates(
      updates,
      APPLICATION_TYPE_UPDATABLE_FIELDS,
      "updateApplicationType",
    );
    const keys = Object.keys(safeUpdates);
    if (!keys.length) return;
    const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`);
    const values = keys.map((k) => safeUpdates[k]);
    const sql = `UPDATE "OnboardingApplicationType" SET ${setClauses.join(", ")}, "updatedAt" = NOW() WHERE "id" = $1`;
    await prisma.$queryRawUnsafe(sql, id, ...values);
  } catch (e) {
    logger.error("[Onboarding] updateApplicationType failed", {
      id,
      error: e.message,
    });
  }
}

async function deleteApplicationType(id) {
  try {
    // Delete related data
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingFormField" WHERE "applicationTypeId" = $1`,
      id,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingFormPage" WHERE "applicationTypeId" = $1`,
      id,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingRoleRule" WHERE "applicationTypeId" = $1`,
      id,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingApplicationType" WHERE "id" = $1`,
      id,
    );
  } catch (e) {
    logger.error("[Onboarding] deleteApplicationType failed", {
      id,
      error: e.message,
    });
  }
}

async function countActiveApplicationTypes(guildId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as count FROM "OnboardingApplicationType" WHERE "guildId" = $1 AND "enabled" = true`,
      guildId,
    );
    return rows?.[0]?.count || 0;
  } catch {
    return 0;
  }
}

// ── Form Pages ──────────────────────────────────────────────────────────────

async function getFormPages(applicationTypeId) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingFormPage" WHERE "applicationTypeId" = $1 ORDER BY "sortOrder" ASC`,
      applicationTypeId,
    );
  } catch (e) {
    logger.error("[Onboarding] getFormPages failed", { error: e.message });
    return [];
  }
}

async function createFormPage(data) {
  try {
    const id = cuid();
    await prisma.$queryRawUnsafe(
      `INSERT INTO "OnboardingFormPage" ("id", "applicationTypeId", "title", "description", "sortOrder") VALUES ($1, $2, $3, $4, $5)`,
      id,
      data.applicationTypeId,
      data.title || "Page",
      data.description || null,
      data.sortOrder || 0,
    );
    return id;
  } catch (e) {
    logger.error("[Onboarding] createFormPage failed", { error: e.message });
    return null;
  }
}

async function updateFormPage(id, updates) {
  try {
    const safeUpdates = sanitizeUpdates(
      updates,
      FORM_PAGE_UPDATABLE_FIELDS,
      "updateFormPage",
    );
    const keys = Object.keys(safeUpdates);
    if (!keys.length) return;
    const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`);
    const values = keys.map((k) => safeUpdates[k]);
    await prisma.$queryRawUnsafe(
      `UPDATE "OnboardingFormPage" SET ${setClauses.join(", ")}, "updatedAt" = NOW() WHERE "id" = $1`,
      id,
      ...values,
    );
  } catch (e) {
    logger.error("[Onboarding] updateFormPage failed", { error: e.message });
  }
}

async function deleteFormPage(id) {
  try {
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingFormField" WHERE "pageId" = $1`,
      id,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingFormPage" WHERE "id" = $1`,
      id,
    );
  } catch (e) {
    logger.error("[Onboarding] deleteFormPage failed", { error: e.message });
  }
}

// ── Form Fields ─────────────────────────────────────────────────────────────

async function getFormFields(pageId) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingFormField" WHERE "pageId" = $1 ORDER BY "sortOrder" ASC`,
      pageId,
    );
  } catch (e) {
    logger.error("[Onboarding] getFormFields failed", { error: e.message });
    return [];
  }
}

async function getAllFormFieldsForType(applicationTypeId) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingFormField" WHERE "applicationTypeId" = $1 ORDER BY "sortOrder" ASC`,
      applicationTypeId,
    );
  } catch (e) {
    logger.error("[Onboarding] getAllFormFieldsForType failed", {
      error: e.message,
    });
    return [];
  }
}

async function createFormField(data) {
  try {
    const id = cuid();
    await prisma.$queryRawUnsafe(
      `INSERT INTO "OnboardingFormField" ("id", "pageId", "applicationTypeId", "fieldType", "label", "helpText", "placeholder", "required", "minLength", "maxLength", "minChoices", "maxChoices", "allowedFileTypes", "maxFileSize", "sortOrder")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      id,
      data.pageId,
      data.applicationTypeId,
      data.fieldType,
      data.label,
      data.helpText || null,
      data.placeholder || null,
      data.required !== false,
      data.minLength || null,
      data.maxLength || null,
      data.minChoices || null,
      data.maxChoices || null,
      data.allowedFileTypes || [],
      data.maxFileSize || null,
      data.sortOrder || 0,
    );
    return id;
  } catch (e) {
    logger.error("[Onboarding] createFormField failed", { error: e.message });
    return null;
  }
}

async function updateFormField(id, updates) {
  try {
    const safeUpdates = sanitizeUpdates(
      updates,
      FORM_FIELD_UPDATABLE_FIELDS,
      "updateFormField",
    );
    const keys = Object.keys(safeUpdates);
    if (!keys.length) return;
    const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`);
    const values = keys.map((k) => safeUpdates[k]);
    await prisma.$queryRawUnsafe(
      `UPDATE "OnboardingFormField" SET ${setClauses.join(", ")}, "updatedAt" = NOW() WHERE "id" = $1`,
      id,
      ...values,
    );
  } catch (e) {
    logger.error("[Onboarding] updateFormField failed", { error: e.message });
  }
}

async function deleteFormField(id) {
  try {
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingFieldOption" WHERE "fieldId" = $1`,
      id,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingFormField" WHERE "id" = $1`,
      id,
    );
  } catch (e) {
    logger.error("[Onboarding] deleteFormField failed", { error: e.message });
  }
}

// ── Field Options ───────────────────────────────────────────────────────────

async function getFieldOptions(fieldId) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingFieldOption" WHERE "fieldId" = $1 ORDER BY "sortOrder" ASC`,
      fieldId,
    );
  } catch (e) {
    logger.error("[Onboarding] getFieldOptions failed", { error: e.message });
    return [];
  }
}

async function createFieldOption(data) {
  try {
    const id = cuid();
    await prisma.$queryRawUnsafe(
      `INSERT INTO "OnboardingFieldOption" ("id", "fieldId", "label", "value", "emoji", "sortOrder", "linkedRoleIds")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      id,
      data.fieldId,
      data.label,
      data.value,
      data.emoji || null,
      data.sortOrder || 0,
      data.linkedRoleIds || [],
    );
    return id;
  } catch (e) {
    logger.error("[Onboarding] createFieldOption failed", { error: e.message });
    return null;
  }
}

async function updateFieldOption(id, updates) {
  try {
    const safeUpdates = sanitizeUpdates(
      updates,
      FIELD_OPTION_UPDATABLE_FIELDS,
      "updateFieldOption",
    );
    const keys = Object.keys(safeUpdates);
    if (!keys.length) return;
    const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`);
    const values = keys.map((k) => safeUpdates[k]);
    await prisma.$queryRawUnsafe(
      `UPDATE "OnboardingFieldOption" SET ${setClauses.join(", ")}, "updatedAt" = NOW() WHERE "id" = $1`,
      id,
      ...values,
    );
  } catch (e) {
    logger.error("[Onboarding] updateFieldOption failed", { error: e.message });
  }
}

async function deleteFieldOption(id) {
  try {
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingFieldOption" WHERE "id" = $1`,
      id,
    );
  } catch (e) {
    logger.error("[Onboarding] deleteFieldOption failed", { error: e.message });
  }
}

// ── Role Rules ──────────────────────────────────────────────────────────────

async function getRoleRules(guildId, applicationTypeId) {
  try {
    let sql = `SELECT * FROM "OnboardingRoleRule" WHERE "guildId" = $1`;
    const params = [guildId];
    if (applicationTypeId) {
      sql += ` AND "applicationTypeId" = $2`;
      params.push(applicationTypeId);
    }
    return await prisma.$queryRawUnsafe(sql, ...params);
  } catch (e) {
    logger.error("[Onboarding] getRoleRules failed", { error: e.message });
    return [];
  }
}

async function createRoleRule(data) {
  try {
    const id = cuid();
    await prisma.$queryRawUnsafe(
      `INSERT INTO "OnboardingRoleRule" ("id", "guildId", "applicationTypeId", "triggerType", "triggerFieldId", "triggerOptionValue", "applyWhen", "rolesToAdd", "rolesToRemove", "requiresStaffConfirm")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      id,
      data.guildId,
      data.applicationTypeId || null,
      data.triggerType || "DECISION",
      data.triggerFieldId || null,
      data.triggerOptionValue || null,
      data.applyWhen || "APPROVED",
      data.rolesToAdd || [],
      data.rolesToRemove || [],
      data.requiresStaffConfirm || false,
    );
    return id;
  } catch (e) {
    logger.error("[Onboarding] createRoleRule failed", { error: e.message });
    return null;
  }
}

async function deleteRoleRule(id) {
  try {
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingRoleRule" WHERE "id" = $1`,
      id,
    );
  } catch (e) {
    logger.error("[Onboarding] deleteRoleRule failed", { error: e.message });
  }
}

// ── Applications ────────────────────────────────────────────────────────────

async function getNextApplicationNumber(guildId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COALESCE(MAX("applicationNumber"), 0) + 1 as next FROM "OnboardingApplication" WHERE "guildId" = $1`,
      guildId,
    );
    return rows?.[0]?.next || 1;
  } catch {
    return 1;
  }
}

async function createApplication(data) {
  try {
    const id = cuid();
    const number = await getNextApplicationNumber(data.guildId);
    await prisma.$queryRawUnsafe(
      `INSERT INTO "OnboardingApplication" ("id", "guildId", "applicationNumber", "applicationTypeId", "applicantId", "applicantUsernameSnapshot", "applicantDisplayNameSnapshot", "status", "serverMemberStatus", "submittedAt", "reviewChannelId", "reviewMessageId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      id,
      data.guildId,
      number,
      data.applicationTypeId,
      data.applicantId,
      data.applicantUsernameSnapshot || null,
      data.applicantDisplayNameSnapshot || null,
      data.status || "DRAFT",
      data.serverMemberStatus || "IN_SERVER",
      data.submittedAt || null,
      data.reviewChannelId || null,
      data.reviewMessageId || null,
    );
    return await getApplicationById(id);
  } catch (e) {
    logger.error("[Onboarding] createApplication failed", { error: e.message });
    return null;
  }
}

async function getApplicationById(id) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingApplication" WHERE "id" = $1`,
      id,
    );
    return rows?.[0] || null;
  } catch (e) {
    logger.error("[Onboarding] getApplicationById failed", {
      error: e.message,
    });
    return null;
  }
}

async function getApplicationByNumber(guildId, number) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingApplication" WHERE "guildId" = $1 AND "applicationNumber" = $2`,
      guildId,
      number,
    );
    return rows?.[0] || null;
  } catch (e) {
    logger.error("[Onboarding] getApplicationByNumber failed", {
      error: e.message,
    });
    return null;
  }
}

async function getApplicationsByUser(guildId, applicantId) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingApplication" WHERE "guildId" = $1 AND "applicantId" = $2 ORDER BY "createdAt" DESC`,
      guildId,
      applicantId,
    );
  } catch (e) {
    logger.error("[Onboarding] getApplicationsByUser failed", {
      error: e.message,
    });
    return [];
  }
}

async function getApplicationsByStatus(guildId, status, limit = 50) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingApplication" WHERE "guildId" = $1 AND "status" = $2 ORDER BY "createdAt" DESC LIMIT $3`,
      guildId,
      status,
      limit,
    );
  } catch (e) {
    logger.error("[Onboarding] getApplicationsByStatus failed", {
      error: e.message,
    });
    return [];
  }
}

async function getLatestApplications(guildId, limit = 20) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingApplication" WHERE "guildId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
      guildId,
      limit,
    );
  } catch (e) {
    logger.error("[Onboarding] getLatestApplications failed", {
      error: e.message,
    });
    return [];
  }
}

async function updateApplication(id, updates) {
  try {
    const safeUpdates = sanitizeUpdates(
      updates,
      APPLICATION_UPDATABLE_FIELDS,
      "updateApplication",
    );
    const keys = Object.keys(safeUpdates);
    if (!keys.length) return;
    const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`);
    const values = keys.map((k) => safeUpdates[k]);
    await prisma.$queryRawUnsafe(
      `UPDATE "OnboardingApplication" SET ${setClauses.join(", ")}, "updatedAt" = NOW() WHERE "id" = $1`,
      id,
      ...values,
    );
  } catch (e) {
    logger.error("[Onboarding] updateApplication failed", {
      id,
      error: e.message,
    });
  }
}

async function deleteApplication(id) {
  try {
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingAnswer" WHERE "applicationId" = $1`,
      id,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingStaffNote" WHERE "applicationId" = $1`,
      id,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingDecisionLog" WHERE "applicationId" = $1`,
      id,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingApplicationTranscript" WHERE "applicationId" = $1`,
      id,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingApplication" WHERE "id" = $1`,
      id,
    );
  } catch (e) {
    logger.error("[Onboarding] deleteApplication failed", {
      id,
      error: e.message,
    });
  }
}

// ── Answers ─────────────────────────────────────────────────────────────────

async function saveAnswer(data) {
  try {
    const id = cuid();
    await prisma.$queryRawUnsafe(
      `INSERT INTO "OnboardingAnswer" ("id", "applicationId", "fieldId", "fieldLabelSnapshot", "fieldType", "answerText", "answerJson", "selectedOptionValues", "selectedRoleIds", "fileRefs")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb)`,
      id,
      data.applicationId,
      data.fieldId || null,
      data.fieldLabelSnapshot || null,
      data.fieldType || null,
      data.answerText || null,
      data.answerJson ? JSON.stringify(data.answerJson) : null,
      data.selectedOptionValues || [],
      data.selectedRoleIds || [],
      data.fileRefs ? JSON.stringify(data.fileRefs) : null,
    );
    return id;
  } catch (e) {
    logger.error("[Onboarding] saveAnswer failed", { error: e.message });
    return null;
  }
}

async function getAnswers(applicationId) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingAnswer" WHERE "applicationId" = $1 ORDER BY "createdAt" ASC`,
      applicationId,
    );
  } catch (e) {
    logger.error("[Onboarding] getAnswers failed", { error: e.message });
    return [];
  }
}

async function deleteAnswers(applicationId) {
  try {
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingAnswer" WHERE "applicationId" = $1`,
      applicationId,
    );
  } catch (e) {
    logger.error("[Onboarding] deleteAnswers failed", { error: e.message });
  }
}

// ── Staff Notes ─────────────────────────────────────────────────────────────

async function addStaffNote(data) {
  try {
    const id = cuid();
    await prisma.$queryRawUnsafe(
      `INSERT INTO "OnboardingStaffNote" ("id", "applicationId", "guildId", "authorId", "noteText") VALUES ($1, $2, $3, $4, $5)`,
      id,
      data.applicationId,
      data.guildId,
      data.authorId,
      data.noteText,
    );
    return id;
  } catch (e) {
    logger.error("[Onboarding] addStaffNote failed", { error: e.message });
    return null;
  }
}

async function getStaffNotes(applicationId) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingStaffNote" WHERE "applicationId" = $1 AND "deletedAt" IS NULL ORDER BY "createdAt" ASC`,
      applicationId,
    );
  } catch (e) {
    logger.error("[Onboarding] getStaffNotes failed", { error: e.message });
    return [];
  }
}

async function deleteStaffNote(id) {
  try {
    await prisma.$queryRawUnsafe(
      `UPDATE "OnboardingStaffNote" SET "deletedAt" = NOW() WHERE "id" = $1`,
      id,
    );
  } catch (e) {
    logger.error("[Onboarding] deleteStaffNote failed", { error: e.message });
  }
}

// ── Decision Log ────────────────────────────────────────────────────────────

async function addDecisionLog(data) {
  try {
    const id = cuid();
    await prisma.$queryRawUnsafe(
      `INSERT INTO "OnboardingDecisionLog" ("id", "applicationId", "guildId", "action", "actorId", "reason", "detailsJson")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      id,
      data.applicationId,
      data.guildId,
      data.action,
      data.actorId,
      data.reason || null,
      data.detailsJson ? JSON.stringify(data.detailsJson) : null,
    );
    return id;
  } catch (e) {
    logger.error("[Onboarding] addDecisionLog failed", { error: e.message });
    return null;
  }
}

async function getDecisionLogs(applicationId) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingDecisionLog" WHERE "applicationId" = $1 ORDER BY "createdAt" ASC`,
      applicationId,
    );
  } catch (e) {
    logger.error("[Onboarding] getDecisionLogs failed", { error: e.message });
    return [];
  }
}

// ── Sessions / Drafts ───────────────────────────────────────────────────────

async function getSessionById(sessionId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingSession" WHERE "id" = $1`,
      sessionId,
    );
    const s = rows?.[0];
    if (s?.stateJson && typeof s.stateJson === "string") {
      try {
        s.stateJson = JSON.parse(s.stateJson);
      } catch {}
    }
    return s || null;
  } catch (e) {
    logger.error("[Onboarding] getSessionById failed", { error: e.message });
    return null;
  }
}

async function getSession(guildId, applicantId, applicationTypeId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingSession" WHERE "guildId" = $1 AND "applicantId" = $2 AND "applicationTypeId" = $3 ORDER BY "createdAt" DESC LIMIT 1`,
      guildId,
      applicantId,
      applicationTypeId,
    );
    return rows?.[0] || null;
  } catch (e) {
    logger.error("[Onboarding] getSession failed", { error: e.message });
    return null;
  }
}

async function createSession(data) {
  try {
    const id = cuid();
    await prisma.$queryRawUnsafe(
      `INSERT INTO "OnboardingSession" ("id", "guildId", "applicationTypeId", "applicantId", "applicationId", "currentPage", "stateJson", "expiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      id,
      data.guildId,
      data.applicationTypeId,
      data.applicantId,
      data.applicationId || null,
      data.currentPage || 0,
      data.stateJson ? JSON.stringify(data.stateJson) : null,
      data.expiresAt,
    );
    return id;
  } catch (e) {
    logger.error("[Onboarding] createSession failed", { error: e.message });
    return null;
  }
}

async function updateSession(id, updates) {
  try {
    const safeUpdates = sanitizeUpdates(
      updates,
      SESSION_UPDATABLE_FIELDS,
      "updateSession",
    );
    const keys = Object.keys(safeUpdates);
    if (!keys.length) return;
    const setClauses = keys.map((k, i) => {
      if (k === "stateJson") return `"stateJson" = $${i + 2}::jsonb`;
      return `"${k}" = $${i + 2}`;
    });
    const values = keys.map((k) =>
      k === "stateJson" && safeUpdates[k]
        ? JSON.stringify(safeUpdates[k])
        : safeUpdates[k],
    );
    await prisma.$queryRawUnsafe(
      `UPDATE "OnboardingSession" SET ${setClauses.join(", ")}, "updatedAt" = NOW() WHERE "id" = $1`,
      id,
      ...values,
    );
  } catch (e) {
    logger.error("[Onboarding] updateSession failed", { error: e.message });
  }
}

async function deleteSession(id) {
  try {
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingSession" WHERE "id" = $1`,
      id,
    );
  } catch (e) {
    logger.error("[Onboarding] deleteSession failed", { error: e.message });
  }
}

async function getExpiredSessions() {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingSession" WHERE "expiresAt" < NOW()`,
    );
  } catch (e) {
    logger.error("[Onboarding] getExpiredSessions failed", {
      error: e.message,
    });
    return [];
  }
}

async function deleteUserSessions(guildId, applicantId) {
  try {
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingSession" WHERE "guildId" = $1 AND "applicantId" = $2`,
      guildId,
      applicantId,
    );
  } catch (e) {
    logger.error("[Onboarding] deleteUserSessions failed", {
      error: e.message,
    });
  }
}

// ── Permission Roles ────────────────────────────────────────────────────────

async function getPermissionRoles(guildId) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingPermissionRole" WHERE "guildId" = $1`,
      guildId,
    );
  } catch {
    return [];
  }
}

async function setPermissionRole(data) {
  try {
    const id = cuid();
    await prisma.$queryRawUnsafe(
      `INSERT INTO "OnboardingPermissionRole" ("id", "guildId", "roleId", "canManage", "canBuildForms", "canReview", "canApproveDeny", "canOpenThreads", "canDownload", "canDelete")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT ("guildId", "roleId") DO UPDATE SET
         "canManage" = $4, "canBuildForms" = $5, "canReview" = $6, "canApproveDeny" = $7, "canOpenThreads" = $8, "canDownload" = $9, "canDelete" = $10`,
      id,
      data.guildId,
      data.roleId,
      data.canManage || false,
      data.canBuildForms || false,
      data.canReview || false,
      data.canApproveDeny || false,
      data.canOpenThreads || false,
      data.canDownload || false,
      data.canDelete || false,
    );
  } catch (e) {
    logger.error("[Onboarding] setPermissionRole failed", { error: e.message });
  }
}

async function deletePermissionRole(guildId, roleId) {
  try {
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingPermissionRole" WHERE "guildId" = $1 AND "roleId" = $2`,
      guildId,
      roleId,
    );
  } catch (e) {
    logger.error("[Onboarding] deletePermissionRole failed", {
      error: e.message,
    });
  }
}

// ── Transcripts ─────────────────────────────────────────────────────────────

async function saveTranscript(data) {
  try {
    const id = cuid();
    await prisma.$queryRawUnsafe(
      `INSERT INTO "OnboardingApplicationTranscript" ("id", "applicationId", "guildId", "threadId", "fileName", "contentType", "storageRef", "transcriptText", "messageCount", "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      id,
      data.applicationId,
      data.guildId,
      data.threadId || null,
      data.fileName,
      data.contentType || "text/plain",
      data.storageRef || null,
      data.transcriptText || null,
      data.messageCount || 0,
      data.createdBy,
    );
    return id;
  } catch (e) {
    logger.error("[Onboarding] saveTranscript failed", { error: e.message });
    return null;
  }
}

async function getTranscripts(applicationId) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingApplicationTranscript" WHERE "applicationId" = $1 ORDER BY "createdAt" DESC`,
      applicationId,
    );
  } catch {
    return [];
  }
}

// ── Bulk Delete (guildDelete) ───────────────────────────────────────────────

async function deleteAllGuildData(guildId) {
  try {
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingSession" WHERE "guildId" = $1`,
      guildId,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingApplicationTranscript" WHERE "guildId" = $1`,
      guildId,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingDecisionLog" WHERE "guildId" = $1`,
      guildId,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingStaffNote" WHERE "guildId" = $1`,
      guildId,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingAnswer" WHERE "applicationId" IN (SELECT "id" FROM "OnboardingApplication" WHERE "guildId" = $1)`,
      guildId,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingApplication" WHERE "guildId" = $1`,
      guildId,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingFieldOption" WHERE "fieldId" IN (SELECT "id" FROM "OnboardingFormField" WHERE "applicationTypeId" IN (SELECT "id" FROM "OnboardingApplicationType" WHERE "guildId" = $1))`,
      guildId,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingFormField" WHERE "applicationTypeId" IN (SELECT "id" FROM "OnboardingApplicationType" WHERE "guildId" = $1)`,
      guildId,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingFormPage" WHERE "applicationTypeId" IN (SELECT "id" FROM "OnboardingApplicationType" WHERE "guildId" = $1)`,
      guildId,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingRoleRule" WHERE "guildId" = $1`,
      guildId,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingApplicationType" WHERE "guildId" = $1`,
      guildId,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingPermissionRole" WHERE "guildId" = $1`,
      guildId,
    );
    await prisma.$queryRawUnsafe(
      `DELETE FROM "OnboardingConfig" WHERE "guildId" = $1`,
      guildId,
    );
    logger.info("[Onboarding] Deleted all guild data", { guildId });
  } catch (e) {
    logger.error("[Onboarding] deleteAllGuildData failed", {
      guildId,
      error: e.message,
    });
  }
}

module.exports = {
  cuid,
  // Config
  getConfig,
  ensureConfig,
  updateConfig,
  deleteConfig,
  // Application Types
  getApplicationTypes,
  getApplicationType,
  createApplicationType,
  updateApplicationType,
  deleteApplicationType,
  countActiveApplicationTypes,
  // Form Pages
  getFormPages,
  createFormPage,
  updateFormPage,
  deleteFormPage,
  // Form Fields
  getFormFields,
  getAllFormFieldsForType,
  createFormField,
  updateFormField,
  deleteFormField,
  // Field Options
  getFieldOptions,
  createFieldOption,
  updateFieldOption,
  deleteFieldOption,
  // Role Rules
  getRoleRules,
  createRoleRule,
  deleteRoleRule,
  // Applications
  getNextApplicationNumber,
  createApplication,
  getApplicationById,
  getApplicationByNumber,
  getApplicationsByUser,
  getApplicationsByStatus,
  getLatestApplications,
  updateApplication,
  deleteApplication,
  // Answers
  saveAnswer,
  getAnswers,
  deleteAnswers,
  // Staff Notes
  addStaffNote,
  getStaffNotes,
  deleteStaffNote,
  // Decision Log
  addDecisionLog,
  getDecisionLogs,
  // Sessions
  getSessionById,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  getExpiredSessions,
  deleteUserSessions,
  // Permission Roles
  getPermissionRoles,
  setPermissionRole,
  deletePermissionRole,
  // Transcripts
  saveTranscript,
  getTranscripts,
  // Bulk
  deleteAllGuildData,
};
