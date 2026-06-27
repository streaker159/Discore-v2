"use strict";

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const prisma = require("../../../lib/prisma");
const roleTracking = require("../../../modules/roleTracking/service");

function ratio(wins, losses) {
  if (!losses) return wins ? wins.toFixed(2) : "0.00";
  return (wins / losses).toFixed(2);
}

async function getRoleScoreboardEntries(guildId, roleId) {
  return prisma.scoreboardEntry.findMany({
    where: {
      targetId: roleId,
      targetType: "ROLE",
      scoreboard: { guildId },
    },
    include: { scoreboard: true },
    orderBy: { updatedAt: "desc" },
  });
}

function buildScoreboardsText(entries) {
  if (!entries.length) return "_No scoreboard entries found for this role._";

  return entries
    .map((entry) => {
      const boardName = entry.scoreboard.liveTitle || entry.scoreboard.name;
      const archiveStatus = entry.scoreboard.isArchived ? " (📦 Archived)" : "";

      if (entry.scoreboard.metric === "POINTS") {
        return `• **${boardName}**${archiveStatus}: \` 💯 ${entry.points} pts \``;
      }

      const r = ratio(entry.wins, entry.losses);
      return `• **${boardName}**${archiveStatus}: \` 🏆 ${entry.wins}W / ${entry.losses}L \` (Ratio: \`${r}\`)`;
    })
    .join("\n");
}

async function getMemberContributions(guildId, roleId, memberIds) {
  if (!memberIds.length) return {};

  const rows = await prisma.userRoleScore.findMany({
    where: {
      guildId,
      roleId,
      userId: { in: memberIds },
    },
  });

  const contributions = {};
  for (const row of rows) {
    if (!contributions[row.userId]) {
      contributions[row.userId] = { wins: 0, losses: 0, points: 0 };
    }
    contributions[row.userId].wins += row.wins || 0;
    contributions[row.userId].losses += row.losses || 0;
    contributions[row.userId].points += row.points || 0;
  }
  return contributions;
}

function buildMemberList(memberIds, contributions) {
  if (!memberIds.length) return ["_No members currently in this role._"];

  const lines = memberIds.slice(0, 25).map((userId) => {
    const c = contributions[userId] || { wins: 0, losses: 0, points: 0 };
    const hasStats = c.wins > 0 || c.losses > 0 || c.points > 0;
    const scoreText = hasStats
      ? ` — \`${c.wins}W / ${c.losses}L\` · \`${c.points} pts\``
      : " — `no recorded score yet`";
    return `• <@${userId}>${scoreText}`;
  });

  if (memberIds.length > 25) {
    lines.push(`*...and ${memberIds.length - 25} more member(s)*`);
  }

  return lines;
}

module.exports = {
  scope: "PUBLIC",

  data: new SlashCommandBuilder()
    .setName("role")
    .setDescription("Role information and scores.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("score")
        .setDescription("View the score of a role and the members inside it.")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to view scores for")
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== "score") return;

    await interaction.deferReply();

    try {
      const role = interaction.options.getRole("role", true);

      // 1. Get scoreboard entries for this role
      const entries = await getRoleScoreboardEntries(
        interaction.guildId,
        role.id,
      );

      // 2. Get current members from tracked table (populated by score updates + guildMemberUpdate events)
      //    Merged with Discord's role.members cache as fallback
      const trackedRows = await roleTracking.getTrackedRoleMembers(
        interaction.guildId,
        role.id,
      );
      const memberSet = new Set();
      for (const row of trackedRows || []) {
        if (row.userId) memberSet.add(row.userId);
      }
      // Fallback: add cached members that the tracked table might not have yet
      if (role.members?.size) {
        for (const [id] of role.members) memberSet.add(id);
      }
      const memberIds = Array.from(memberSet);

      // 3. Get each member's contributions to this role's scores
      const contributions = await getMemberContributions(
        interaction.guildId,
        role.id,
        memberIds,
      );

      // 4. Build the embed
      const embed = new EmbedBuilder()
        .setTitle(`📊 Role Score Summary — ${role.name}`)
        .setColor(role.color || 0x1a7a9e)
        .setTimestamp();

      const guildIconUrl = interaction.guild.iconURL({
        size: 128,
        extension: "png",
      });
      if (guildIconUrl) embed.setThumbnail(guildIconUrl);

      embed.setDescription(
        [
          "👥 **Role Details**",
          `• **Mention:** <@&${role.id}>`,
          `• **Current Members:** \`${memberIds.length}\``,
          "",
          "🏆 **Scoreboard Standings**",
          buildScoreboardsText(entries),
        ].join("\n"),
      );

      embed.addFields({
        name: "👥 Current Members",
        value: buildMemberList(memberIds, contributions).join("\n"),
        inline: false,
      });

      embed.setFooter({
        text: "No full-server fetch — tracked table + cached members (GuildMembers intent)",
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Role Score Error]", error);
      return interaction.editReply({
        content: `⚠️ Error retrieving role score: ${error.message}`,
      });
    }
  },
};
