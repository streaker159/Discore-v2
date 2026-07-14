"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const wizardState = require("../../../modules/suggestions/wizardState");
const {
  getSuggestion,
  updateSuggestionByPublicId,
  setSuggestionStatus,
  isAdminOrManager,
  getGuildSuggestionSettings,
  buildSuggestionEmbed,
  buildSuggestionButtons,
  tryUpdatePublicEmbed,
  STALE_MESSAGE,
} = require("../../../modules/suggestions/service");
const {
  buildWizardStepEmbed,
  buildWizardStepComponents,
  WIZARD_STEPS,
} = require("../../../commands/public/suggestion/suggestion");

const IMAGE_MAX_MB = parseInt(process.env.SUGGESTION_IMAGE_MAX_MB || "5", 10);
const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpg",
  "image/jpeg",
  "image/webp",
];

function getWizardData(interaction) {
  return wizardState.get(interaction.user.id, interaction.guildId);
}

module.exports = [
  // ═══════════════════════════════════════════════════════════════════════
  // Wizard: Details Modal
  // ═══════════════════════════════════════════════════════════════════════

  {
    customId: "sug:modal:wiz_details",
    async execute(interaction) {
      const data = getWizardData(interaction);
      if (!data)
        return interaction.reply({
          content: "Session expired. Start again with /suggestion.",
          flags: 64,
        });

      data.title = interaction.fields.getTextInputValue("title");
      data.content = interaction.fields.getTextInputValue("content");
      wizardState.set(interaction.user.id, interaction.guildId, data);

      const embed = buildWizardStepEmbed(WIZARD_STEPS.DETAILS, data);
      const components = buildWizardStepComponents(WIZARD_STEPS.DETAILS, data);
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Wizard: Duration Modal
  // ═══════════════════════════════════════════════════════════════════════

  {
    customId: "sug:modal:wiz_duration",
    async execute(interaction) {
      const data = getWizardData(interaction);
      if (!data)
        return interaction.reply({
          content: "Session expired.",
          flags: 64,
        });

      const duration = interaction.fields.getTextInputValue("duration");
      const { parseDuration } = require("../../../modules/suggestions/service");
      const parsed = parseDuration(duration);
      if (parsed.error) {
        return interaction.reply({
          content: `⚠️ ${parsed.error}`,
          flags: 64,
        });
      }

      data.duration = duration;
      wizardState.set(interaction.user.id, interaction.guildId, data);

      const embed = buildWizardStepEmbed(WIZARD_STEPS.OPTIONS, data);
      const components = buildWizardStepComponents(WIZARD_STEPS.OPTIONS, data);
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Image Upload Modal
  // ═══════════════════════════════════════════════════════════════════════

  {
    customId: "sug:modal:upload_image",
    async execute(interaction) {
      const data = getWizardData(interaction);
      if (!data)
        return interaction.reply({
          content: "Session expired.",
          flags: 64,
        });

      const attachment = interaction.fields
        .getUploadedFiles("suggestion_image_upload")
        ?.first();

      if (!attachment) {
        return interaction.reply({
          content:
            "⚠️ No image received. Please upload a PNG, JPG, JPEG, or WEBP image.",
          flags: 64,
        });
      }

      const filename = (attachment.name || "upload").toLowerCase();
      const contentType = attachment.contentType || "";
      const validExt = [".png", ".jpg", ".jpeg", ".webp"].some((ext) =>
        filename.endsWith(ext),
      );
      const validType = ALLOWED_IMAGE_TYPES.includes(contentType);

      if (!validExt && !validType) {
        return interaction.reply({
          content: "⚠️ Unsupported file type. Use PNG, JPG, JPEG, or WEBP.",
          flags: 64,
        });
      }
      if (attachment.size > IMAGE_MAX_MB * 1024 * 1024) {
        return interaction.reply({
          content: `⚠️ Image too large. Maximum size is ${IMAGE_MAX_MB} MB.`,
          flags: 64,
        });
      }

      data.imageUrl = attachment.url;
      wizardState.set(interaction.user.id, interaction.guildId, data);

      const embed = buildWizardStepEmbed(WIZARD_STEPS.IMAGE, data);
      const components = buildWizardStepComponents(WIZARD_STEPS.IMAGE, data);
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Edit Suggestion Modal
  // ═══════════════════════════════════════════════════════════════════════

  {
    customIdPrefix: "sug:modal:edit:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[3];
      const suggestion = await getSuggestion(publicId);
      if (!suggestion)
        return interaction.reply({ content: STALE_MESSAGE, flags: 64 });
      if (suggestion.authorId !== interaction.user.id)
        return interaction.reply({
          content: "🚫 Only the original author can edit this suggestion.",
          flags: 64,
        });

      const title = interaction.fields.getTextInputValue("title");
      const content = interaction.fields.getTextInputValue("content");

      await updateSuggestionByPublicId(publicId, { title, content });
      const updated = await getSuggestion(publicId);
      const embed = await buildSuggestionEmbed(updated);
      const components = buildSuggestionButtons(updated);

      // Update public embed
      await tryUpdatePublicEmbed(interaction.client, updated);

      return interaction.update({ embeds: [embed], components });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Deny Reason Modal
  // ═══════════════════════════════════════════════════════════════════════

  {
    customIdPrefix: "sug:modal:deny_reason:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[3];
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const reason = interaction.fields.getTextInputValue("reason") || null;

      await setSuggestionStatus(publicId, "DENIED", interaction.user.id);
      if (reason) {
        await prisma.suggestion.update({
          where: { publicId },
          data: { adminNote: reason },
        });
      }

      const updated = await getSuggestion(publicId);
      const embed = await buildSuggestionEmbed(updated);
      const components = buildSuggestionButtons(updated);

      // Update public embed
      await tryUpdatePublicEmbed(interaction.client, updated);

      // Status update in thread
      if (updated.threadId) {
        try {
          const thread = await interaction.client.channels
            .fetch(updated.threadId)
            .catch(() => null);
          if (thread?.isThread?.()) {
            const reasonText = reason ? `\n📝 Reason: ${reason}` : "";
            await thread
              .send({
                content: `❌ Suggestion denied by ${interaction.user}.${reasonText}`,
              })
              .catch(() => {});
          }
        } catch {}
      }

      return interaction.update({ embeds: [embed], components });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Admin: Set Default Duration Modal
  // ═══════════════════════════════════════════════════════════════════════

  {
    customId: "sug:modal:admin_duration",
    async execute(interaction) {
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const daysStr = interaction.fields.getTextInputValue("days");
      const days = parseInt(daysStr, 10);

      if (isNaN(days) || days < 1 || days > 30) {
        return interaction.reply({
          content: "⚠️ Please enter a number between 1 and 30.",
          flags: 64,
        });
      }

      await prisma.guild.update({
        where: { id: interaction.guildId },
        data: { suggestionDefaultDuration: days },
      });

      return interaction.reply({
        content: `✅ Default suggestion duration set to **${days} days**.`,
        flags: 64,
      });
    },
  },
];
