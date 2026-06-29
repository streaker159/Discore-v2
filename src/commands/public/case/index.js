"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const {
  hasModPermissions,
} = require("../../../modules/moderation/utils/permissions");
const { isBotOwner } = require("../../../lib/ownerGuard");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("case")
    .setDescription("View moderation case details and transcripts")
    .addSubcommand((s) =>
      s
        .setName("view")
        .setDescription("View a moderation case by number")
        .addStringOption((o) =>
          o
            .setName("case_number")
            .setDescription("Case number (e.g. APP-006 or MOD-001)")
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "view") {
      await handleView(interaction);
    }
  },
};

async function checkPerms(interaction, guildId) {
  if (isBotOwner(interaction.user.id)) return true;
  const dbGuild = await prisma.guild
    .findUnique({ where: { id: guildId } })
    .catch(() => null);
  return hasModPermissions(interaction.member, dbGuild);
}

async function handleView(interaction) {
  const caseNumber = interaction.options.getString("case_number", true).trim();

  // Try to find transcript by appeal number first
  let transcript = await prisma.moderationCaseTranscript
    .findFirst({
      where: { appealNumber: { equals: caseNumber, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => null);

  // Then try by case number
  if (!transcript) {
    transcript = await prisma.moderationCaseTranscript
      .findFirst({
        where: { caseNumber: { equals: caseNumber, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
      })
      .catch(() => null);
  }

  // Also try to find original moderation case
  const modCase = await prisma.moderationCase
    .findUnique({
      where: { publicId: caseNumber },
    })
    .catch(() => null);

  if (!transcript && !modCase) {
    return interaction.reply({
      content: `❌ No case or transcript found for **${caseNumber}**.`,
      ephemeral: true,
    });
  }

  // Permission check
  const guildId = transcript?.guildId || modCase?.guildId;
  if (guildId && !(await checkPerms(interaction, guildId))) {
    return interaction.reply({
      content: "🔒 You do not have permission to view case transcripts.",
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`📋 Case: ${caseNumber}`)
    .setColor(0x5865f2)
    .setTimestamp();

  const fields = [];

  if (transcript) {
    fields.push(
      {
        name: "Appeal Number",
        value: transcript.appealNumber || "N/A",
        inline: true,
      },
      {
        name: "Case Number",
        value: transcript.caseNumber || "N/A",
        inline: true,
      },
      { name: "Outcome", value: transcript.outcome || "Unknown", inline: true },
      {
        name: "Ticket Channel",
        value: transcript.ticketChannelName || "N/A",
        inline: true,
      },
      { name: "User ID", value: transcript.userId || "Unknown", inline: true },
      {
        name: "Handled By",
        value: transcript.handledById
          ? `<@${transcript.handledById}>`
          : "Unknown",
        inline: true,
      },
      {
        name: "Opened",
        value: transcript.openedAt
          ? new Date(transcript.openedAt).toLocaleString()
          : "N/A",
        inline: true,
      },
      {
        name: "Closed",
        value: transcript.closedAt
          ? new Date(transcript.closedAt).toLocaleString()
          : "N/A",
        inline: true,
      },
      {
        name: "Messages",
        value: String(transcript.messageCount),
        inline: true,
      },
    );

    // Transcript download button
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`case:transcript:${transcript.id}`)
        .setLabel("📄 Download Transcript")
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.reply({
      embeds: [embed.setFields(fields)],
      components: [row],
      ephemeral: true,
    });
  } else if (modCase) {
    fields.push(
      { name: "User", value: `<@${modCase.userId}>`, inline: true },
      { name: "Action", value: modCase.actionType, inline: true },
      { name: "Status", value: modCase.status, inline: true },
      {
        name: "Appeal Status",
        value: modCase.appealStatus || "NONE",
        inline: true,
      },
      {
        name: "Reason",
        value: modCase.reason?.slice(0, 500) || "N/A",
        inline: false,
      },
      {
        name: "Created",
        value: modCase.createdAt
          ? new Date(modCase.createdAt).toLocaleString()
          : "N/A",
        inline: true,
      },
    );

    await interaction.reply({
      embeds: [
        embed
          .setFields(fields)
          .setFooter({ text: "Transcript: Not saved for this case" }),
      ],
      ephemeral: true,
    });
  }
}
