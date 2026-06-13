const prisma = require("../lib/prisma");
const { premiumCache } = require("../lib/cache");
const { getPlanLimits } = require("../config/plans");
const logger = require("../lib/logger");

// Tracks the last credit reset month so we only reset once per calendar month
let lastCreditResetMonth = null;

module.exports = {
  name: "premiumSyncJob",
  intervalMs: 15 * 60_000,
  enabled: true,
  async run(client) {
    const now = new Date();

    // Expire trials
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

    // Monthly AI credit top-up — runs once per calendar month
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
      const limits = getPlanLimits(tier);
      if (!limits.aiCreditsMonthly) continue;
      await prisma.aiCredits.upsert({
        where: { guildId: record.guildId },
        update: { balance: limits.aiCreditsMonthly },
        create: { guildId: record.guildId, balance: limits.aiCreditsMonthly },
      });
      logger.info("Monthly AI credits reset", {
        guildId: record.guildId,
        tier,
        credits: limits.aiCreditsMonthly,
      });
    }
  },
};
