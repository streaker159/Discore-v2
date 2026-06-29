"use strict";

const { EmbedBuilder } = require("discord.js");
const prisma = require("../lib/prisma");
const logger = require("../lib/logger");

const OFFICIAL_CHANNEL = "1367326139109871738";
let isRunning = false;

module.exports = {
  name: "analyticsJob",
  intervalMs: 3600000, // every hour
  async execute(client) {
    if (isRunning) {
      logger.info("[AnalyticsJob] Skipped — previous run still in progress");
      return;
    }
    isRunning = true;

    try {
      const channel = await client.channels
        .fetch(OFFICIAL_CHANNEL)
        .catch(() => null);
      if (!channel || !channel.isTextBased()) {
        logger.warn(
          "[AnalyticsJob] Official channel not found or not text-based",
        );
        return;
      }

      const now = new Date();
      const reportHour = `${now.toISOString().slice(0, 13)}:00`;
      const dayAgo = new Date(now - 24 * 3600 * 1000);
      const weekAgo = new Date(now - 7 * 24 * 3600 * 1000);

      const totalGuilds = client.guilds.cache.size;
      let totalMembers = 0;
      for (const [, g] of client.guilds.cache) {
        totalMembers += g.memberCount ?? 0;
      }
      const uptime = Math.floor(process.uptime());
      const uptimeH = Math.floor(uptime / 3600);
      const uptimeM = Math.floor((uptime % 3600) / 60);
      const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

      const [
        cmds24,
        cmds7,
        cmdsAll,
        ai24,
        ai7,
        aiAll,
        liveBoards,
        totalBoards,
        archivedBoards,
        premiumActive,
        premiumExpired,
        joins24,
        leaves24,
      ] = await Promise.all([
        prisma.botCommandUsage
          .count({ where: { createdAt: { gte: dayAgo } } })
          .catch(() => 0),
        prisma.botCommandUsage
          .count({ where: { createdAt: { gte: weekAgo } } })
          .catch(() => 0),
        prisma.botCommandUsage.count().catch(() => 0),
        prisma.botAiUsage
          .count({ where: { createdAt: { gte: dayAgo } } })
          .catch(() => 0),
        prisma.botAiUsage
          .count({ where: { createdAt: { gte: weekAgo } } })
          .catch(() => 0),
        prisma.botAiUsage.count().catch(() => 0),
        prisma.scoreboard
          .count({ where: { isArchived: false } })
          .catch(() => 0),
        prisma.scoreboard.count().catch(() => 0),
        prisma.scoreboard.count({ where: { isArchived: true } }).catch(() => 0),
        prisma.guildPremium
          .count({ where: { tier: { not: "FREE" }, expiresAt: { gte: now } } })
          .catch(() => 0),
        prisma.guildPremium
          .count({ where: { tier: { not: "FREE" }, expiresAt: { lt: now } } })
          .catch(() => 0),
        prisma.botGuildInstallEvent
          .count({ where: { eventType: "JOIN", createdAt: { gte: dayAgo } } })
          .catch(() => 0),
        prisma.botGuildInstallEvent
          .count({ where: { eventType: "LEAVE", createdAt: { gte: dayAgo } } })
          .catch(() => 0),
      ]);

      const embed = new EmbedBuilder()
        .setTitle("📊 Hourly Analytics Report")
        .setColor(0x5865f2)
        .addFields(
          { name: "🖥️ Servers", value: String(totalGuilds), inline: true },
          { name: "👥 Members", value: String(totalMembers), inline: true },
          { name: "⬆️ Uptime", value: `${uptimeH}h ${uptimeM}m`, inline: true },
          { name: "💾 Memory", value: `${memMB} MB`, inline: true },
          { name: "Node", value: process.version, inline: true },
          { name: "", value: "" },
          {
            name: "📊 Commands (24h / 7d / All)",
            value: `${cmds24} / ${cmds7} / ${cmdsAll}`,
            inline: false,
          },
          {
            name: "🤖 AI (24h / 7d / All)",
            value: `${ai24} / ${ai7} / ${aiAll}`,
            inline: false,
          },
          {
            name: "📋 Scoreboards (Live / Total / Archived)",
            value: `${liveBoards} / ${totalBoards} / ${archivedBoards}`,
            inline: false,
          },
          {
            name: "💎 Premium (Active / Expired)",
            value: `${premiumActive} / ${premiumExpired}`,
            inline: false,
          },
          {
            name: "📥 Joins / Leaves (24h)",
            value: `${joins24} / ${leaves24}`,
            inline: false,
          },
        )
        .setTimestamp()
        .setFooter({ text: "Discore Official · Hourly Report" });

      await channel.send({ embeds: [embed] });

      // Record report
      await prisma.botHourlyStatusReport.create({
        data: {
          channelId: OFFICIAL_CHANNEL,
          reportHour,
          status: "success",
        },
      });

      logger.info("[AnalyticsJob] Hourly report sent successfully");
    } catch (err) {
      logger.error("[AnalyticsJob] Failed", { error: err.message });
    } finally {
      isRunning = false;
    }
  },
};
