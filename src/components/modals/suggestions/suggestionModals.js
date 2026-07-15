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
  countVotes,
  STATUS_LABELS,
  CATEGORY_LABELS,
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

  // ═══════════════════════════════════════════════════════════════════════
  // Admin: Search Suggestions Modal
  // ═══════════════════════════════════════════════════════════════════════

  {
    customId: "sug:modal:admin_search",
    async execute(interaction) {
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const query = interaction.fields
        .getTextInputValue("query")
        .trim()
        .toUpperCase();

      // Search by publicId exact match first
      let suggestion = await getSuggestion(query);
      if (!suggestion) {
        // Search by title/content partial match
        const matches = await prisma.suggestion.findMany({
          where: {
            guildId: interaction.guildId,
            status: { not: "DELETED" },
            publicId: { not: null },
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { content: { contains: query, mode: "insensitive" } },
            ],
          },
          take: 5,
          include: { votes: true },
        });

        if (!matches.length) {
          return interaction.reply({
            content: `🔍 No suggestions found matching \`${query}\`.`,
            flags: 64,
          });
        }

        if (matches.length === 1) {
          suggestion = matches[0];
        } else {
          // Multiple matches — show a select menu
          const {
            StringSelectMenuBuilder,
            StringSelectMenuOptionBuilder,
            EmbedBuilder,
            ActionRowBuilder,
          } = require("discord.js");

          const embed = new EmbedBuilder()
            .setColor(0xf39c12)
            .setTitle(`🔍 Search Results — "${query}"`)
            .setDescription(
              matches
                .map(
                  (s) =>
                    `**${s.publicId}** — ${s.title || s.content.slice(0, 60)}`,
                )
                .join("\n"),
            )
            .setFooter({ text: "Select a suggestion below to manage it." });

          const options = matches.map((s) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(`${s.publicId}: ${(s.title || s.content).slice(0, 50)}`)
              .setValue(s.publicId)
              .setDescription(`${STATUS_LABELS[s.status] || s.status}`),
          );

          const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("sug:admin_select:suggestion")
              .setPlaceholder("Select a suggestion...")
              .addOptions(options),
          );

          return interaction.reply({
            embeds: [embed],
            components: [row],
            flags: 64,
          });
        }
      }

      // Single result — show action panel
      const v = countVotes(suggestion);
      const embed = new (require("discord.js").EmbedBuilder)()
        .setColor(0xf39c12)
        .setTitle(`🔧 Admin Settings — ${suggestion.publicId}`)
        .setDescription(
          `**${suggestion.title}**\n${suggestion.content.slice(0, 300)}`,
        )
        .addFields(
          {
            name: "Status",
            value: STATUS_LABELS[suggestion.status] || suggestion.status,
            inline: true,
          },
          {
            name: "Category",
            value: CATEGORY_LABELS[suggestion.category] || "General",
            inline: true,
          },
          { name: "Votes", value: `👍 ${v.up} 👎 ${v.down}`, inline: true },
          {
            name: "Action",
            value: "Use buttons below to manage this suggestion.",
            inline: false,
          },
        );

      const {
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
      } = require("discord.js");
      const rows = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`sug:admin_action:approve:${suggestion.publicId}`)
            .setLabel("Approve")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`sug:admin_action:deny:${suggestion.publicId}`)
            .setLabel("Deny")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`sug:admin_action:planned:${suggestion.publicId}`)
            .setLabel("Planned")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`sug:admin_action:implemented:${suggestion.publicId}`)
            .setLabel("Implemented")
            .setEmoji("🚀")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`sug:admin_action:close_voting:${suggestion.publicId}`)
            .setLabel("Close Voting")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`sug:admin_action:delete:${suggestion.publicId}`)
            .setLabel("Delete")
            .setEmoji("🗑️")
            .setStyle(ButtonStyle.Danger),
        ),
        new ActionRowBuilder().addComponents(
          suggestion.threadId
            ? new ButtonBuilder()
                .setCustomId(
                  `sug:admin_action:close_thread:${suggestion.publicId}`,
                )
                .setLabel("Close Thread")
                .setEmoji("🔒")
                .setStyle(ButtonStyle.Danger)
            : new ButtonBuilder()
                .setCustomId(
                  `sug:admin_action:open_thread:${suggestion.publicId}`,
                )
                .setLabel("Open Thread")
                .setEmoji("💬")
                .setStyle(ButtonStyle.Primary),
        ),
      ];

      return interaction.reply({
        embeds: [embed],
        components: rows,
        flags: 64,
      });
    },
  },
];
