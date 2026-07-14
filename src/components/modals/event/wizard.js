"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const wizardState = require("../../../modules/events/wizardState");
const prisma = require("../../../lib/prisma");

const STEPS = {
  TYPE: 1,
  BASIC_INFO: 2,
  TYPE_SETTINGS: 3,
  PINGS: 4,
  STYLE: 5,
  PREVIEW: 6,
};

const {
  buildStepEmbed,
  buildStepComponents,
} = require("../../../commands/public/event/event");

function getWizardData(interaction) {
  return (
    wizardState.get(interaction.user.id, interaction.guildId) || {
      step: STEPS.TYPE,
      eventType: "EVENT",
      title: null,
      when: null,
      description: null,
      location: null,
      game: null,
      teamSize: null,
      customTypeName: null,
      tagRoleIds: [],
      tagOnCreate: false,
      tagOnStart: false,
      reminderBeforeMinutes: null,
      deleteAfterHours: 168,
      color: null,
      thumbnailUrl: null,
      imageUrl: null,
    }
  );
}

function saveWizardData(interaction, data) {
  wizardState.set(interaction.user.id, interaction.guildId, data);
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

module.exports = [
  // ── Basic Info Modal ──────────────────────────────────────────────────
  {
    customIdPrefix: "event:modal:basic_info",
    async execute(interaction) {
      const title = interaction.fields.getTextInputValue("title").trim();
      const whenRaw = interaction.fields.getTextInputValue("when").trim();
      const description =
        interaction.fields.getTextInputValue("description")?.trim() || null;
      const location =
        interaction.fields.getTextInputValue("location")?.trim() || null;
      const game = interaction.fields.getTextInputValue("game")?.trim() || null;

      if (!title)
        return interaction.reply({
          content: "❌ Title cannot be empty.",
          flags: 64,
        });
      if (!whenRaw)
        return interaction.reply({
          content: "❌ Date/time cannot be empty.",
          flags: 64,
        });

      const data = getWizardData(interaction);
      data.title = title;
      data.description = description;
      data.location = location;
      data.game = game;
      data.when = new Date().toISOString(); // Store timestamp — actual parse happens on post/save
      saveWizardData(interaction, data);

      const embed = buildStepEmbed(STEPS.BASIC_INFO, data.eventType, data);
      const components = buildStepComponents(
        STEPS.BASIC_INFO,
        null,
        data.eventType,
        data,
      );
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Team Size Modal ───────────────────────────────────────────────────
  {
    customIdPrefix: "event:modal:teamsize",
    async execute(interaction) {
      const sizeStr = interaction.fields.getTextInputValue("size").trim();
      const size = parseInt(sizeStr, 10);
      if (isNaN(size) || size < 1 || size > 500) {
        return interaction.reply({
          content: "❌ Team size must be a number between 1 and 500.",
          flags: 64,
        });
      }

      const data = getWizardData(interaction);
      data.teamSize = size;
      saveWizardData(interaction, data);

      const embed = buildStepEmbed(STEPS.TYPE_SETTINGS, data.eventType, data);
      const components = buildStepComponents(
        STEPS.TYPE_SETTINGS,
        null,
        data.eventType,
        data,
      );
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Custom Type Modal ─────────────────────────────────────────────────
  {
    customIdPrefix: "event:modal:customtype",
    async execute(interaction) {
      const type = interaction.fields.getTextInputValue("type").trim();
      if (!type || type.length < 1) {
        return interaction.reply({
          content: "❌ Custom type cannot be empty.",
          flags: 64,
        });
      }

      const data = getWizardData(interaction);
      data.customTypeName = type;
      saveWizardData(interaction, data);

      const embed = buildStepEmbed(STEPS.TYPE_SETTINGS, data.eventType, data);
      const components = buildStepComponents(
        STEPS.TYPE_SETTINGS,
        null,
        data.eventType,
        data,
      );
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Thumbnail Upload Modal ────────────────────────────────────────────
  {
    customIdPrefix: "event:modal:upload_thumb",
    async execute(interaction) {
      const attachment =
        interaction.files?.first?.() ||
        (interaction.data?.resolved?.attachments &&
          Object.values(interaction.data.resolved.attachments)[0]);

      if (!attachment) {
        return interaction.reply({
          content:
            "❌ No file uploaded. Please upload a PNG, JPG, JPEG, GIF, or WEBP image.",
          flags: 64,
        });
      }

      const filename = (attachment.name || "upload").toLowerCase();
      const contentType = attachment.contentType || "";
      const validExt = [".png", ".jpg", ".jpeg", ".webp", ".gif"].some((ext) =>
        filename.endsWith(ext),
      );
      const validType = IMAGE_TYPES.includes(contentType);

      if (!validExt && !validType) {
        return interaction.reply({
          content:
            "❌ Unsupported file type. Use PNG, JPG, JPEG, GIF, or WEBP.",
          flags: 64,
        });
      }
      if (attachment.size > MAX_IMAGE_BYTES) {
        return interaction.reply({
          content: "❌ Image too large. Max 8 MB.",
          flags: 64,
        });
      }

      const data = getWizardData(interaction);
      data.thumbnailUrl = attachment.url;
      saveWizardData(interaction, data);

      await interaction.deferUpdate().catch(() => {});
      const embed = buildStepEmbed(STEPS.STYLE, data.eventType, data);
      const components = buildStepComponents(
        STEPS.STYLE,
        null,
        data.eventType,
        data,
      );
      return interaction.editReply({ embeds: [embed], components });
    },
  },

  // ── Banner Upload Modal ───────────────────────────────────────────────
  {
    customIdPrefix: "event:modal:upload_banner",
    async execute(interaction) {
      const attachment =
        interaction.files?.first?.() ||
        (interaction.data?.resolved?.attachments &&
          Object.values(interaction.data.resolved.attachments)[0]);

      if (!attachment) {
        return interaction.reply({
          content:
            "❌ No file uploaded. Please upload a PNG, JPG, JPEG, GIF, or WEBP image.",
          flags: 64,
        });
      }

      const filename = (attachment.name || "upload").toLowerCase();
      const contentType = attachment.contentType || "";
      const validExt = [".png", ".jpg", ".jpeg", ".webp", ".gif"].some((ext) =>
        filename.endsWith(ext),
      );
      const validType = IMAGE_TYPES.includes(contentType);

      if (!validExt && !validType) {
        return interaction.reply({
          content:
            "❌ Unsupported file type. Use PNG, JPG, JPEG, GIF, or WEBP.",
          flags: 64,
        });
      }
      if (attachment.size > MAX_IMAGE_BYTES) {
        return interaction.reply({
          content: "❌ Image too large. Max 8 MB.",
          flags: 64,
        });
      }

      const data = getWizardData(interaction);
      data.imageUrl = attachment.url;
      saveWizardData(interaction, data);

      await interaction.deferUpdate().catch(() => {});
      const embed = buildStepEmbed(STEPS.STYLE, data.eventType, data);
      const components = buildStepComponents(
        STEPS.STYLE,
        null,
        data.eventType,
        data,
      );
      return interaction.editReply({ embeds: [embed], components });
    },
  },
];
