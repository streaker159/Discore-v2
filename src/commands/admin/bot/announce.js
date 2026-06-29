"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const { requireBotOwner } = require("../../../lib/ownerGuard");

const guild = {
  scope: "PUBLIC",
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

async function handleAnnounce(interaction) {
  const title = interaction.options.getString("title", true);
  const description = interaction.options.getString("description", true);
  const imageAttachment = interaction.options.getAttachment("image");
  const pingRole = interaction.options.getBoolean("ping_role") ?? false;
  const dryRun = interaction.options.getBoolean("dry_run") ?? true;
  const serverId = interaction.options.getString("server_id");

  // Validate image
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

  // Build reply payload
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

  // Get target guilds
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
      // Find announcement channel
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

      // Check perms
      const me = g.members.me;
      const perms = channel.permissionsFor(me);
      if (!perms?.has(["SendMessages", "EmbedLinks"])) {
        skipped++;
        continue;
      }

      // Prepare ping
      let content = "";
      if (pingRole) {
        const role = g.roles.cache.find((r) => r.name === "Discore Official");
        if (role && role.mentionable) {
          content = `${role} `;
        }
      }

      const serverPayload = { content: content || undefined, embeds: [embed] };
      if (payload.files) {
        // Re-fetch image for each server (buffer consumed)
        const response = await fetch(imageAttachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        serverPayload.files = [
          new AttachmentBuilder(buffer, { name: imageAttachment.name }),
        ];
      }

      await channel.send(serverPayload);
      sent++;
      // Rate limit safety
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

async function handleStatus(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const client = interaction.client;
  const uptime = Math.floor(process.uptime());
  const hours = Math.floor(uptime / 3600);
  const mins = Math.floor((uptime % 3600) / 60);

  const totalGuilds = client.guilds.cache.size;
  let totalMembers = 0;
  for (const [, g] of client.guilds.cache) {
    totalMembers += g.memberCount ?? 0;
  }

  const now = new Date();
  const dayAgo = new Date(now - 24 * 3600 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 3600 * 1000);

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
    prisma.scoreboard.count({ where: { isArchived: false } }).catch(() => 0),
    prisma.scoreboard.count().catch(() => 0),
    prisma.scoreboard.count({ where: { isArchived: true } }).catch(() => 0),
    prisma.guildPremium
      .count({
        where: { tier: { not: "FREE" }, expiresAt: { gte: new Date() } },
      })
      .catch(() => 0),
    prisma.guildPremium
      .count({
        where: { tier: { not: "FREE" }, expiresAt: { lt: new Date() } },
      })
      .catch(() => 0),
  ]);

  const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

  const embed = new EmbedBuilder()
    .setTitle("📊 Discore Official · Live Status")
    .setColor(0x5865f2)
    .addFields(
      { name: "🖥️ Servers", value: String(totalGuilds), inline: true },
      { name: "👥 Members", value: String(totalMembers), inline: true },
      { name: "⬆️ Uptime", value: `${hours}h ${mins}m`, inline: true },
      { name: "💾 Memory", value: `${memMB} MB`, inline: true },
      { name: "Node", value: process.version, inline: true },
      { name: "", value: "" },
      {
        name: "📊 Commands (24h / 7d / All)",
        value: `${cmds24} / ${cmds7} / ${cmdsAll}`,
        inline: false,
      },
      {
        name: "🤖 AI Requests (24h / 7d / All)",
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
    )
    .setTimestamp()
    .setFooter({ text: "Discore Official · Bot Analytics" });

  return interaction.editReply({ embeds: [embed] });
}

module.exports = guild;
