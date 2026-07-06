"use strict";

const prisma = require("../../../lib/prisma");
const { isBotOwner } = require("../../../lib/ownerGuard");
const {
  hasModPermissions,
} = require("../../../modules/moderation/utils/permissions");

module.exports = {
  customIdPrefix: "case:transcript:",

  async execute(interaction) {
    const transcriptId = interaction.customId.split(":")[2];
    if (!transcriptId) {
      return interaction.reply({
        content: "Invalid transcript ID.",
        flags: 64,
      });
    }

    // Defer since PDF/txt generation may take time
    await interaction.deferReply({ flags: 64 });

    const transcript = await prisma.moderationCaseTranscript
      .findUnique({
        where: { id: transcriptId },
      })
      .catch(() => null);

    if (!transcript) {
      return interaction.editReply({
        content: "Transcript could not be found.",
      });
    }

    // Permission check
    if (transcript.guildId) {
      const guild = interaction.guild;
      if (guild && guild.id !== transcript.guildId) {
        return interaction.editReply({
          content: "🔒 You do not have permission to view this transcript.",
        });
      }
      const dbGuild = await prisma.guild
        .findUnique({ where: { id: transcript.guildId } })
        .catch(() => null);
      if (
        !isBotOwner(interaction.user.id) &&
        !hasModPermissions(interaction.member, dbGuild)
      ) {
        return interaction.editReply({
          content: "🔒 You do not have permission to view this transcript.",
        });
      }
    }

    try {
      // Try PDF generation first, fall back to TXT
      const {
        generateTranscriptPdf,
      } = require("../../../modules/moderation/services/transcriptPdf");
      const buffer = await generateTranscriptPdf(transcript);
      const appealNum = transcript.appealNumber || "transcript";
      await interaction.editReply({
        content: `📄 Transcript for **${appealNum}**`,
        files: [
          { attachment: buffer, name: `Discore-Transcript-${appealNum}.txt` },
        ],
      });
    } catch (pdfErr) {
      console.error(
        "[Transcript] Generation failed, sending raw text:",
        pdfErr.message,
      );
      // TXT fallback
      const txt = (
        transcript.transcriptText ||
        transcript.transcriptJson ||
        "No transcript content available"
      ).slice(0, 500000);
      const buffer = Buffer.from(txt, "utf-8");
      const appealNum = transcript.appealNumber || "transcript";
      await interaction.editReply({
        content: `📄 Transcript for **${appealNum}**`,
        files: [
          { attachment: buffer, name: `Discore-Transcript-${appealNum}.txt` },
        ],
      });
    }
  },
};
