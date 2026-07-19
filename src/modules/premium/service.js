"use strict";

const crypto = require("crypto");
const prisma = require("../../lib/prisma");
const { premiumCache } = require("../../lib/cache");
const { getPlanLimits } = require("../../config/plans");
const logger = require("../../lib/logger");

// ─── Premium status ───────────────────────────────────────────────────────────

const DEFAULT_PREMIUM_AI_ALLOWANCE = 2000;

async function getPremiumStatus(guildId) {
  const premium = await prisma.guildPremium.findUnique({ where: { guildId } });
  let tier = premium?.tier || "FREE";

  if (tier === "LIFETIME") {
    return {
      tier: "PREMIUM",
      premium,
      limits: getPlanLimits("LIFETIME"),
      isLifetime: true,
      isActive: true,
      inGrace: false,
    };
  }

  const now = new Date();
  let isActive = tier !== "FREE";
  let inGrace = false;

  if (premium?.expiresAt && premium.expiresAt < now) {
    tier = "FREE";
    isActive = false;
  }

  return {
    tier: tier === "PRO" ? "PREMIUM" : tier,
    premium,
    limits: getPlanLimits(tier),
    isLifetime: false,
    isActive,
    inGrace,
    expiresAt: premium?.expiresAt,
    graceEndsAt: null,
  };
}

function getPremiumSource(premium) {
  if (!premium || premium.tier === "FREE") return "Free";
  if (premium.method === "STRIPE" || premium.entitlementId)
    return "Direct Payment";
  if (premium.method === "CODE") return "Premium Code";
  if (premium.method === "MANUAL") return "Manual Grant";
  return "Unknown";
}

function calculatePremiumExpiry({ durationValue, durationUnit }) {
  if (durationUnit === "LIFETIME") return null;

  const value = Math.max(1, parseInt(durationValue, 10) || 1);
  const now = new Date();
  const expiresAt = new Date(now);

  if (durationUnit === "DAYS") {
    expiresAt.setDate(expiresAt.getDate() + value);
  } else if (durationUnit === "WEEKS") {
    expiresAt.setDate(expiresAt.getDate() + value * 7);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + value);
  }

  return expiresAt;
}

async function grantPremium({
  guildId,
  durationValue = 1,
  durationUnit = "MONTHS",
  monthlyAiAllowance = DEFAULT_PREMIUM_AI_ALLOWANCE,
  extraAiCredits = 0,
  method = "MANUAL",
  grantedBy,
}) {
  const now = new Date();
  await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId },
  });

  const expiresAt = calculatePremiumExpiry({ durationValue, durationUnit });
  const tier = durationUnit === "LIFETIME" ? "LIFETIME" : "PRO";
  const periodEnd =
    expiresAt || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const allowance = Math.max(0, parseInt(monthlyAiAllowance, 10) || 0);
  const extraCredits = Math.max(0, parseInt(extraAiCredits, 10) || 0);

  const existing = await prisma.guildPremium.findUnique({ where: { guildId } });
  const isRenewal = existing && existing.tier !== "FREE";

  const premium = await prisma.guildPremium.upsert({
    where: { guildId },
    update: {
      tier,
      method,
      grantedBy,
      expiresAt,
      entitlementId: null,
      monthlyAiAllowance: allowance,
      monthlyAiUsed: 0,
      monthlyAiPeriodStart: now,
      monthlyAiPeriodEnd: periodEnd,
      extraAiCredits: { increment: extraCredits },
      lastRenewalAt: now,
      renewalCount: { increment: 1 },
      graceNotifiedAt: null,
      ...(isRenewal ? {} : { purchasedAt: now }),
    },
    create: {
      guildId,
      tier,
      method,
      grantedBy,
      expiresAt,
      monthlyAiAllowance: allowance,
      monthlyAiUsed: 0,
      monthlyAiPeriodStart: now,
      monthlyAiPeriodEnd: periodEnd,
      extraAiCredits: extraCredits,
      purchasedAt: now,
      lastRenewalAt: now,
      renewalCount: 1,
    },
  });

  premiumCache.delete(`tier:${guildId}`);
  logger.info("Premium granted manually", {
    guildId,
    tier,
    expiresAt,
    monthlyAiAllowance: allowance,
    extraAiCredits,
    grantedBy,
  });
  return premium;
}

async function revokePremium(guildId, revokedBy) {
  await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId },
  });

  const premium = await prisma.guildPremium.upsert({
    where: { guildId },
    update: {
      tier: "FREE",
      method: "MANUAL",
      expiresAt: new Date(),
      entitlementId: null,
      monthlyAiAllowance: 0,
      monthlyAiUsed: 0,
      monthlyAiPeriodStart: null,
      monthlyAiPeriodEnd: null,
      grantedBy: revokedBy,
      graceNotifiedAt: null,
    },
    create: {
      guildId,
      tier: "FREE",
      method: "MANUAL",
      grantedBy: revokedBy,
      expiresAt: new Date(),
    },
  });

  premiumCache.delete(`tier:${guildId}`);
  logger.info("Premium revoked manually", { guildId, revokedBy });
  return premium;
}

// ─── AI credit service ────────────────────────────────────────────────────────

async function getAiCreditStatus(guildId) {
  const premium = await prisma.guildPremium.findUnique({ where: { guildId } });
  if (!premium) {
    return {
      monthlyAllowance: 0,
      monthlyUsed: 0,
      monthlyRemaining: 0,
      extraCredits: 0,
      totalAvailable: 0,
      monthlyPeriodStart: null,
      monthlyPeriodEnd: null,
    };
  }

  const now = new Date();
  const premiumExpired =
    premium.tier !== "FREE" && premium.expiresAt && premium.expiresAt < now;
  if (premiumExpired) {
    const extraCredits = premium.extraAiCredits || 0;
    return {
      monthlyAllowance: 0,
      monthlyUsed: premium.monthlyAiUsed || 0,
      monthlyRemaining: 0,
      extraCredits,
      totalAvailable: extraCredits,
      monthlyPeriodStart: premium.monthlyAiPeriodStart,
      monthlyPeriodEnd: premium.expiresAt,
    };
  }

  // Auto-reset monthly credits if period has expired
  let monthlyUsed = premium.monthlyAiUsed || 0;
  if (premium.monthlyAiPeriodEnd && now > premium.monthlyAiPeriodEnd) {
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await prisma.guildPremium
      .update({
        where: { guildId },
        data: {
          monthlyAiUsed: 0,
          monthlyAiPeriodStart: now,
          monthlyAiPeriodEnd: periodEnd,
        },
      })
      .catch(() => {});
    monthlyUsed = 0;
  }

  const monthlyAllowance = premium.monthlyAiAllowance || 0;
  const monthlyRemaining = Math.max(0, monthlyAllowance - monthlyUsed);
  const extraCredits = premium.extraAiCredits || 0;
  const totalAvailable = monthlyRemaining + extraCredits;

  return {
    monthlyAllowance,
    monthlyUsed,
    monthlyRemaining,
    extraCredits,
    totalAvailable,
    monthlyPeriodStart: premium.monthlyAiPeriodStart,
    monthlyPeriodEnd: premium.monthlyAiPeriodEnd,
  };
}

async function canUseAi(guildId, userId, estimatedCost) {
  const premium = await prisma.guildPremium.findUnique({ where: { guildId } });
  if (!premium)
    return {
      ok: false,
      reason: "no_premium_record",
      message: "⚠️ AI is not configured for this server.",
    };
  if (premium.aiEnabled === false)
    return {
      ok: false,
      reason: "ai_disabled",
      message: "⚠️ AI features are disabled for this server.",
    };

  const aiStatus = await getAiCreditStatus(guildId);
  if (aiStatus.totalAvailable <= 0) {
    return {
      ok: false,
      reason: "no_credits",
      message:
        "⚠️ This server has no AI credits remaining.\n\nUse `/premium` to buy more AI credits or upgrade to Discore Premium.",
    };
  }

  // Server daily limit check
  if (premium.serverDailyAiLimit > 0) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayUsage = await prisma.botAiUsage.aggregate({
      where: { guildId, createdAt: { gte: todayStart } },
      _sum: { creditsUsed: true },
    });
    const usedToday = todayUsage._sum.creditsUsed || 0;
    if (usedToday + estimatedCost > premium.serverDailyAiLimit) {
      return {
        ok: false,
        reason: "server_daily_limit",
        message: "⚠️ This server has reached today's AI usage limit.",
      };
    }
  }

  // Per-user daily limit check
  if (premium.perUserDailyAiLimit > 0 && userId) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const userToday = await prisma.botAiUsage.aggregate({
      where: { guildId, userId, createdAt: { gte: todayStart } },
      _sum: { creditsUsed: true },
    });
    const userUsed = userToday._sum.creditsUsed || 0;
    if (userUsed + estimatedCost > premium.perUserDailyAiLimit) {
      return {
        ok: false,
        reason: "user_daily_limit",
        message:
          "⚠️ You have reached your daily AI usage limit on this server.",
      };
    }
  }

  // Cooldown check
  if (premium.cooldownSeconds > 0 && userId) {
    const lastUse = await prisma.botAiUsage.findFirst({
      where: { guildId, userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (lastUse) {
      const elapsed = (Date.now() - lastUse.createdAt.getTime()) / 1000;
      if (elapsed < premium.cooldownSeconds) {
        const remaining = Math.ceil(premium.cooldownSeconds - elapsed);
        return {
          ok: false,
          reason: "cooldown",
          message: `⏳ Please wait ${remaining}s before using AI again.`,
        };
      }
    }
  }

  return { ok: true };
}

async function consumeAiCredits(guildId, userId, cost, commandName) {
  // Atomic, race-condition-safe consumption. The CTE locks the row with
  // FOR UPDATE and the outer UPDATE's WHERE re-checks availability against
  // that locked snapshot, so two concurrent requests for the same guild are
  // fully serialized by Postgres — no double-spend past the credit limit.
  // (Previously this was a separate read-then-write, which was exploitable.)
  const rows = await prisma.$queryRaw`
    WITH old AS (
      SELECT "guildId", "monthlyAiAllowance", "monthlyAiUsed", "extraAiCredits"
      FROM "GuildPremium"
      WHERE "guildId" = ${guildId}
      FOR UPDATE
    )
    UPDATE "GuildPremium" gp
    SET
      "monthlyAiUsed" = old."monthlyAiUsed"
        + LEAST(${cost}::int, GREATEST(old."monthlyAiAllowance" - old."monthlyAiUsed", 0)),
      "extraAiCredits" = old."extraAiCredits"
        - GREATEST(${cost}::int - GREATEST(old."monthlyAiAllowance" - old."monthlyAiUsed", 0), 0),
      "updatedAt" = NOW()
    FROM old
    WHERE gp."guildId" = old."guildId"
      AND (GREATEST(old."monthlyAiAllowance" - old."monthlyAiUsed", 0) + old."extraAiCredits") >= ${cost}::int
    RETURNING
      LEAST(${cost}::int, GREATEST(old."monthlyAiAllowance" - old."monthlyAiUsed", 0)) AS "usedMonthly",
      GREATEST(${cost}::int - GREATEST(old."monthlyAiAllowance" - old."monthlyAiUsed", 0), 0) AS "usedExtra"
  `;

  if (!rows || rows.length === 0) {
    return { consumed: false };
  }

  const usedMonthly = Number(rows[0].usedMonthly) || 0;
  const usedExtra = Number(rows[0].usedExtra) || 0;

  // Log monthly usage aggregate
  const monthKey = new Date().toISOString().slice(0, 7);
  await prisma.aiUsage
    .upsert({
      where: { guildId_month: { guildId, month: monthKey } },
      update: {
        creditsUsed: { increment: cost },
        requestCount: { increment: 1 },
      },
      create: {
        guildId,
        userId,
        month: monthKey,
        creditsUsed: cost,
        requestCount: 1,
      },
    })
    .catch(() => {});

  // Log daily usage event for per-day tracking
  await prisma.botAiUsage
    .create({
      data: {
        guildId,
        userId: userId || null,
        success: true,
        creditsUsed: cost,
        requestType: commandName || "unknown",
      },
    })
    .catch(() => {});

  return {
    consumed: true,
    usedMonthly,
    usedExtra,
    remainingUnpaid: 0,
  };
}

async function refundAiCredits(guildId, amount) {
  if (amount <= 0) return;
  await prisma.guildPremium
    .update({
      where: { guildId },
      data: { extraAiCredits: { increment: amount } },
    })
    .catch(() => {});
}

// ─── AI admin settings ────────────────────────────────────────────────────────

async function updateAiSettings(
  guildId,
  {
    serverDailyLimit,
    perUserDailyLimit,
    perUserDailyImageGenLimit,
    cooldownSeconds,
    aiEnabled,
    aiTranslationEnabled,
    aiWelcomeEnabled,
    aiImageGenEnabled,
    aiWelcomeInstructions,
  },
) {
  const data = {};
  if (serverDailyLimit !== undefined)
    data.serverDailyAiLimit = parseInt(serverDailyLimit) || 0;
  if (perUserDailyLimit !== undefined)
    data.perUserDailyAiLimit = parseInt(perUserDailyLimit) || 0;
  if (perUserDailyImageGenLimit !== undefined)
    data.perUserDailyImageGenLimit = parseInt(perUserDailyImageGenLimit) || 0;
  if (cooldownSeconds !== undefined)
    data.cooldownSeconds = parseInt(cooldownSeconds) || 0;
  if (aiEnabled !== undefined)
    data.aiEnabled = aiEnabled === true || aiEnabled === "true";
  if (aiTranslationEnabled !== undefined)
    data.aiTranslationEnabled =
      aiTranslationEnabled === true || aiTranslationEnabled === "true";
  if (aiWelcomeEnabled !== undefined)
    data.aiWelcomeEnabled =
      aiWelcomeEnabled === true || aiWelcomeEnabled === "true";
  if (aiImageGenEnabled !== undefined)
    data.aiImageGenEnabled =
      aiImageGenEnabled === true || aiImageGenEnabled === "true";
  if (aiWelcomeInstructions !== undefined) {
    // Strip @everyone/@here and limit length
    const cleaned = String(aiWelcomeInstructions || "")
      .replace(/@everyone/gi, "[blocked]")
      .replace(/@here/gi, "[blocked]")
      .trim()
      .substring(0, 800);
    data.aiWelcomeInstructions = cleaned || null;
  }

  return prisma.guildPremium.upsert({
    where: { guildId },
    update: data,
    create: { guildId, tier: "FREE", method: "MANUAL", ...data },
  });
}

async function getAiAdminSettings(guildId) {
  const premium = await prisma.guildPremium.findUnique({ where: { guildId } });
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { aiWelcomeChannelId: true },
  });
  return {
    serverDailyLimit: premium?.serverDailyAiLimit || 0,
    perUserDailyLimit: premium?.perUserDailyAiLimit || 0,
    perUserDailyImageGenLimit: premium?.perUserDailyImageGenLimit || 0,
    cooldownSeconds: premium?.cooldownSeconds || 0,
    aiEnabled: premium?.aiEnabled !== false,
    aiTranslationEnabled: premium?.aiTranslationEnabled === true,
    aiWelcomeEnabled: premium?.aiWelcomeEnabled === true,
    aiImageGenEnabled: premium?.aiImageGenEnabled === true,
    aiWelcomeChannelId: guild?.aiWelcomeChannelId || null,
    aiWelcomeInstructions: premium?.aiWelcomeInstructions || null,
  };
}

// ─── Code redemption ──────────────────────────────────────────────────────────

function generateCodeValue(prefix = "DISCORE") {
  const random = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `${prefix}-${random}`;
}

async function createPremiumCode({
  code,
  type = "TRIAL",
  tier = "PRO",
  maxUses = 1,
  trialDays = 30,
  expiresInDays,
}) {
  const normalised = String(code || generateCodeValue())
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");
  const safeMaxUses = Math.max(1, parseInt(maxUses, 10) || 1);
  const safeTrialDays =
    tier === "LIFETIME" ? null : Math.max(1, parseInt(trialDays, 10) || 30);
  const expiresAt = expiresInDays
    ? new Date(
        Date.now() +
          Math.max(1, parseInt(expiresInDays, 10)) * 24 * 60 * 60 * 1000,
      )
    : null;

  return prisma.premiumCode.create({
    data: {
      code: normalised,
      type: tier === "LIFETIME" ? "LIFETIME" : type,
      tier,
      maxUses: safeMaxUses,
      trialDays: safeTrialDays,
      expiresAt,
    },
  });
}

async function redeemPremiumCode({ guildId, userId, code }) {
  const normalised = String(code || "")
    .trim()
    .toUpperCase();
  const premiumCode = await prisma.premiumCode.findUnique({
    where: { code: normalised },
  });
  if (!premiumCode) throw new Error("Invalid premium code.");
  if (premiumCode.expiresAt && premiumCode.expiresAt < new Date())
    throw new Error("This code has expired.");
  if (premiumCode.uses >= premiumCode.maxUses)
    throw new Error(
      "This code has already been used the maximum number of times.",
    );

  let expiresAt = null;
  if (premiumCode.tier !== "LIFETIME" && premiumCode.trialDays) {
    expiresAt = new Date(
      Date.now() + premiumCode.trialDays * 24 * 60 * 60 * 1000,
    );
  }

  // Never downgrade LIFETIME or consume a code use for a no-op redemption.
  const existing = await prisma.guildPremium.findUnique({ where: { guildId } });
  if (existing?.tier === "LIFETIME") {
    throw new Error("This server already has LIFETIME premium.");
  }

  const claimed = await prisma.premiumCode.updateMany({
    where: {
      id: premiumCode.id,
      uses: { lt: premiumCode.maxUses },
    },
    data: { uses: { increment: 1 } },
  });
  if (claimed.count !== 1) {
    throw new Error(
      "This code has already been used the maximum number of times.",
    );
  }

  const now = new Date();
  const periodEnd =
    expiresAt || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const isRenewal = existing && existing.tier !== "FREE";

  const premium = await prisma.guildPremium.upsert({
    where: { guildId },
    update: {
      tier: premiumCode.tier,
      method: "CODE",
      code: normalised,
      expiresAt: periodEnd,
      lastRenewalAt: now,
      renewalCount: { increment: 1 },
      ...(isRenewal ? {} : { purchasedAt: now }),
      monthlyAiAllowance: 2000,
      monthlyAiPeriodStart: now,
      monthlyAiPeriodEnd: periodEnd,
      monthlyAiUsed: 0,
    },
    create: {
      guildId,
      tier: premiumCode.tier,
      method: "CODE",
      code: normalised,
      expiresAt: periodEnd,
      purchasedAt: now,
      lastRenewalAt: now,
      renewalCount: 1,
      monthlyAiAllowance: 2000,
      monthlyAiPeriodStart: now,
      monthlyAiPeriodEnd: periodEnd,
    },
  });
  premiumCache.delete(`tier:${guildId}`);
  logger.info("Premium code redeemed", {
    guildId,
    userId,
    code: normalised,
    tier: premiumCode.tier,
    expiresAt: premium.expiresAt,
  });
  return premium;
}

module.exports = {
  getPremiumStatus,
  getPremiumSource,
  getAiCreditStatus,
  canUseAi,
  consumeAiCredits,
  refundAiCredits,
  grantPremium,
  revokePremium,
  createPremiumCode,
  updateAiSettings,
  getAiAdminSettings,
  redeemPremiumCode,
};
