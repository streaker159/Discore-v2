"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const { requireBotOwner } = require("../../../lib/ownerGuard");

module.exports = {
  scope: "PRIVATE",
  data: new SlashCommandBuilder()
    .setName("bot")
    .setDescription("Bot owner tools")
    .addSubcommand((s) =>
      s
        .setName("announce")
        .setDescription(
          "Create and send an announcement to all Discore servers.",
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
      return handleAnnounce(interaction);
    } else if (sub === "status") {
      await interaction.deferReply({ flags: 64 });
      return handleStatus(interaction);
    }
  },
};

// ── Announce: Open modal ─────────────────────────────────────────────────────

async function handleAnnounce(interaction) {
  const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    LabelBuilder,
    FileUploadBuilder,
  } = require("discord.js");

  const modal = new ModalBuilder()
    .setCustomId("bot:modal:announce")
    .setTitle("Create Global Announcement")
    .addComponents(
      // Title input
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Title")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(256)
          .setPlaceholder("📢 Announcement title..."),
      ),
      // Description
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(4000)
          .setPlaceholder(
            "Write your announcement here.\n\nUse blank lines to separate sections.",
          ),
      ),
      // Color
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("color")
          .setLabel("Embed Color (hex, optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(7)
          .setPlaceholder("#d4af37"),
      ),
      // Image upload
      new LabelBuilder()
        .setLabel("Image (optional)")
        .setDescription(
          "Upload a PNG, JPG, JPEG, GIF, or WEBP image. Max 8 MB.",
        )
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId("image_upload")
            .setRequired(false)
            .setMinValues(0)
            .setMaxValues(1),
        ),
    );

  return interaction.showModal(modal);
}

// ── Modal submit handler ──────────────────────────────────────────────────────

const ANNOUNCE_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];
const ANNOUNCE_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function handleAnnounceModalSubmit(interaction) {
  const title = interaction.fields.getTextInputValue("title").trim();
  const description = interaction.fields
    .getTextInputValue("description")
    .trim();
  const colorInput =
    interaction.fields.getTextInputValue("color")?.trim() || "";

  // Validate color
  let color = 0xd4af37; // default gold
  if (colorInput && /^#[0-9A-Fa-f]{6}$/.test(colorInput)) {
    color = parseInt(colorInput.replace("#", ""), 16);
  }

  // Get uploaded image (if any). If editing and no new file was uploaded,
  // keep whatever image was already set.
  const {
    get: getAnnounceState,
  } = require("../../../modules/events/wizardState");
  const existing = getAnnounceState(interaction.user.id, "announce");
  const attachment = interaction.fields
    .getUploadedFiles("image_upload")
    ?.first();

  let imageUrl = existing?.imageUrl || null;
  let imageName = existing?.imageName || null;
  let isImage = existing?.isImage || false;

  if (attachment) {
    const filename = (attachment.name || "upload").toLowerCase();
    const contentType = attachment.contentType || "";
    const validExt = [".png", ".jpg", ".jpeg", ".webp", ".gif"].some((ext) =>
      filename.endsWith(ext),
    );
    const validType = ANNOUNCE_IMAGE_TYPES.includes(contentType);

    if (!validExt && !validType) {
      return interaction.reply({
        content: "❌ Unsupported file type. Use PNG, JPG, JPEG, GIF, or WEBP.",
        flags: 64,
      });
    }
    if (attachment.size > ANNOUNCE_MAX_IMAGE_BYTES) {
      return interaction.reply({
        content: "❌ Image too large. Max 8 MB.",
        flags: 64,
      });
    }

    imageUrl = attachment.url;
    imageName = attachment.name || "image.png";
    isImage = true;
  }

  await interaction.deferReply({ flags: 64 });

  // Build preview embed
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setFooter({ text: "Discore Official • Global Announcement" })
    .setTimestamp();

  if (isImage && imageUrl) {
    embed.setImage(imageUrl);
  }

  // Store announcement data in a simple state for the buttons
  const { set } = require("../../../modules/events/wizardState");
  set(
    interaction.user.id,
    "announce",
    {
      title,
      description,
      color,
      imageUrl,
      imageName,
      isImage,
    },
    60 * 60 * 1000,
  ); // 1 hour TTL

  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
  } = require("discord.js");
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("bot:announce:send")
      .setLabel("📢 Send to All Servers")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("bot:announce:edit")
      .setLabel("✏️ Edit")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("bot:announce:cancel")
      .setLabel("❌ Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  return interaction.editReply({
    content:
      "## 📢 Announcement Preview\n_This is a preview. Click **Send to All Servers** to broadcast, or **Edit** to change._",
    embeds: [embed],
    components: [row],
  });
}

// ── Button: Send ──────────────────────────────────────────────────────────────

async function handleAnnounceSend(interaction) {
  const { get, del } = require("../../../modules/events/wizardState");
  const data = get(interaction.user.id, "announce");
  if (!data) {
    return interaction.update({
      content: "⚠️ Announcement data expired. Run /bot announce again.",
      embeds: [],
      components: [],
    });
  }

  const { title, description, color, imageUrl, isImage } = data;

  await interaction.deferReply({ flags: 64 });

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setFooter({ text: "Discore Official • Update Broadcast" })
    .setTimestamp();

  const guilds = [...interaction.client.guilds.cache.values()];
  let sent = 0,
    skipped = 0,
    failed = 0;
  const failedDetails = [];
  const missingChannelServers = [];

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
        missingChannelServers.push(g);
        continue;
      }

      const me = g.members.me;
      const perms = channel.permissionsFor(me);
      if (!perms?.has(["SendMessages", "EmbedLinks"])) {
        skipped++;
        continue;
      }

      if (isImage && imageUrl) {
        embed.setImage(imageUrl);
      }
      const payload = { embeds: [embed] };

      await channel.send(payload);
      sent++;
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      failed++;
      failedDetails.push({ guild: g.name, id: g.id, error: err.message });
    }
  }

  // Send setup instructions to servers missing announcement channels
  let setupSent = 0;
  for (const g of missingChannelServers) {
    try {
      const {
        findBestChannel,
      } = require("../../../modules/onboarding/service");
      const ch = findBestChannel(g);
      if (!ch || !ch.isTextBased()) continue;

      const me = g.members.me;
      const perms = ch.permissionsFor(me);
      if (!perms?.has(["SendMessages", "EmbedLinks"])) continue;

      const setupEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📢 Discore Announcement Channel Setup")
        .setDescription(
          [
            "**Your server does not have a dedicated announcement channel configured.**",
            "",
            "Discore sends important bot updates, feature announcements, and maintenance notices through a configured announcement channel.",
            "",
            "### 🛠️ How to set it up",
            "Use the **`/server channels`** command to assign an announcement channel, or simply create a channel named **`📢・discore-announcements`** and we'll use it automatically.",
            "",
            "This ensures you never miss important Discore updates!",
          ].join("\n"),
        )
        .setFooter({ text: "Discore Official • Server Setup" });

      await ch.send({ embeds: [setupEmbed] }).catch(() => {});
      setupSent++;
    } catch {}
  }

  del(interaction.user.id, "announce");

  const report = [
    `## 📢 Announcement Sent`,
    ``,
    `**Sent:** ${sent}`,
    `**Skipped:** ${skipped}`,
    `**Failed:** ${failed}`,
    setupSent > 0 ? `**Setup instructions sent to:** ${setupSent} servers` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (failedDetails.length > 0) {
    const details = failedDetails
      .slice(0, 5)
      .map((f) => `• **${f.guild}**: ${f.error}`)
      .join("\n");
    return interaction.editReply({
      content: report + "\n\n### Failures\n" + details,
    });
  }

  return interaction.editReply({ content: report, embeds: [], components: [] });
}

// ── Button: Edit ──────────────────────────────────────────────────────────────

async function handleAnnounceEdit(interaction) {
  const { get } = require("../../../modules/events/wizardState");
  const data = get(interaction.user.id, "announce");
  if (!data) {
    return interaction.update({
      content: "⚠️ Announcement data expired. Run /bot announce again.",
      embeds: [],
      components: [],
    });
  }

  const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    LabelBuilder,
    FileUploadBuilder,
  } = require("discord.js");

  const modal = new ModalBuilder()
    .setCustomId("bot:modal:announce")
    .setTitle("Edit Announcement")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Title")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(256)
          .setValue(data.title || ""),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(4000)
          .setValue(data.description || ""),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("color")
          .setLabel("Embed Color (hex)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(7)
          .setValue(
            "#" + (data.color?.toString(16).padStart(6, "0") || "d4af37"),
          ),
      ),
      new LabelBuilder()
        .setLabel("Image (optional)")
        .setDescription(
          data.imageUrl
            ? "Leave blank to keep the current image. Upload a new one to replace it."
            : "Upload a PNG, JPG, JPEG, GIF, or WEBP image. Max 8 MB.",
        )
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId("image_upload")
            .setRequired(false)
            .setMinValues(0)
            .setMaxValues(1),
        ),
    );

  return interaction.showModal(modal);
}

// ── Button: Cancel ────────────────────────────────────────────────────────────

async function handleAnnounceCancel(interaction) {
  const { del } = require("../../../modules/events/wizardState");
  del(interaction.user.id, "announce");
  return interaction.update({
    content: "✅ Announcement cancelled.",
    embeds: [],
    components: [],
  });
}

// ── handleStatus (unchanged) ──────────────────────────────────────────────────

async function handleStatus(interaction) {
  const client = interaction.client;
  const uptime = Math.floor(process.uptime());
  const uptimeH = Math.floor(uptime / 3600);
  const uptimeM = Math.floor((uptime % 3600) / 60);
  const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

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
    configChannels,
    totalGuildsDb,
    onboardedCount,
    topCmds24Rows,
    topSrv24Rows,
    avgCmdDuration,
    aiFailedAll,
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
        take: 5,
      })
      .catch(() => []),
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

  const imgGen24 = await prisma.botAiUsage
    .count({
      where: { createdAt: { gte: dayAgo }, requestType: "IMAGE_GENERATION" },
    })
    .catch(() => 0);
  const imgGenEnabled = await prisma.guildPremium
    .count({ where: { aiImageGenEnabled: true } })
    .catch(() => 0);

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
      {
        name: "🤖 AI Usage",
        value: [
          `24h: ${ai24} · 7d: ${ai7} · All: ${aiAll}`,
          `Success 24h: ${aiSuccess24} · Failed 24h: ${aiFailed24}`,
          `Failed all time: ${aiFailedAll}`,
        ].join("\n"),
        inline: false,
      },
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
      { name: "🤖 Top AI Servers 24h", value: topAiSrvStr, inline: false },
      { name: "⚠️ Alerts", value: alertsStr, inline: false },
    )
    .setTimestamp()
    .setFooter({ text: "Discore Official · Bot Analytics" });

  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
  } = require("discord.js");
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

// Export handlers for component loader
module.exports.handleAnnounceModalSubmit = handleAnnounceModalSubmit;
module.exports.handleAnnounceSend = handleAnnounceSend;
module.exports.handleAnnounceEdit = handleAnnounceEdit;
module.exports.handleAnnounceCancel = handleAnnounceCancel;
