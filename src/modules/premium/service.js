"use strict";

const prisma = require("../../lib/prisma");
const { premiumCache } = require("../../lib/cache");
const { getPlanLimits } = require("../../config/plans");
const logger = require("../../lib/logger");

// ─── Premium status ───────────────────────────────────────────────────────────

const GRACE_HOURS = 24;

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
    const graceEnd = new Date(
      premium.expiresAt.getTime() + GRACE_HOURS * 60 * 60 * 1000,
    );
    if (now <= graceEnd) {
      // Within 24-hour grace period — keep active but mark as grace
      inGrace = true;
      isActive = true;
    } else {
      tier = "FREE";
      isActive = false;
    }
  }

  return {
    tier: tier === "PRO" ? "PREMIUM" : tier,
    premium,
    limits: getPlanLimits(tier),
    isLifetime: false,
    isActive,
    inGrace,
    expiresAt: premium?.expiresAt,
    graceEndsAt: inGrace
      ? new Date(premium.expiresAt.getTime() + GRACE_HOURS * 60 * 60 * 1000)
      : null,
  };
}

function getPremiumSource(premium) {
  if (!premium || premium.tier === "FREE") return "Free";
  if (premium.method === "STRIPE" || premium.entitlementId)
    return "Discord Subscription";
  if (premium.method === "CODE") return "Premium Code";
  if (premium.method === "MANUAL") return "Manual Grant";
  return "Unknown";
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

  // Auto-reset monthly credits if period has expired
  let monthlyUsed = premium.monthlyAiUsed || 0;
  if (premium.monthlyAiPeriodEnd && new Date() > premium.monthlyAiPeriodEnd) {
    const now = new Date();
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

// ─── Discord entitlement processing ───────────────────────────────────────────

async function processSubscriptionEntitlement(guildId, entitlementId) {
  const existing = await prisma.guildPremium.findUnique({ where: { guildId } });

  // Never downgrade LIFETIME
  if (existing?.tier === "LIFETIME") return;

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Same entitlement ID = renewal (Discord auto-charge)
  if (existing?.entitlementId === entitlementId) {
    // Only process if subscription is near/past expiry (not a duplicate event)
    if (
      existing.expiresAt &&
      existing.expiresAt > new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    ) {
      return; // Still has 7+ days — likely a duplicate event, skip
    }

    await prisma.guildPremium.update({
      where: { guildId },
      data: {
        expiresAt: periodEnd,
        monthlyAiUsed: 0,
        monthlyAiAllowance: 2000,
        monthlyAiPeriodStart: now,
        monthlyAiPeriodEnd: periodEnd,
        lastRenewalAt: now,
        renewalCount: { increment: 1 },
        graceNotifiedAt: null, // reset grace warning for new period
      },
    });
    premiumCache.delete(`tier:${guildId}`);
    logger.info("Premium renewed via Discord (monthly auto-charge)", {
      guildId,
      entitlementId,
      renewalCount: (existing.renewalCount || 0) + 1,
    });
    return;
  }

  // New entitlement or first purchase
  const isRenewal = existing && existing.tier !== "FREE";

  await prisma.guildPremium.upsert({
    where: { guildId },
    update: {
      tier: "PRO",
      method: "STRIPE",
      entitlementId,
      expiresAt: periodEnd,
      monthlyAiAllowance: 2000,
      monthlyAiPeriodStart: now,
      monthlyAiPeriodEnd: periodEnd,
      monthlyAiUsed: 0,
      lastRenewalAt: now,
      renewalCount: { increment: 1 },
      graceNotifiedAt: null,
      ...(isRenewal ? {} : { purchasedAt: now }),
    },
    create: {
      guildId,
      tier: "PRO",
      method: "STRIPE",
      entitlementId,
      expiresAt: periodEnd,
      monthlyAiAllowance: 2000,
      monthlyAiPeriodStart: now,
      monthlyAiPeriodEnd: periodEnd,
      purchasedAt: now,
      lastRenewalAt: now,
      renewalCount: 1,
    },
  });
  premiumCache.delete(`tier:${guildId}`);
  logger.info("Premium activated via Discord subscription", {
    guildId,
    entitlementId,
    isRenewal,
  });
}

async function processAiCreditsEntitlement(guildId, skuId, entitlementId) {
  // Check if already processed
  const existing = await prisma.processedEntitlement.findUnique({
    where: { entitlementId },
  });
  if (existing) return;

  // Grant 3000 extra AI credits
  await prisma.guildPremium.upsert({
    where: { guildId },
    update: { extraAiCredits: { increment: 3000 } },
    create: { guildId, tier: "FREE", method: "STRIPE" },
  });

  // Record processed entitlement
  await prisma.processedEntitlement.create({
    data: { guildId, skuId, entitlementId, creditsGranted: 3000 },
  });

  logger.info("AI credits granted via Discord SKU", {
    guildId,
    entitlementId,
    credits: 3000,
  });
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
  if (premiumCode.type === "TRIAL" && premiumCode.trialDays) {
    expiresAt = new Date(
      Date.now() + premiumCode.trialDays * 24 * 60 * 60 * 1000,
    );
  }

  await prisma.premiumCode.update({
    where: { id: premiumCode.id },
    data: { uses: { increment: 1 } },
  });

  // Never downgrade LIFETIME
  const existing = await prisma.guildPremium.findUnique({ where: { guildId } });
  if (existing?.tier === "LIFETIME") {
    throw new Error("This server already has LIFETIME premium.");
  }

  const now = new Date();
  const periodEnd =
    expiresAt || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const isRenewal = existing && existing.tier !== "FREE";

  return prisma.guildPremium.upsert({
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
}

module.exports = {
  getPremiumStatus,
  getPremiumSource,
  getAiCreditStatus,
  canUseAi,
  consumeAiCredits,
  refundAiCredits,
  processSubscriptionEntitlement,
  processAiCreditsEntitlement,
  updateAiSettings,
  getAiAdminSettings,
  redeemPremiumCode,
};
