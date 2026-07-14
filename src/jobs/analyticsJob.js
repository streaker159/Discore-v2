"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const prisma = require("../lib/prisma");
const logger = require("../lib/logger");

const OFFICIAL_CHANNEL = "1367326139109871738";
let isRunning = false;

function scheduleNextRun(client) {
  const now = new Date();
  const msToNextMinute = (60 - now.getSeconds()) * 1000;
  const msToTargetMinute = (60 - now.getMinutes() - 1) * 60000 + msToNextMinute;
  // Target: minute 1 past every hour (e.g. 12:01, 13:01)
  const delay =
    msToTargetMinute > 0 ? msToTargetMinute : msToTargetMinute + 3600000;

  setTimeout(() => {
    runReport(client).catch((e) => {
      logger.error("[AnalyticsJob] Failed", { error: e.message });
    });
    // Then every hour
    setInterval(() => {
      runReport(client).catch((e) => {
        logger.error("[AnalyticsJob] Failed", { error: e.message });
      });
    }, 3600000);
  }, delay);

  logger.info(
    `[AnalyticsJob] Scheduled — first run in ${Math.round(delay / 1000)}s (at ~minute 1 past next hour)`,
  );
}

async function runReport(client) {
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
      logger.warn("[AnalyticsJob] Official channel not found");
      return;
    }

    const now = new Date();
    const reportHour = `${now.toISOString().slice(0, 13)}:00`;
    const dayAgo = new Date(now - 24 * 3600 * 1000);
    const weekAgo = new Date(now - 7 * 24 * 3600 * 1000);

    const totalGuilds = client.guilds.cache.size;
    let totalMembers = 0;
    let largestGuild = null;
    for (const [, g] of client.guilds.cache) {
      const mc = g.memberCount ?? 0;
      totalMembers += mc;
      if (!largestGuild || mc > (largestGuild.memberCount ?? 0)) {
        largestGuild = { name: g.name, memberCount: mc };
      }
    }
    const avgMembers =
      totalGuilds > 0 ? Math.round(totalMembers / totalGuilds) : 0;
    const uptime = Math.floor(process.uptime());
    const uptimeH = Math.floor(uptime / 3600);
    const uptimeM = Math.floor((uptime % 3600) / 60);
    const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

    const [
      cmds24,
      cmds7,
      cmdsAll,
      failedCmds24,
      failedCmdsAll,
      ai24,
      ai7,
      aiAll,
      aiSuccess24,
      aiFailed24,
      aiFailedAll,
      liveBoards,
      activeBoards,
      totalBoards,
      archivedBoards,
      totalEntries,
      totalScoreTypes,
      boardsByServer,
      premiumActive,
      premiumExpired,
      totalPremServers,
      joins24,
      leaves24,
      configChannels,
      totalGuildsDb,
      onboardedCount,
      topCmds24Rows,
      topSrv24Rows,
    ] = await Promise.all([
      prisma.botCommandUsage
        .count({ where: { createdAt: { gte: dayAgo } } })
        .catch(() => 0),
      prisma.botCommandUsage
        .count({ where: { createdAt: { gte: weekAgo } } })
        .catch(() => 0),
      prisma.botCommandUsage.count().catch(() => 0),
      prisma.botCommandUsage
        .count({ where: { createdAt: { gte: dayAgo }, success: false } })
        .catch(() => 0),
      prisma.botCommandUsage
        .count({ where: { success: false } })
        .catch(() => 0),
      prisma.botAiUsage
        .count({ where: { createdAt: { gte: dayAgo } } })
        .catch(() => 0),
      prisma.botAiUsage
        .count({ where: { createdAt: { gte: weekAgo } } })
        .catch(() => 0),
      prisma.botAiUsage.count().catch(() => 0),
      prisma.botAiUsage
        .count({ where: { createdAt: { gte: dayAgo }, success: true } })
        .catch(() => 0),
      prisma.botAiUsage
        .count({ where: { createdAt: { gte: dayAgo }, success: false } })
        .catch(() => 0),
      prisma.botAiUsage.count({ where: { success: false } }).catch(() => 0),
      prisma.scoreboard.count({ where: { isArchived: false } }).catch(() => 0),
      prisma.scoreboard
        .count({ where: { isArchived: false, entries: { some: {} } } })
        .catch(() => 0),
      prisma.scoreboard.count().catch(() => 0),
      prisma.scoreboard.count({ where: { isArchived: true } }).catch(() => 0),
      prisma.scoreboardEntry.count().catch(() => 0),
      prisma.scoreboardScoreType.count().catch(() => 0),
      prisma.scoreboard
        .findMany({
          where: { isArchived: false },
          select: { guildId: true },
          distinct: ["guildId"],
        })
        .catch(() => []),
      prisma.guildPremium
        .count({ where: { tier: { not: "FREE" }, expiresAt: { gte: now } } })
        .catch(() => 0),
      prisma.guildPremium
        .count({ where: { tier: { not: "FREE" }, expiresAt: { lt: now } } })
        .catch(() => 0),
      prisma.guildPremium
        .count({ where: { tier: { not: "FREE" } } })
        .catch(() => 0),
      prisma.botGuildInstallEvent
        .count({ where: { eventType: "JOIN", createdAt: { gte: dayAgo } } })
        .catch(() => 0),
      prisma.botGuildInstallEvent
        .count({ where: { eventType: "LEAVE", createdAt: { gte: dayAgo } } })
        .catch(() => 0),
      prisma.guild
        .count({
          where: {
            announcementChannelId: { not: null },
            id: { in: [...client.guilds.cache.keys()] },
          },
        })
        .catch(() => 0),
      prisma.guild
        .count({ where: { id: { in: [...client.guilds.cache.keys()] } } })
        .catch(() => 0),
      prisma.guild
        .count({
          where: {
            onboardingSentAt: { not: null },
            id: { in: [...client.guilds.cache.keys()] },
          },
        })
        .catch(() => 0),
      prisma.botCommandUsage
        .groupBy({
          by: ["commandName"],
          where: { createdAt: { gte: dayAgo } },
          _count: { commandName: true },
          orderBy: { _count: { commandName: "desc" } },
          take: 5,
        })
        .catch(() => []),
      prisma.botCommandUsage
        .groupBy({
          by: ["guildId"],
          where: { createdAt: { gte: dayAgo } },
          _count: { guildId: true },
          orderBy: { _count: { guildId: "desc" } },
          take: 3,
        })
        .catch(() => []),
    ]);

    const topCmdsStr = topCmds24Rows.length
      ? topCmds24Rows
          .map(
            (r, i) => `${i + 1}. /${r.commandName} — ${r._count.commandName}`,
          )
          .join("\n")
      : "No data yet";
    const topSrvStr = topSrv24Rows.length
      ? topSrv24Rows
          .map((r, i) => {
            const g = client.guilds.cache.get(r.guildId);
            return `${i + 1}. ${g?.name || r.guildId} — ${r._count.guildId} cmds`;
          })
          .join("\n")
      : "No data yet";

    const alerts = [];
    if (memMB > 500) alerts.push(`⚠️ High memory: ${memMB} MB`);
    if (failedCmds24 > 0) alerts.push(`⚠️ ${failedCmds24} failed commands`);
    if (aiFailed24 > 0) alerts.push(`⚠️ ${aiFailed24} failed AI`);
    if (totalGuildsDb > 0 && configChannels < totalGuildsDb)
      alerts.push(
        `⚠️ ${totalGuildsDb - configChannels} servers missing announcement channel`,
      );
    const alertsStr = alerts.length ? alerts.join("\n") : "✅ All clear";

    // ── AI Image Gen Stats ──────────────────────────────────────────────
    const imgGen24 = await prisma.botAiUsage
      .count({
        where: {
          createdAt: { gte: dayAgo },
          requestType: "IMAGE_GENERATION",
        },
      })
      .catch(() => 0);
    const imgGenAll = await prisma.botAiUsage
      .count({ where: { requestType: "IMAGE_GENERATION" } })
      .catch(() => 0);
    const imgGenEnabled = await prisma.guildPremium
      .count({ where: { aiImageGenEnabled: true } })
      .catch(() => 0);

    // ── Top 5 Servers by AI Usage ──────────────────────────────────────
    const topAiServers = await prisma.botAiUsage
      .groupBy({
        by: ["guildId"],
        where: { createdAt: { gte: dayAgo } },
        _count: { id: true },
        _sum: { creditsUsed: true },
        orderBy: { _sum: { creditsUsed: "desc" } },
        take: 5,
      })
      .catch(() => []);
    const topAiServersStr = topAiServers.length
      ? topAiServers
          .map((r, i) => {
            const g = client.guilds.cache.get(r.guildId);
            return `${i + 1}. ${g?.name || r.guildId} — ${r._sum.creditsUsed || 0} credits · ${r._count.id} requests`;
          })
          .join("\n")
      : "No AI usage yet";

    // Expand top servers to 5
    const topSrv5Rows = await prisma.botCommandUsage
      .groupBy({
        by: ["guildId"],
        where: { createdAt: { gte: dayAgo } },
        _count: { guildId: true },
        orderBy: { _count: { guildId: "desc" } },
        take: 5,
      })
      .catch(() => []);
    const topSrv5Str = topSrv5Rows.length
      ? topSrv5Rows
          .map((r, i) => {
            const g = client.guilds.cache.get(r.guildId);
            return `${i + 1}. ${g?.name || r.guildId} — ${r._count.guildId} cmds`;
          })
          .join("\n")
      : "No data yet";

    const embed = new EmbedBuilder()
      .setTitle("📊 Hourly Discore Operations Report")
      .setColor(0x5865f2)
      .addFields(
        {
          name: "🟢 Service",
          value: `Online · ${uptimeH}h ${uptimeM}m · ${memMB} MB · ${client.ws.ping}ms`,
          inline: false,
        },
        {
          name: "🌍 Network",
          value: `${totalGuilds} servers · ${totalMembers.toLocaleString()} members · Avg ${avgMembers}/server · ${totalGuildsDb} DB guilds`,
          inline: false,
        },
        {
          name: "⚙️ Commands",
          value: `24h: ${cmds24} · 7d: ${cmds7} · All: ${cmdsAll} · Failed: ${failedCmds24}`,
          inline: true,
        },
        {
          name: "🤖 AI",
          value: `24h: ${ai24} · 7d: ${ai7} · All: ${aiAll} · Failed: ${aiFailed24}`,
          inline: true,
        },
        {
          name: "🎨 AI Image Gen",
          value: `24h: ${imgGen24} · All time: ${imgGenAll} · Servers enabled: ${imgGenEnabled}`,
          inline: true,
        },
        {
          name: "🏆 Scoreboards",
          value: `Live: ${liveBoards} · Active: ${activeBoards} · Total: ${totalBoards} · Archived: ${archivedBoards} · Entries: ${totalEntries} · Types: ${totalScoreTypes} · ${boardsByServer.length} servers`,
          inline: false,
        },
        {
          name: "💎 Premium",
          value: `Active: ${premiumActive} · Expired: ${premiumExpired} · Total: ${totalPremServers} (${totalGuilds > 0 ? Math.round((totalPremServers / totalGuilds) * 100) : 0}%)`,
          inline: true,
        },
        {
          name: "📥 Growth",
          value: `New 24h: ${joins24} · Left: ${leaves24} · Onboarded: ${onboardedCount}/${totalGuildsDb}`,
          inline: true,
        },
        { name: "🔥 Top Commands 24h", value: topCmdsStr, inline: true },
        { name: "📢 Top Servers 24h", value: topSrv5Str, inline: true },
        { name: "🤖 Top AI Servers 24h", value: topAiServersStr, inline: true },
        { name: "⚠️ Alerts", value: alertsStr, inline: false },
      )
      .setTimestamp()
      .setFooter({ text: "Discore Official · Hourly Report" });

    // Buttons — disappear after 1 hour
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("analytics:server_lookup:")
        .setLabel("🔍 Server Lookup")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("analytics:export_all:")
        .setLabel("📊 Export All Servers")
        .setStyle(ButtonStyle.Success),
    );

    await channel.send({
      embeds: [embed],
      components: [buttons],
    });

    await prisma.botHourlyStatusReport.create({
      data: { channelId: OFFICIAL_CHANNEL, reportHour, status: "success" },
    });

    logger.info("[AnalyticsJob] Report sent successfully");
  } catch (err) {
    logger.error("[AnalyticsJob] Failed", { error: err.message });
  } finally {
    isRunning = false;
  }
}

module.exports = { scheduleNextRun };
