"use strict";

const prisma = require("../lib/prisma");
const { premiumCache } = require("../lib/cache");
const logger = require("../lib/logger");

let lastCreditResetMonth = null;

module.exports = {
  name: "premiumSyncJob",
  intervalMs: 15 * 60_000,
  enabled: true,
  async run(client) {
    const now = new Date();

    // Expire trials / non-LIFETIME premium past expiry
    const expired = await prisma.guildPremium.findMany({
      where: { expiresAt: { lt: now }, tier: { not: "FREE" } },
    });
    for (const record of expired) {
      await prisma.guildPremium.update({
        where: { id: record.id },
        data: { tier: "FREE" },
      });
      premiumCache.delete(`tier:${record.guildId}`);
      logger.info("Premium expired", { guildId: record.guildId });
    }

    // Monthly AI credit reset — runs once per calendar month
    const currentMonth = `${now.getFullYear()}-${now.getMonth()}`;
    if (lastCreditResetMonth === currentMonth) return;
    lastCreditResetMonth = currentMonth;

    const allPremium = await prisma.guildPremium.findMany({
      where: { tier: { not: "FREE" } },
    });
    for (const record of allPremium) {
      const tier =
        record.expiresAt && record.expiresAt < now ? "FREE" : record.tier;
      if (tier === "FREE") continue;

      // Reset monthly AI usage and set new period
      const periodStart = new Date();
      const periodEnd = new Date(
        periodStart.getTime() + 30 * 24 * 60 * 60 * 1000,
      );

      // Ensure allowance matches plan limits (fixes legacy records with 0)
      const { getPlanLimits } = require("../config/plans");
      const limits = getPlanLimits(tier);
      const allowance = limits.aiCreditsMonthly || 0;

      await prisma.guildPremium.update({
        where: { id: record.id },
        data: {
          monthlyAiUsed: 0,
          monthlyAiAllowance: allowance,
          monthlyAiPeriodStart: periodStart,
          monthlyAiPeriodEnd: periodEnd,
        },
      });

      logger.info("Monthly AI credits reset on GuildPremium", {
        guildId: record.guildId,
        tier,
        monthlyAiAllowance: allowance,
      });
    }
  },
};
