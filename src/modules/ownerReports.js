"use strict";

const { EmbedBuilder } = require("discord.js");
const prisma = require("../lib/prisma");
const logger = require("../lib/logger");

const DEFAULT_OWNER_REPORT_CHANNEL_ID = "1367326139109871738";
const SETTINGS_ID = "default";

async function ensureOwnerReportSettingsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BotOwnerReportSettings" (
      "id" TEXT PRIMARY KEY DEFAULT 'default',
      "hourlyReportChannelId" TEXT,
      "guildJoinChannelId" TEXT,
      "guildLeaveChannelId" TEXT,
      "databaseStatusChannelId" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "BotOwnerReportSettings" (
      "id",
      "hourlyReportChannelId",
      "guildJoinChannelId",
      "guildLeaveChannelId",
      "databaseStatusChannelId"
    ) VALUES ($1, $2, $2, $2, $2)
    ON CONFLICT ("id") DO NOTHING
  `,
    SETTINGS_ID,
    DEFAULT_OWNER_REPORT_CHANNEL_ID,
  );
}

async function getOwnerReportSettings() {
  await ensureOwnerReportSettingsTable();
  const rows = await prisma.$queryRawUnsafe(
    `SELECT * FROM "BotOwnerReportSettings" WHERE "id" = $1 LIMIT 1`,
    SETTINGS_ID,
  );
  const settings = rows?.[0] || {};
  return {
    hourlyReportChannelId:
      settings.hourlyReportChannelId || DEFAULT_OWNER_REPORT_CHANNEL_ID,
    guildJoinChannelId:
      settings.guildJoinChannelId || DEFAULT_OWNER_REPORT_CHANNEL_ID,
    guildLeaveChannelId:
      settings.guildLeaveChannelId || DEFAULT_OWNER_REPORT_CHANNEL_ID,
    databaseStatusChannelId:
      settings.databaseStatusChannelId || DEFAULT_OWNER_REPORT_CHANNEL_ID,
  };
}

async function updateOwnerReportSettings(patch) {
  await ensureOwnerReportSettingsTable();
  const allowed = [
    "hourlyReportChannelId",
    "guildJoinChannelId",
    "guildLeaveChannelId",
    "databaseStatusChannelId",
  ];
  const entries = Object.entries(patch).filter(([key]) =>
    allowed.includes(key),
  );
  if (!entries.length) return getOwnerReportSettings();

  const assignments = entries
    .map(([key], index) => `"${key}" = $${index + 2}`)
    .join(", ");
  await prisma.$executeRawUnsafe(
    `UPDATE "BotOwnerReportSettings" SET ${assignments}, "updatedAt" = NOW() WHERE "id" = $1`,
    SETTINGS_ID,
    ...entries.map(([, value]) => value || null),
  );
  return getOwnerReportSettings();
}

async function resetOwnerReportSettings() {
  await ensureOwnerReportSettingsTable();
  await prisma.$executeRawUnsafe(
    `UPDATE "BotOwnerReportSettings"
     SET "hourlyReportChannelId" = $2,
         "guildJoinChannelId" = $2,
         "guildLeaveChannelId" = $2,
         "databaseStatusChannelId" = $2,
         "updatedAt" = NOW()
     WHERE "id" = $1`,
    SETTINGS_ID,
    DEFAULT_OWNER_REPORT_CHANNEL_ID,
  );
  return getOwnerReportSettings();
}

async function fetchReportChannel(client, channelId) {
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel?.isTextBased?.() ? channel : null;
}

async function sendOwnerReport(client, kind, payload) {
  const settings = await getOwnerReportSettings().catch((error) => {
    logger.warn("Owner report settings unavailable", { error: error.message });
    return null;
  });
  const channelId =
    settings?.[`${kind}ChannelId`] || DEFAULT_OWNER_REPORT_CHANNEL_ID;
  const channel = await fetchReportChannel(client, channelId);
  if (!channel) {
    logger.warn("Owner report channel unavailable", { kind, channelId });
    return false;
  }
  await channel.send(payload);
  return true;
}

async function getDatabaseStatus(client) {
  const startedAt = Date.now();
  let ok = false;
  let error = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    ok = true;
  } catch (err) {
    error = err.message;
  }

  const liveGuildIds = [...client.guilds.cache.keys()];
  const [dbGuilds, commandRows, aiRows, installEvents, premiumRows] =
    await Promise.all([
      prisma.guild.count().catch(() => null),
      prisma.botCommandUsage.count().catch(() => null),
      prisma.botAiUsage.count().catch(() => null),
      prisma.botGuildInstallEvent.count().catch(() => null),
      prisma.guildPremium.count().catch(() => null),
    ]);

  let trackedLiveGuilds = null;
  if (liveGuildIds.length) {
    trackedLiveGuilds = await prisma.guild
      .count({ where: { id: { in: liveGuildIds } } })
      .catch(() => null);
  }

  return {
    ok,
    latencyMs: Date.now() - startedAt,
    error,
    dbGuilds,
    liveGuilds: client.guilds.cache.size,
    trackedLiveGuilds,
    commandRows,
    aiRows,
    installEvents,
    premiumRows,
  };
}

function buildSettingsEmbed(settings, dbStatus = null) {
  const dbValue = dbStatus
    ? `${dbStatus.ok ? "Online" : "Problem"} · ${dbStatus.latencyMs}ms\nDB guilds: ${dbStatus.dbGuilds ?? "?"} · Live guilds: ${dbStatus.liveGuilds ?? "?"} · Tracked live: ${dbStatus.trackedLiveGuilds ?? "?"}`
    : "Not checked yet";

  return new EmbedBuilder()
    .setTitle("Bot Owner Operations Panel")
    .setColor(dbStatus?.ok === false ? 0xed4245 : 0x1a7a9e)
    .setDescription(
      "Configure where Discore sends owner-only operational reports.",
    )
    .addFields(
      {
        name: "Hourly Report",
        value: settings.hourlyReportChannelId
          ? `<#${settings.hourlyReportChannelId}>`
          : "Not set",
        inline: true,
      },
      {
        name: "Server Added",
        value: settings.guildJoinChannelId
          ? `<#${settings.guildJoinChannelId}>`
          : "Not set",
        inline: true,
      },
      {
        name: "Server Removed",
        value: settings.guildLeaveChannelId
          ? `<#${settings.guildLeaveChannelId}>`
          : "Not set",
        inline: true,
      },
      {
        name: "Database Status",
        value: settings.databaseStatusChannelId
          ? `<#${settings.databaseStatusChannelId}>`
          : "Not set",
        inline: true,
      },
      { name: "Database", value: dbValue, inline: false },
    )
    .setTimestamp()
    .setFooter({ text: "Discore owner telemetry" });
}

function buildDatabaseStatusEmbed(status) {
  return new EmbedBuilder()
    .setTitle(
      status.ok ? "Database Status: Online" : "Database Status: Problem",
    )
    .setColor(status.ok ? 0x57f287 : 0xed4245)
    .addFields(
      { name: "Latency", value: `${status.latencyMs}ms`, inline: true },
      { name: "Live Guilds", value: String(status.liveGuilds), inline: true },
      {
        name: "DB Guilds",
        value: String(status.dbGuilds ?? "?"),
        inline: true,
      },
      {
        name: "Tracked Live Guilds",
        value: String(status.trackedLiveGuilds ?? "?"),
        inline: true,
      },
      {
        name: "Rows",
        value: `Commands: ${status.commandRows ?? "?"}\nAI: ${status.aiRows ?? "?"}\nInstall events: ${status.installEvents ?? "?"}\nPremium rows: ${status.premiumRows ?? "?"}`,
        inline: false,
      },
    )
    .setDescription(
      status.error ? `Error: ${status.error.slice(0, 500)}` : null,
    )
    .setTimestamp()
    .setFooter({ text: "Discore database monitor" });
}

async function sendDatabaseStatusReport(client) {
  const status = await getDatabaseStatus(client);
  await sendOwnerReport(client, "databaseStatus", {
    embeds: [buildDatabaseStatusEmbed(status)],
  });
  return status;
}

module.exports = {
  DEFAULT_OWNER_REPORT_CHANNEL_ID,
  ensureOwnerReportSettingsTable,
  getOwnerReportSettings,
  updateOwnerReportSettings,
  resetOwnerReportSettings,
  sendOwnerReport,
  getDatabaseStatus,
  buildSettingsEmbed,
  buildDatabaseStatusEmbed,
  sendDatabaseStatusReport,
};
