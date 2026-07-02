"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const { requireBotOwner } = require("../../../lib/ownerGuard");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bot")
    .setDescription("Bot owner tools")
    .addSubcommand((s) =>
      s
        .setName("announce")
        .setDescription("Send an announcement to all Discore servers.")
        .addStringOption((o) =>
          o
            .setName("title")
            .setDescription("Announcement title")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("description")
            .setDescription("Announcement body")
            .setRequired(true),
        )
        .addAttachmentOption((o) =>
          o.setName("image").setDescription("Optional image to include"),
        )
        .addBooleanOption((o) =>
          o
            .setName("ping_role")
            .setDescription("Ping @Discore Official role? (default: false)"),
        )
        .addBooleanOption((o) =>
          o
            .setName("dry_run")
            .setDescription(
              "Preview only, don't send globally (default: true)",
            ),
        )
        .addStringOption((o) =>
          o
            .setName("server_id")
            .setDescription("Send only to this server ID (for testing)"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("status")
        .setDescription("Show live bot analytics (owner only)."),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (!(await requireBotOwner(interaction))) return;

    if (sub === "announce") {
      await handleAnnounce(interaction);
    } else if (sub === "status") {
      await handleStatus(interaction);
    }
  },
};

// ── handleAnnounce (unchanged) ─────────────────────────────────────────────

async function handleAnnounce(interaction) {
  const title = interaction.options.getString("title", true);
  const description = interaction.options.getString("description", true);
  const imageAttachment = interaction.options.getAttachment("image");
  const pingRole = interaction.options.getBoolean("ping_role") ?? false;
  const dryRun = interaction.options.getBoolean("dry_run") ?? true;
  const serverId = interaction.options.getString("server_id");

  if (imageAttachment && !imageAttachment.contentType?.startsWith("image/")) {
    return interaction.reply({
      content: "❌ The attachment must be an image file.",
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x5865f2)
    .setFooter({ text: "Discore Official · Update Broadcast" })
    .setTimestamp();

  if (imageAttachment) {
    embed.setImage(`attachment://${imageAttachment.name}`);
  }

  const payload = { embeds: [embed] };
  if (imageAttachment) {
    const response = await fetch(imageAttachment.url);
    const buffer = Buffer.from(await response.arrayBuffer());
    payload.files = [
      new AttachmentBuilder(buffer, { name: imageAttachment.name }),
    ];
  }

  if (dryRun) {
    const content = pingRole
      ? "📢 **Ping Role: ON** (preview mode)\n"
      : "📢 **Preview Mode** (dry run)\n";
    return interaction.reply({
      content: content + "_This is a preview. No servers received this._",
      ...payload,
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  let guilds;
  if (serverId) {
    const g = interaction.client.guilds.cache.get(serverId);
    guilds = g ? [g] : [];
    if (!guilds.length) {
      return interaction.editReply({
        content: `❌ Server ID ${serverId} not found in bot cache.`,
      });
    }
  } else {
    guilds = [...interaction.client.guilds.cache.values()];
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const failedDetails = [];

  for (const g of guilds) {
    try {
      let channel = null;
      const guildRecord = await prisma.guild
        .findUnique({
          where: { id: g.id },
          select: { announcementChannelId: true },
        })
        .catch(() => null);

      if (guildRecord?.announcementChannelId) {
        channel = await g.channels
          .fetch(guildRecord.announcementChannelId)
          .catch(() => null);
      }
      if (!channel) {
        channel = g.channels.cache.find(
          (c) =>
            c.name === "📢・discore-announcements" &&
            c.isTextBased() &&
            !c.isThread(),
        );
      }
      if (!channel) {
        const {
          findBestChannel,
        } = require("../../../modules/onboarding/service");
        channel = findBestChannel(g);
      }

      if (!channel || !channel.isTextBased()) {
        skipped++;
        continue;
      }

      const me = g.members.me;
      const perms = channel.permissionsFor(me);
      if (!perms?.has(["SendMessages", "EmbedLinks"])) {
        skipped++;
        continue;
      }

      let content = "";
      if (pingRole) {
        const role = g.roles.cache.find((r) => r.name === "Discore Official");
        if (role && role.mentionable) {
          content = `${role} `;
        }
      }

      const serverPayload = { content: content || undefined, embeds: [embed] };
      if (payload.files) {
        const response = await fetch(imageAttachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        serverPayload.files = [
          new AttachmentBuilder(buffer, { name: imageAttachment.name }),
        ];
      }

      await channel.send(serverPayload);
      sent++;
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      failed++;
      failedDetails.push({ guild: g.name, id: g.id, error: err.message });
    }
  }

  const report = [
    `## 📢 Announcement Report`,
    ``,
    `**Sent:** ${sent}`,
    `**Skipped:** ${skipped}`,
    `**Failed:** ${failed}`,
  ];

  if (failedDetails.length) {
    report.push("");
    report.push("### Failures");
    for (const f of failedDetails.slice(0, 10)) {
      report.push(`• **${f.guild}** (${f.id}): ${f.error}`);
    }
    if (failedDetails.length > 10) {
      report.push(`+${failedDetails.length - 10} more`);
    }
  }

  return interaction.editReply({ content: report.join("\n") });
}

// ── handleStatus — expanded dashboard ────────────────────────────────────────

async function handleStatus(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const client = interaction.client;
  const uptime = Math.floor(process.uptime());
  const uptimeH = Math.floor(uptime / 3600);
  const uptimeM = Math.floor((uptime % 3600) / 60);
  const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

  // ── Guild stats ──────────────────────────────────────────────────────
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

  const now = new Date();
  const dayAgo = new Date(now - 24 * 3600 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 3600 * 1000);

  // ── All queries ───────────────────────────────────────────────────────
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
    // Announcement channel stats
    configChannels,
    totalGuildsDb,
    onboardedCount,
    topCmds24Rows,
    topSrv24Rows,
    avgCmdDuration,
    // Failed AI
    aiFailedAll,
    // Guild install alert check
    lastInstall,
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
    prisma.botCommandUsage.count({ where: { success: false } }).catch(() => 0),
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
    prisma.scoreboard.count({ where: { isArchived: false } }).catch(() => 0),
    prisma.scoreboard
      .count({ where: { isArchived: false, entries: { some: {} } } })
      .catch(() => 0), // approximate "active"
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
    // announcement channels
    prisma.guild
      .count({ where: { announcementChannelId: { not: null } } })
      .catch(() => 0),
    prisma.guild.count().catch(() => 0),
    prisma.guild
      .count({ where: { onboardingSentAt: { not: null } } })
      .catch(() => 0),
    // Top commands
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
        take: 5,
      })
      .catch(() => []),
    // Avg duration
    prisma.botCommandUsage
      .aggregate({
        where: { createdAt: { gte: dayAgo } },
        _avg: { durationMs: true },
      })
      .catch(() => ({ _avg: { durationMs: null } })),
    prisma.botAiUsage.count({ where: { success: false } }).catch(() => 0),
    prisma.botGuildInstallEvent
      .findFirst({
        where: { eventType: "JOIN" },
        orderBy: { createdAt: "desc" },
        select: { guildName: true },
      })
      .catch(() => null),
  ]);

  const topCmdsStr = topCmds24Rows.length
    ? topCmds24Rows
        .map((r, i) => `${i + 1}. /${r.commandName} — ${r._count.commandName}`)
        .join("\n")
    : "No commands tracked yet";
  const topSrvStr = topSrv24Rows.length
    ? topSrv24Rows
        .map((r, i) => {
          const g = client.guilds.cache.get(r.guildId);
          return `${i + 1}. ${g?.name || r.guildId} — ${r._count.guildId} commands`;
        })
        .join("\n")
    : "No server activity tracked yet";

  // Top 5 AI servers
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
  const topAiSrvStr = topAiServers.length
    ? topAiServers
        .map((r, i) => {
          const g = client.guilds.cache.get(r.guildId);
          return `${i + 1}. ${g?.name || r.guildId} — ${r._sum.creditsUsed || 0} credits · ${r._count.id} req`;
        })
        .join("\n")
    : "No AI data yet";

  // AI Image Gen stats
  const imgGen24 = await prisma.botAiUsage
    .count({
      where: {
        createdAt: { gte: dayAgo },
        requestType: "IMAGE_GENERATION",
      },
    })
    .catch(() => 0);
  const imgGenEnabled = await prisma.guildPremium
    .count({ where: { aiImageGenEnabled: true } })
    .catch(() => 0);

  // alert checks
  const alerts = [];
  if (!process.env.DISCORD_PREMIUM_SKU_ID)
    alerts.push("⚠️ Premium SKU missing");
  if (!process.env.DISCORD_AI_CREDITS_SKU_ID)
    alerts.push("⚠️ AI Credits SKU missing");
  if (totalGuildsDb > 0 && configChannels < totalGuildsDb)
    alerts.push(
      `⚠️ ${totalGuildsDb - configChannels} server(s) missing announcement channel`,
    );
  if (memMB > 500) alerts.push(`⚠️ High memory: ${memMB} MB`);
  if (failedCmds24 > 0) alerts.push(`⚠️ ${failedCmds24} failed commands (24h)`);
  if (aiFailed24 > 0) alerts.push(`⚠️ ${aiFailed24} failed AI requests (24h)`);
  const alertsStr = alerts.length ? alerts.join("\n") : "✅ No active alerts";

  const avgDurStr =
    avgCmdDuration?._avg?.durationMs != null
      ? `${Math.round(avgCmdDuration._avg.durationMs)}ms`
      : "Tracking from now";

  const embed = new EmbedBuilder()
    .setTitle("🛰️ Discore Official · Command Centre")
    .setDescription(
      "Real-time service status, usage analytics, scoreboard activity, AI demand, and server growth.",
    )
    .setColor(0x5865f2)
    .addFields(
      // ── Service Health ───────────────────────────────────────────────
      {
        name: "🟢 Service Health",
        value: [
          `Status: Online`,
          `Uptime: ${uptimeH}h ${uptimeM}m`,
          `Memory: ${memMB} MB`,
          `Ping: ${client.ws.ping}ms`,
          `Node: ${process.version}`,
        ].join("\n"),
        inline: true,
      },
      // ── Network Reach ─────────────────────────────────────────────────
      {
        name: "🌍 Network Reach",
        value: [
          `Servers: ${totalGuilds}`,
          `Members: ${totalMembers.toLocaleString()}`,
          `Avg/server: ${avgMembers}`,
          largestGuild
            ? `Largest: ${largestGuild.name} — ${largestGuild.memberCount}`
            : `Largest: N/A`,
        ].join("\n"),
        inline: true,
      },
      // ── Commands ──────────────────────────────────────────────────────
      {
        name: "⚙️ Command Usage",
        value: [
          `24h: ${cmds24} · 7d: ${cmds7} · All: ${cmdsAll}`,
          `Failed 24h: ${failedCmds24} · All: ${failedCmdsAll}`,
          `Avg duration: ${avgDurStr}`,
          ``,
          `Top 24h:`,
          topCmdsStr,
        ].join("\n"),
        inline: false,
      },
      // ── AI ────────────────────────────────────────────────────────────
      {
        name: "🤖 AI Usage",
        value: [
          `24h: ${ai24} · 7d: ${ai7} · All: ${aiAll}`,
          `Success 24h: ${aiSuccess24} · Failed 24h: ${aiFailed24}`,
          `Failed all time: ${aiFailedAll}`,
          aiAll === 0 ? `Tracking from now` : ``,
        ].join("\n"),
        inline: false,
      },
      // ── Scoreboards ───────────────────────────────────────────────────
      {
        name: "🏆 Scoreboard System",
        value: [
          `Live: ${liveBoards} · Total: ${totalBoards}`,
          `Archived: ${archivedBoards} · Entries: ${totalEntries}`,
          `Score Types: ${totalScoreTypes}`,
          `Servers using: ${boardsByServer.length}`,
        ].join("\n"),
        inline: false,
      },
      // ── Premium ───────────────────────────────────────────────────────
      {
        name: "💎 Premium",
        value: [
          `Active: ${premiumActive} · Expired: ${premiumExpired}`,
          `Total premium servers: ${totalPremServers}`,
          totalGuilds > 0
            ? `Coverage: ${Math.round((totalPremServers / totalGuilds) * 100)}%`
            : `Coverage: 0%`,
        ].join("\n"),
        inline: false,
      },
      // ── Announcements ─────────────────────────────────────────────────
      {
        name: "📢 Announcements",
        value: [
          `Configured: ${configChannels} / ${totalGuildsDb}`,
          `Missing: ${totalGuildsDb - configChannels}`,
          `Onboarded: ${onboardedCount} / ${totalGuildsDb}`,
          joins24 > 0
            ? `New 24h: ${joins24} · Left: ${leaves24}`
            : `New 24h: ${joins24}`,
          lastInstall ? `Last install: ${lastInstall.guildName}` : ``,
        ].join("\n"),
        inline: false,
      },
      // ── Top Activity ──────────────────────────────────────────────────
      {
        name: "🎨 AI Image Gen",
        value: `24h: ${imgGen24} · Servers enabled: ${imgGenEnabled}`,
        inline: true,
      },
      {
        name: "🔥 Top Activity 24h",
        value: topSrvStr || "Not enough data yet",
        inline: false,
      },
      {
        name: "🤖 Top AI Servers 24h",
        value: topAiSrvStr,
        inline: false,
      },
      // ── Alerts ────────────────────────────────────────────────────────
      {
        name: "⚠️ Alerts",
        value: alertsStr,
        inline: false,
      },
    )
    .setTimestamp()
    .setFooter({ text: "Discore Official · Bot Analytics" });

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

  return interaction.editReply({ embeds: [embed], components: [buttons] });
}
