"use strict";

const prisma = require("../lib/prisma");
const { premiumCache } = require("../lib/cache");
const logger = require("../lib/logger");

const GRACE_HOURS = 24;

module.exports = {
  name: "premiumSyncJob",
  intervalMs: 30 * 60_000, // 30 minutes
  enabled: true,
  async run(client) {
    const now = new Date();

    // ── Grace period warnings ────────────────────────────────────────────────
    // Find premium that expired within the last 23 hours (grace ending soon)
    // and send a channel notification if configured
    const graceStart = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    const expiringGrace = await prisma.guildPremium.findMany({
      where: {
        tier: { notIn: ["FREE", "LIFETIME"] },
        expiresAt: { gte: graceStart, lte: now },
        graceNotifiedAt: null,
      },
    });

    for (const p of expiringGrace) {
      const guild = await prisma.guild.findUnique({
        where: { id: p.guildId },
        select: { premiumNoticeChan: true },
      }).catch(() => null);

      if (guild?.premiumNoticeChan) {
        const channel = client.channels.cache.get(guild.premiumNoticeChan);
        if (channel) {
          await channel.send({
            content: `⚠️ **Premium Expiring Soon**\n\nThis server's premium expired <t:${Math.floor(p.expiresAt.getTime() / 1000)}:R>. You have a **24-hour grace period** before features lock.\n\nRenew with \`/premium\` to keep everything running.`,
          }).catch(() => {});
        }
      }

      await prisma.guildPremium.update({
        where: { id: p.id },
        data: { graceNotifiedAt: now },
      }).catch(() => {});
    }

    // ── Fully expired (past grace) — downgrade ──────────────────────────────
    const graceDeadline = new Date(now.getTime() - GRACE_HOURS * 60 * 60 * 1000);
    const fullyExpired = await prisma.guildPremium.updateMany({
      where: {
        tier: { notIn: ["FREE", "LIFETIME"] },
        expiresAt: { lte: graceDeadline },
      },
      data: { tier: "FREE", monthlyAiAllowance: 0, monthlyAiUsed: 0 },
    });

    // Clear cache for downgraded guilds
    const downgraded = await prisma.guildPremium.findMany({
      where: { tier: "FREE", expiresAt: { lte: graceDeadline } },
      select: { guildId: true },
    });
    for (const d of downgraded) {
      premiumCache.delete(`tier:${d.guildId}`);
    }

    if (expiringGrace.length || fullyExpired.count) {
      logger.info("premiumSyncJob: grace cycle", {
        graceWarnings: expiringGrace.length,
        fullyExpired: fullyExpired.count,
      });
    }
  },
};
