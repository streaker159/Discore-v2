"use strict";

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const { requireBotOwner } = require("../../../lib/ownerGuard");

function isOwner(interaction) {
  const owners = (process.env.BOT_OWNER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return owners.includes(interaction.user.id);
}

module.exports = [
  // ── Server Lookup ──────────────────────────────────────────────────────
  {
    customIdPrefix: "analytics:server_lookup:",
    async execute(interaction) {
      if (!isOwner(interaction)) {
        return interaction.reply({
          content: "🚫 Bot owner only.",
          flags: 64,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId("analytics_server_lookup_modal:")
        .setTitle("Server Lookup");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("serverId")
            .setLabel("Server ID to look up")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );

      return interaction.showModal(modal);
    },
  },

  // ── Server Lookup Modal Submit ──────────────────────────────────────────
  {
    customIdPrefix: "analytics_server_lookup_modal:",
    async execute(interaction) {
      if (!isOwner(interaction)) {
        return interaction.reply({
          content: "🚫 Bot owner only.",
          flags: 64,
        });
      }

      await interaction.deferReply({ flags: 64 });
      const serverId = interaction.fields.getTextInputValue("serverId").trim();

      const guild = interaction.client.guilds.cache.get(serverId);
      const dbGuild = await prisma.guild
        .findUnique({ where: { id: serverId } })
        .catch(() => null);
      const premium = await prisma.guildPremium
        .findUnique({ where: { guildId: serverId } })
        .catch(() => null);
      const scoreboards = await prisma.scoreboard
        .findMany({
          where: { guildId: serverId },
          select: {
            name: true,
            isArchived: true,
            _count: { select: { entries: true } },
          },
          orderBy: { name: "asc" },
        })
        .catch(() => []);

      if (!guild && !dbGuild) {
        return interaction.editReply({
          content: `⚠️ Server **${serverId}** not found.`,
        });
      }

      const activeBoards = scoreboards.filter((s) => !s.isArchived);
      const archivedBoards = scoreboards.filter((s) => s.isArchived);

      const embed = new EmbedBuilder()
        .setTitle(
          `🔍 Server Lookup: ${guild?.name || dbGuild?.allianceName || serverId}`,
        )
        .setColor(0x5865f2)
        .addFields(
          {
            name: "Server ID",
            value: serverId,
            inline: true,
          },
          {
            name: "Members",
            value: guild?.memberCount?.toLocaleString() || "N/A",
            inline: true,
          },
          {
            name: "Owner",
            value: guild?.ownerId ? `<@${guild.ownerId}>` : "N/A",
            inline: true,
          },
          {
            name: "Alliance Code",
            value: dbGuild?.allianceCode || "Not set",
            inline: true,
          },
          {
            name: "Default Game",
            value: dbGuild?.defaultGame || "Not set",
            inline: true,
          },
          {
            name: "Premium",
            value: premium?.tier || "FREE",
            inline: true,
          },
          {
            name: "AI Credits",
            value: premium
              ? `${(premium.monthlyAiAllowance || 0) - (premium.monthlyAiUsed || 0) + (premium.extraAiCredits || 0)} remaining`
              : "Not configured",
            inline: true,
          },
          {
            name: `Scoreboards (${scoreboards.length})`,
            value:
              `Active: ${activeBoards.length} · Archived: ${archivedBoards.length}\n` +
                scoreboards
                  .slice(0, 10)
                  .map(
                    (s) =>
                      `• ${s.name} (${s.isArchived ? "📦" : "🟢"} · ${s._count.entries} entries)`,
                  )
                  .join("\n") || "None",
            inline: false,
          },
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    },
  },

  // ── Export All Servers ──────────────────────────────────────────────────
  {
    customIdPrefix: "analytics:export_all:",
    async execute(interaction) {
      if (!isOwner(interaction)) {
        return interaction.reply({
          content: "🚫 Bot owner only.",
          flags: 64,
        });
      }

      await interaction.deferReply({ flags: 64 });

      const client = interaction.client;
      const now = new Date();
      const dayAgo = new Date(now - 24 * 3600 * 1000);

      // Fetch all guilds from DB
      const allGuilds = await prisma.guild
        .findMany({
          include: {
            premium: {
              select: {
                tier: true,
                expiresAt: true,
                monthlyAiAllowance: true,
                monthlyAiUsed: true,
                extraAiCredits: true,
                aiEnabled: true,
                aiTranslationEnabled: true,
                aiWelcomeEnabled: true,
                aiImageGenEnabled: true,
              },
            },
            scoreboards: {
              where: { isArchived: false },
              select: { id: true },
            },
            _count: {
              select: {
                moderationCases: true,
                events: true,
                suggestions: true,
              },
            },
          },
          orderBy: { allianceName: { sort: "asc", nulls: "last" } },
        })
        .catch(() => []);

      // Fetch 24h usage per guild
      const cmdUsage = await prisma.botCommandUsage
        .groupBy({
          by: ["guildId"],
          where: { createdAt: { gte: dayAgo } },
          _count: { guildId: true },
        })
        .catch(() => []);
      const aiUsage = await prisma.botAiUsage
        .groupBy({
          by: ["guildId"],
          where: { createdAt: { gte: dayAgo } },
          _sum: { creditsUsed: true },
          _count: { id: true },
        })
        .catch(() => []);

      const cmdMap = new Map(
        cmdUsage.map((r) => [r.guildId, r._count.guildId]),
      );
      const aiMap = new Map(
        aiUsage.map((r) => [
          r.guildId,
          { count: r._count.id, credits: r._sum.creditsUsed || 0 },
        ]),
      );

      const lines = [];
      lines.push("=".repeat(70));
      lines.push("  DISCORE OFFICIAL · ALL SERVERS EXPORT");
      lines.push("=".repeat(70));
      lines.push(
        `Exported by: ${interaction.user.tag} (${interaction.user.id})`,
      );
      lines.push(`Date: ${now.toISOString()}`);
      lines.push(`Total DB Guilds: ${allGuilds.length}`);
      lines.push(`Total Cached Guilds: ${client.guilds.cache.size}`);
      lines.push("");

      // Summary counts
      const premiumCount = allGuilds.filter(
        (g) => g.premium?.tier && g.premium.tier !== "FREE",
      ).length;
      const aiEnabledCount = allGuilds.filter(
        (g) => g.premium?.aiEnabled !== false,
      ).length;
      const imgGenEnabledCount = allGuilds.filter(
        (g) => g.premium?.aiImageGenEnabled,
      ).length;
      const totalScoreboards = allGuilds.reduce(
        (s, g) => s + (g.scoreboards?.length || 0),
        0,
      );
      const totalMembers = client.guilds.cache.reduce(
        (s, g) => s + (g.memberCount ?? 0),
        0,
      );

      lines.push("─── Summary ───");
      lines.push(`Premium servers: ${premiumCount}`);
      lines.push(`AI enabled: ${aiEnabledCount}`);
      lines.push(`Image gen enabled: ${imgGenEnabledCount}`);
      lines.push(`Total active scoreboards: ${totalScoreboards}`);
      lines.push(`Total cached members: ${totalMembers.toLocaleString()}`);
      lines.push("");

      lines.push("─── Server Details ───");
      lines.push("");

      for (const g of allGuilds) {
        const cachedGuild = client.guilds.cache.get(g.id);
        const p = g.premium;
        const cmds24 = cmdMap.get(g.id) || 0;
        const ai24 = aiMap.get(g.id);
        const tier = p?.tier || "FREE";

        lines.push(`${g.allianceName || g.id}`);
        lines.push(`  ID: ${g.id}`);
        lines.push(
          `  Members: ${cachedGuild?.memberCount?.toLocaleString() || "N/A"}`,
        );
        lines.push(`  Alliance Code: ${g.allianceCode || "Not set"}`);
        lines.push(`  Default Game: ${g.defaultGame || "Not set"}`);
        lines.push(`  Tier: ${tier}`);
        if (p?.tier && p.tier !== "FREE") {
          lines.push(
            `  Premium Expires: ${p.expiresAt?.toISOString() || "Lifetime"}`,
          );
        }
        lines.push(`  AI: ${p?.aiEnabled !== false ? "On" : "Off"}`);
        lines.push(
          `  AI Translation: ${p?.aiTranslationEnabled ? "On" : "Off"}`,
        );
        lines.push(`  AI Welcome: ${p?.aiWelcomeEnabled ? "On" : "Off"}`);
        lines.push(`  AI Image Gen: ${p?.aiImageGenEnabled ? "On" : "Off"}`);
        const aiRemaining = p
          ? (p.monthlyAiAllowance || 0) -
            (p.monthlyAiUsed || 0) +
            (p.extraAiCredits || 0)
          : 0;
        lines.push(`  AI Credits Remaining: ${aiRemaining}`);
        lines.push(`  Scoreboards: ${g.scoreboards?.length || 0}`);
        lines.push(`  Moderation Cases: ${g._count?.moderationCases || 0}`);
        lines.push(`  Events: ${g._count?.events || 0}`);
        lines.push(`  Suggestions: ${g._count?.suggestions || 0}`);
        lines.push(`  24h Commands: ${cmds24}`);
        lines.push(
          `  24h AI: ${ai24?.count || 0} requests · ${ai24?.credits || 0} credits`,
        );
        lines.push("");
      }

      lines.push("=".repeat(70));
      lines.push("  END OF EXPORT");
      lines.push("=".repeat(70));

      const buffer = Buffer.from(lines.join("\n"), "utf-8");
      const filename = `discore-all-servers-${Date.now()}.txt`;

      try {
        // Send large files as DM since ephemeral messages don't support attachments
        await interaction.user.send({
          content: `📊 **All Servers Export**`,
          files: [{ attachment: buffer, name: filename }],
        });

        return interaction.editReply({
          content: `✅ Export sent to your DMs! **${allGuilds.length}** servers exported.`,
        });
      } catch {
        return interaction.editReply({
          content: `⚠️ Could not DM you. Please enable DMs from server members. Export size: ${allGuilds.length} servers.`,
        });
      }
    },
  },
];
