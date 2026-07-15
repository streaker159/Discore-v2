"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  LabelBuilder,
  FileUploadBuilder,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const wizardState = require("../../../modules/suggestions/wizardState");
const {
  getGuildSuggestionSettings,
  isAdminOrManager,
  getSuggestion,
  getSuggestionById,
  toggleVote,
  getVoters,
  countVotes,
  setSuggestionStatus,
  deleteSuggestion,
  purgeSuggestion,
  buildSuggestionEmbed,
  buildSuggestionButtons,
  buildAdminButtons,
  tryUpdatePublicEmbed,
  createDiscussionThread,
  updateSuggestionByPublicId,
  updateSuggestion,
  listPendingSuggestions,
  listMySuggestions,
  listAdminQueueSuggestions,
  getUserActiveSuggestionCount,
  createSuggestion,
  getSuggestionByMessage,
  parseDuration,
  MAX_RETENTION_DAYS,
  STALE_MESSAGE,
  CATEGORY_LABELS,
  STATUS_LABELS,
} = require("../../../modules/suggestions/service");
const {
  buildDashboardEmbed,
  buildDashboardButtons,
  buildWizardStepEmbed,
  buildWizardStepComponents,
  WIZARD_STEPS,
} = require("../../../commands/public/suggestion/suggestion");

// Helpers
function getWizardData(interaction) {
  return wizardState.get(interaction.user.id, interaction.guildId);
}

const IMAGE_MAX_MB = parseInt(process.env.SUGGESTION_IMAGE_MAX_MB || "5", 10);
const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpg",
  "image/jpeg",
  "image/webp",
];

module.exports = [
  // ═══════════════════════════════════════════════════════════════════════
  // Dashboard Buttons
  // ═══════════════════════════════════════════════════════════════════════

  {
    customId: "sug:dashboard:close",
    async execute(interaction) {
      wizardState.del(interaction.user.id, interaction.guildId);
      return interaction.update({
        content: "✅ Suggestion Centre closed.",
        embeds: [],
        components: [],
      });
    },
  },

  {
    customId: "sug:dashboard:refresh",
    async execute(interaction) {
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      const channelSet = !!settings?.suggestionChannelId;
      const admin = isAdminOrManager(interaction.member, settings);
      const embed = buildDashboardEmbed(settings, admin, channelSet);
      const components = buildDashboardButtons(settings, admin, channelSet);
      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customId: "sug:dashboard:set_channel",
    async execute(interaction) {
      const admin = isAdminOrManager(
        interaction.member,
        await getGuildSuggestionSettings(interaction.guildId),
      );
      if (!admin)
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId("sug:set_channel:select")
          .setPlaceholder("Choose a suggestion channel...")
          .setChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
          ),
      );

      return interaction.reply({
        content: "📡 Select a channel for suggestions:",
        components: [row],
        flags: 64,
      });
    },
  },

  {
    customIdPrefix: "sug:set_channel:select",
    async execute(interaction) {
      const admin = isAdminOrManager(
        interaction.member,
        await getGuildSuggestionSettings(interaction.guildId),
      );
      if (!admin)
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const channel = interaction.channels?.first();
      if (!channel)
        return interaction.reply({
          content: "⚠️ No channel selected.",
          flags: 64,
        });

      await prisma.guild.upsert({
        where: { id: interaction.guildId },
        create: { id: interaction.guildId, suggestionChannelId: channel.id },
        update: { suggestionChannelId: channel.id },
      });

      return interaction.update({
        content: `✅ Suggestion channel set to ${channel}. Use /suggestion again.`,
        components: [],
      });
    },
  },

  {
    customId: "sug:dashboard:submit",
    async execute(interaction) {
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!settings?.suggestionChannelId) {
        const admin = isAdminOrManager(interaction.member, settings);
        return interaction.reply({
          content: admin
            ? "⚠️ Suggestions are not set up yet. Please set a suggestion channel using `/server channel`, or use the **Set Suggestion Channel** button."
            : "⚠️ Suggestions are not set up yet. A suggestion channel has not been configured. Please ask an admin to set one up.",
          flags: 64,
        });
      }

      // Check limits
      const maxPerUser = settings?.suggestionMaxPerUser ?? 5;
      const activeCount = await getUserActiveSuggestionCount(
        interaction.guildId,
        interaction.user.id,
      );
      if (activeCount >= maxPerUser) {
        return interaction.reply({
          content: `⚠️ You already have ${activeCount} active suggestions (max ${maxPerUser}). Please wait for some to close.`,
          flags: 64,
        });
      }

      const data = {
        step: WIZARD_STEPS.CATEGORY,
        category: null,
        title: null,
        content: null,
        showVoters: settings?.suggestionShowVoters ?? false,
        duration: `${settings?.suggestionDefaultDuration ?? 7} days`,
        imageUrl: null,
      };
      wizardState.set(interaction.user.id, interaction.guildId, data);

      const embed = buildWizardStepEmbed(WIZARD_STEPS.CATEGORY, data);
      const components = buildWizardStepComponents(WIZARD_STEPS.CATEGORY, data);
      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customId: "sug:dashboard:view",
    async execute(interaction) {
      const suggestions = await listPendingSuggestions(
        interaction.guildId,
        1,
        25,
      );
      if (!suggestions.length) {
        return interaction.reply({
          content: "📭 No live suggestions right now.",
          flags: 64,
        });
      }

      const lines = suggestions.map((s) => {
        const v = countVotes(s);
        const cat = CATEGORY_LABELS[s.category] || "💬 General";
        return `\`${s.publicId}\` | ${cat} | ${s.title || s.content.slice(0, 50)} | 👍 ${v.up} 👎 ${v.down}`;
      });

      const embed = new EmbedBuilder()
        .setTitle("💡 Live Suggestions")
        .setDescription(lines.join("\n"))
        .setColor(0x1a7a9e)
        .setFooter({
          text: "Use the Suggestion Centre to interact with suggestions",
        })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: 64 });
    },
  },

  {
    customId: "sug:dashboard:my",
    async execute(interaction) {
      const suggestions = await listMySuggestions(
        interaction.guildId,
        interaction.user.id,
      );
      if (!suggestions.length) {
        return interaction.reply({
          content: "📭 You have no suggestions.",
          flags: 64,
        });
      }

      const lines = suggestions.slice(0, 25).map((s) => {
        const v = countVotes(s);
        const status = STATUS_LABELS[s.status] || s.status;
        return `\`${s.publicId}\` | ${status} | ${s.title || s.content.slice(0, 50)} | 👍 ${v.up} 👎 ${v.down}`;
      });

      const embed = new EmbedBuilder()
        .setTitle("👤 My Suggestions")
        .setDescription(lines.join("\n"))
        .setColor(0x1a7a9e)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: 64 });
    },
  },

  {
    customId: "sug:dashboard:admin_settings",
    async execute(interaction) {
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings)) {
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });
      }

      const suggestions = await prisma.suggestion.findMany({
        where: {
          guildId: interaction.guildId,
          status: { not: "DELETED" },
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      });

      const embed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("🔧 Admin Settings")
        .setDescription(
          "Select a suggestion from the dropdown, then use the action buttons.",
        )
        .addFields({
          name: "Manage Suggestions",
          value: suggestions.length
            ? `${suggestions.length} suggestion(s) available.`
            : "No suggestions found.",
          inline: false,
        });

      const rows = [];

      if (suggestions.length) {
        const {
          StringSelectMenuBuilder,
          StringSelectMenuOptionBuilder,
        } = require("discord.js");
        const options = suggestions.map((s) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${s.publicId}: ${(s.title || s.content).slice(0, 50)}`)
            .setValue(s.publicId)
            .setDescription(
              `${STATUS_LABELS[s.status] || s.status} • ${CATEGORY_LABELS[s.category] || "General"}`,
            ),
        );
        rows.push(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("sug:admin_select:suggestion")
              .setPlaceholder("Search suggestions...")
              .addOptions(options.slice(0, 25)),
          ),
        );
      }

      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sug:dashboard:refresh")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      );

      return interaction.update({ embeds: [embed], components: rows });
    },
  },

  {
    customIdPrefix: "sug:admin_select:suggestion",
    async execute(interaction) {
      const publicId = interaction.values[0];
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const suggestion = await getSuggestion(publicId);
      if (!suggestion)
        return interaction.reply({ content: STALE_MESSAGE, flags: 64 });

      const v = countVotes(suggestion);
      const embed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle(`🔧 Admin Settings — ${publicId}`)
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

      const suggestions = await prisma.suggestion.findMany({
        where: { guildId: interaction.guildId, status: { not: "DELETED" } },
        orderBy: { createdAt: "desc" },
        take: 25,
      });
      const {
        StringSelectMenuBuilder,
        StringSelectMenuOptionBuilder,
      } = require("discord.js");
      const options = suggestions.map((s) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${s.publicId}: ${(s.title || s.content).slice(0, 50)}`)
          .setValue(s.publicId)
          .setDescription(`${STATUS_LABELS[s.status] || s.status}`)
          .setDefault(s.publicId === publicId),
      );

      const rows = [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("sug:admin_select:suggestion")
            .setPlaceholder("Select another suggestion...")
            .addOptions(options.slice(0, 25)),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`sug:admin_action:approve:${publicId}`)
            .setLabel("Approve")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`sug:admin_action:deny:${publicId}`)
            .setLabel("Deny")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`sug:admin_action:delete:${publicId}`)
            .setLabel("Delete")
            .setEmoji("🗑️")
            .setStyle(ButtonStyle.Danger),
        ),
        new ActionRowBuilder().addComponents(
          suggestion.threadId
            ? new ButtonBuilder()
                .setCustomId(`sug:admin_action:close_thread:${publicId}`)
                .setLabel("Close Thread")
                .setEmoji("🔒")
                .setStyle(ButtonStyle.Danger)
            : new ButtonBuilder()
                .setCustomId(`sug:admin_action:open_thread:${publicId}`)
                .setLabel("Open Thread")
                .setEmoji("💬")
                .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("sug:dashboard:refresh")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];

      return interaction.update({ embeds: [embed], components: rows });
    },
  },

  {
    customIdPrefix: "sug:admin_action:approve:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":").pop();
      const s = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, s))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });
      await setSuggestionStatus(publicId, "APPROVED", interaction.user.id);
      const updated = await getSuggestion(publicId);
      if (updated) await tryUpdatePublicEmbed(interaction.client, updated);
      return interaction.reply({
        content: `✅ \`${publicId}\` approved.`,
        flags: 64,
      });
    },
  },

  {
    customIdPrefix: "sug:admin_action:deny:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":").pop();
      const s = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, s))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });
      const modal = new ModalBuilder()
        .setCustomId(`sug:modal:deny_reason:${publicId}`)
        .setTitle("Deny Suggestion")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("reason")
              .setLabel("Reason (optional)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(500)
              .setPlaceholder("Why is this suggestion being denied?"),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  {
    customIdPrefix: "sug:admin_action:delete:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":").pop();
      const s = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, s))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });
      const sug = await getSuggestion(publicId);
      if (!sug) return interaction.reply({ content: STALE_MESSAGE, flags: 64 });
      if (sug.channelId && sug.messageId) {
        try {
          const ch = await interaction.client.channels
            .fetch(sug.channelId)
            .catch(() => null);
          if (ch) await ch.messages.delete(sug.messageId).catch(() => {});
        } catch {}
      }
      await purgeSuggestion(sug.id);
      return interaction.reply({
        content: `✅ \`${publicId}\` deleted from DB.`,
        flags: 64,
      });
    },
  },

  {
    customIdPrefix: "sug:admin_action:open_thread:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":").pop();
      const s = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, s))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });
      const sug = await getSuggestion(publicId);
      if (!sug) return interaction.reply({ content: STALE_MESSAGE, flags: 64 });
      await interaction.deferReply({ flags: 64 }).catch(() => {});
      const threadId = await createDiscussionThread(interaction.client, sug);
      if (!threadId)
        return interaction.editReply({
          content: "⚠️ Could not create thread.",
        });
      await updateSuggestion(sug.id, { threadId });
      const updated = await getSuggestion(publicId);
      if (updated) await tryUpdatePublicEmbed(interaction.client, updated);
      return interaction.editReply({
        content: `✅ Thread opened: <#${threadId}>`,
      });
    },
  },

  {
    customIdPrefix: "sug:admin_action:close_thread:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":").pop();
      const s = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, s))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });
      const sug = await getSuggestion(publicId);
      if (!sug || !sug.threadId)
        return interaction.reply({ content: "No active thread.", flags: 64 });
      await interaction.deferReply({ flags: 64 }).catch(() => {});
      try {
        const thread = await interaction.client.channels
          .fetch(sug.threadId)
          .catch(() => null);
        if (thread?.isThread?.()) {
          await thread.setLocked(true).catch(() => {});
          await thread.setArchived(true).catch(() => {});
        }
      } catch {}
      await updateSuggestion(sug.id, { threadId: null });
      const updated = await getSuggestion(publicId);
      if (updated) await tryUpdatePublicEmbed(interaction.client, updated);
      return interaction.editReply({ content: "✅ Thread closed and locked." });
    },
  },

  {
    customId: "sug:dashboard:settings",
    async execute(interaction) {
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings)) {
        return interaction.reply({
          content: "🚫 Missing permissions. Settings are for staff only.",
          flags: 64,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("⚙️ Suggestion Settings")
        .addFields(
          {
            name: "📡 Suggestion Channel",
            value: settings?.suggestionChannelId
              ? `<#${settings.suggestionChannelId}>`
              : "Not set",
            inline: true,
          },
          {
            name: "⏱️ Default Duration",
            value: `${settings?.suggestionDefaultDuration ?? 7} days`,
            inline: true,
          },
          {
            name: "👥 Show Voters Default",
            value: settings?.suggestionShowVoters ? "Yes" : "No",
            inline: true,
          },
          {
            name: "🔍 Require Review",
            value: settings?.suggestionRequireReview ? "Yes" : "No",
            inline: true,
          },
          {
            name: "🖼️ Allow Images",
            value: settings?.suggestionAllowImages ? "Yes" : "No",
            inline: true,
          },
          {
            name: "💬 Create Threads",
            value: settings?.suggestionCreateThreads ? "Yes" : "No",
            inline: true,
          },
          {
            name: "🎖️ Manager Role",
            value: settings?.suggestionManagerRoleId
              ? `<@&${settings.suggestionManagerRoleId}>`
              : "Not set",
            inline: true,
          },
          {
            name: "📊 Max Per User",
            value: `${settings?.suggestionMaxPerUser ?? 5}`,
            inline: true,
          },
        )
        .setFooter({
          text: "Use /server channel to change the suggestion channel",
        })
        .setTimestamp();

      const rows = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sug:settings:set_channel")
            .setLabel("Set Suggestion Channel")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📡"),
          new ButtonBuilder()
            .setCustomId("sug:settings:set_duration")
            .setLabel("Set Duration")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⏱️"),
          new ButtonBuilder()
            .setCustomId("sug:settings:toggle_voters")
            .setLabel(
              `Toggle Show Voters: ${settings?.suggestionShowVoters ? "ON" : "OFF"}`,
            )
            .setStyle(
              settings?.suggestionShowVoters
                ? ButtonStyle.Success
                : ButtonStyle.Secondary,
            ),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sug:settings:set_manager_role")
            .setLabel("Set Manager Role")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🎖️"),
          new ButtonBuilder()
            .setCustomId("sug:dashboard:refresh")
            .setLabel("Back")
            .setStyle(ButtonStyle.Primary),
        ),
      ];

      return interaction.update({ embeds: [embed], components: rows });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Settings Buttons
  // ═══════════════════════════════════════════════════════════════════════

  {
    customId: "sug:settings:set_channel",
    async execute(interaction) {
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId("sug:set_channel:select")
          .setPlaceholder("Choose a suggestion channel...")
          .setChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
          ),
      );

      return interaction.update({
        content: "📡 Select a channel for suggestions:",
        components: [row],
        embeds: [],
      });
    },
  },

  {
    customId: "sug:settings:set_duration",
    async execute(interaction) {
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const modal = new ModalBuilder()
        .setCustomId("sug:modal:admin_duration")
        .setTitle("Set Default Duration")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("days")
              .setLabel("Days (1-30)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder("7")
              .setValue(String(settings?.suggestionDefaultDuration ?? 7)),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  {
    customId: "sug:settings:toggle_voters",
    async execute(interaction) {
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const newVal = !(settings?.suggestionShowVoters ?? false);
      await prisma.guild.update({
        where: { id: interaction.guildId },
        data: { suggestionShowVoters: newVal },
      });

      const fresh = await getGuildSuggestionSettings(interaction.guildId);
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("⚙️ Suggestion Settings")
        .addFields({
          name: "👥 Show Voters Default",
          value: fresh?.suggestionShowVoters ? "✅ Yes" : "🔒 No",
          inline: true,
        })
        .setFooter({ text: "Default updated" });

      const components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sug:settings:set_channel")
            .setLabel("Set Suggestion Channel")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📡"),
          new ButtonBuilder()
            .setCustomId("sug:settings:set_duration")
            .setLabel("Set Duration")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⏱️"),
          new ButtonBuilder()
            .setCustomId("sug:settings:toggle_voters")
            .setLabel(
              `Toggle Show Voters: ${fresh?.suggestionShowVoters ? "ON" : "OFF"}`,
            )
            .setStyle(
              fresh?.suggestionShowVoters
                ? ButtonStyle.Success
                : ButtonStyle.Secondary,
            ),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sug:settings:set_manager_role")
            .setLabel("Set Manager Role")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🎖️"),
          new ButtonBuilder()
            .setCustomId("sug:dashboard:refresh")
            .setLabel("Back")
            .setStyle(ButtonStyle.Primary),
        ),
      ];

      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customId: "sug:settings:set_manager_role",
    async execute(interaction) {
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const { RoleSelectMenuBuilder } = require("discord.js");
      const row = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("sug:manager_role:select")
          .setPlaceholder("Select a suggestion manager role...")
          .setMaxValues(1),
      );

      return interaction.update({
        content: "🎖️ Select a role for suggestion managers:",
        embeds: [],
        components: [row],
      });
    },
  },

  {
    customIdPrefix: "sug:manager_role:select",
    async execute(interaction) {
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const role = interaction.roles?.first();
      await prisma.guild.update({
        where: { id: interaction.guildId },
        data: { suggestionManagerRoleId: role?.id || null },
      });

      return interaction.update({
        content: role
          ? `✅ Suggestion manager role set to ${role}.`
          : "✅ Suggestion manager role cleared.",
        components: [],
        embeds: [],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Wizard Buttons
  // ═══════════════════════════════════════════════════════════════════════

  {
    customIdPrefix: "sug:wiz:category_select",
    async execute(interaction) {
      const value = interaction.values[0];
      const data = getWizardData(interaction);
      if (!data)
        return interaction.update({
          content: "Session expired.",
          components: [],
          embeds: [],
        });
      data.category = value;
      wizardState.set(interaction.user.id, interaction.guildId, data);
      const embed = buildWizardStepEmbed(WIZARD_STEPS.CATEGORY, data);
      const components = buildWizardStepComponents(WIZARD_STEPS.CATEGORY, data);
      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customId: "sug:wiz:cancel",
    async execute(interaction) {
      wizardState.del(interaction.user.id, interaction.guildId);
      return interaction.update({
        content: "✅ Suggestion creation cancelled.",
        embeds: [],
        components: [],
      });
    },
  },

  {
    customIdPrefix: "sug:wiz:next:",
    async execute(interaction) {
      const step = parseInt(interaction.customId.split(":")[3], 10);
      const data = getWizardData(interaction);
      if (!data)
        return interaction.update({
          content: "Session expired. Start again with /suggestion.",
          embeds: [],
          components: [],
        });

      data.step = step;
      wizardState.set(interaction.user.id, interaction.guildId, data);
      const embed = buildWizardStepEmbed(step, data);
      const components = buildWizardStepComponents(step, data);
      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customIdPrefix: "sug:wiz:back:",
    async execute(interaction) {
      const step = parseInt(interaction.customId.split(":")[3], 10);
      const data = getWizardData(interaction);
      if (!data)
        return interaction.update({
          content: "Session expired.",
          embeds: [],
          components: [],
        });
      data.step = step;
      wizardState.set(interaction.user.id, interaction.guildId, data);
      const embed = buildWizardStepEmbed(step, data);
      const components = buildWizardStepComponents(step, data);
      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customId: "sug:wiz:edit_details",
    async execute(interaction) {
      const data = getWizardData(interaction);
      const modal = new ModalBuilder()
        .setCustomId("sug:modal:wiz_details")
        .setTitle("Suggestion Details")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("title")
              .setLabel("Title")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100)
              .setPlaceholder("Brief title for your suggestion")
              .setValue(data?.title || ""),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("content")
              .setLabel("Suggestion")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(2000)
              .setPlaceholder("Describe your suggestion in detail")
              .setValue(data?.content || ""),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  {
    customId: "sug:wiz:set_duration",
    async execute(interaction) {
      const modal = new ModalBuilder()
        .setCustomId("sug:modal:wiz_duration")
        .setTitle("Set Duration")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("duration")
              .setLabel("Duration (e.g. 1d, 3d, 7d)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder("7d"),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  {
    customId: "sug:wiz:toggle_voters",
    async execute(interaction) {
      const data = getWizardData(interaction);
      if (!data)
        return interaction.update({
          content: "Session expired.",
          embeds: [],
          components: [],
        });
      data.showVoters = !data.showVoters;
      wizardState.set(interaction.user.id, interaction.guildId, data);
      const embed = buildWizardStepEmbed(WIZARD_STEPS.OPTIONS, data);
      const components = buildWizardStepComponents(WIZARD_STEPS.OPTIONS, data);
      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customId: "sug:wiz:upload_image",
    async execute(interaction) {
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (settings?.suggestionAllowImages === false) {
        return interaction.reply({
          content:
            "⚠️ Image uploads for suggestions are disabled on this server.",
          flags: 64,
        });
      }

      const label = new LabelBuilder()
        .setLabel("Suggestion Image")
        .setDescription(
          `Upload an image (PNG, JPG, JPEG, WEBP, max ${IMAGE_MAX_MB} MB).`,
        )
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId("suggestion_image_upload")
            .setRequired(false)
            .setMinValues(0)
            .setMaxValues(1),
        );
      const modal = new ModalBuilder()
        .setCustomId("sug:modal:upload_image")
        .setTitle("Upload Suggestion Image")
        .addComponents(label);
      return interaction.showModal(modal);
    },
  },

  {
    customId: "sug:wiz:remove_image",
    async execute(interaction) {
      const data = getWizardData(interaction);
      if (!data)
        return interaction.update({
          content: "Session expired.",
          embeds: [],
          components: [],
        });
      data.imageUrl = null;
      wizardState.set(interaction.user.id, interaction.guildId, data);
      const embed = buildWizardStepEmbed(WIZARD_STEPS.IMAGE, data);
      const components = buildWizardStepComponents(WIZARD_STEPS.IMAGE, data);
      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customId: "sug:wiz:submit",
    async execute(interaction) {
      const data = getWizardData(interaction);
      if (!data || !data.title || !data.content || !data.category) {
        return interaction.reply({
          content: "❌ Missing required fields. Please start over.",
          flags: 64,
        });
      }

      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!settings?.suggestionChannelId) {
        return interaction.reply({
          content:
            "⚠️ Suggestions are not set up yet. Please ask an admin to set a suggestion channel.",
          flags: 64,
        });
      }

      // Check channel
      const channel = await interaction.guild.channels
        .fetch(settings.suggestionChannelId)
        .catch(() => null);
      if (!channel || !channel.isTextBased()) {
        return interaction.reply({
          content:
            "⚠️ The configured suggestion channel is not accessible. Please contact an admin.",
          flags: 64,
        });
      }

      // Check perms
      const requiredPerms = ["ViewChannel", "SendMessages", "EmbedLinks"];
      const botMember = interaction.guild.members.me;
      const missingPerms = requiredPerms.filter(
        (p) => !channel.permissionsFor(botMember).has(p),
      );
      if (missingPerms.length) {
        return interaction.reply({
          content: `⚠️ Bot missing permissions in ${channel}: ${missingPerms.join(", ")}. Please contact an admin.`,
          flags: 64,
        });
      }

      await interaction.deferUpdate().catch(() => {});

      const parsed = parseDuration(data.duration);
      if (parsed.error) {
        return interaction.editReply({
          content: `⚠️ ${parsed.error}`,
          embeds: [],
          components: [],
        });
      }

      // Create suggestion
      let suggestion;
      try {
        suggestion = await createSuggestion({
          guildId: interaction.guildId,
          authorId: interaction.user.id,
          title: data.title,
          content: data.content,
          imageUrl: data.imageUrl || null,
          channelId: settings.suggestionChannelId,
          expiresAt: parsed.expiresAt,
          category: data.category,
          showVoters: data.showVoters,
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ Failed to create suggestion: ${err.message}`,
          embeds: [],
          components: [],
        });
      }

      const embed = await buildSuggestionEmbed(suggestion);
      const components = [
        ...buildSuggestionButtons(suggestion),
        ...buildAdminButtons(suggestion),
      ];

      let message;
      try {
        message = await channel.send({ embeds: [embed], components });
      } catch (err) {
        return interaction.editReply({
          content: `⚠️ Cannot post to ${channel}. Check bot permissions: ViewChannel, SendMessages, EmbedLinks.`,
          embeds: [],
          components: [],
        });
      }

      // Update messageId
      await updateSuggestion(suggestion.id, { messageId: message.id });

      wizardState.del(interaction.user.id, interaction.guildId);

      return interaction.editReply({
        content: `✅ Suggestion submitted.\nPosted in ${channel}\nSuggestion ID: \`${suggestion.publicId}\``,
        embeds: [],
        components: [],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Voting Buttons
  // ═══════════════════════════════════════════════════════════════════════

  {
    customIdPrefix: "sug:up:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[2];
      const suggestion = await getSuggestion(publicId);
      if (!suggestion) {
        return interaction.reply({ content: STALE_MESSAGE, flags: 64 });
      }
      const result = await toggleVote(suggestion.id, interaction.user.id, "UP");
      const updated = await getSuggestion(publicId);
      const embed = await buildSuggestionEmbed(updated);
      const components = [
        ...buildSuggestionButtons(updated),
        ...buildAdminButtons(updated),
      ];
      const messages = {
        added: "✅ Vote added.",
        changed: "🔄 Vote updated.",
        removed: "🗳️ Vote removed.",
      };
      return interaction
        .update({ embeds: [embed], components })
        .then(() => {
          if (messages[result])
            return interaction.followUp({
              content: messages[result],
              flags: 64,
            });
        })
        .catch(() => {});
    },
  },

  {
    customIdPrefix: "sug:down:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[2];
      const suggestion = await getSuggestion(publicId);
      if (!suggestion) {
        return interaction.reply({ content: STALE_MESSAGE, flags: 64 });
      }
      const result = await toggleVote(
        suggestion.id,
        interaction.user.id,
        "DOWN",
      );
      const updated = await getSuggestion(publicId);
      const embed = await buildSuggestionEmbed(updated);
      const components = [
        ...buildSuggestionButtons(updated),
        ...buildAdminButtons(updated),
      ];
      const messages = {
        added: "✅ Vote added.",
        changed: "🔄 Vote updated.",
        removed: "🗳️ Vote removed.",
      };
      return interaction
        .update({ embeds: [embed], components })
        .then(() => {
          if (messages[result])
            return interaction.followUp({
              content: messages[result],
              flags: 64,
            });
        })
        .catch(() => {});
    },
  },

  {
    customIdPrefix: "sug:voters:",
    async execute(interaction) {
      const parts = interaction.customId.split(":");
      const publicId = parts[2];
      const page = parseInt(parts[3] || "0", 10);

      const suggestion = await getSuggestion(publicId);
      if (!suggestion) {
        return interaction.reply({ content: STALE_MESSAGE, flags: 64 });
      }

      const voters = await getVoters(suggestion.id);
      const allUp = voters.up;
      const totalUp = allUp.length;
      const totalDown = voters.down.length;
      const perPage = 20;
      const maxPage = Math.ceil(totalUp / perPage) - 1;
      const safeP = Math.max(0, Math.min(page, maxPage));

      const slice = allUp.slice(safeP * perPage, (safeP + 1) * perPage);
      const names =
        slice
          .map((id, i) => `${safeP * perPage + i + 1}. <@${id}>`)
          .join("\n") || "_No voters_";

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`👥 Voters — ${suggestion.publicId}`)
        .setDescription(
          `${suggestion.title || suggestion.content.slice(0, 100)}`,
        )
        .addFields(
          {
            name: `👍 Support (${totalUp})`,
            value: names.slice(0, 1024),
            inline: false,
          },
          { name: "👎 Against", value: `${totalDown}`, inline: true },
          { name: "Page", value: `${safeP + 1}/${maxPage + 1}`, inline: true },
        );

      const components = [];
      if (maxPage > 0) {
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`sug:voters:${publicId}:${safeP - 1}`)
              .setLabel("⬅ Previous")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(safeP <= 0),
            new ButtonBuilder()
              .setCustomId(`sug:voters:${publicId}:${safeP + 1}`)
              .setLabel("Next ➡")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(safeP >= maxPage),
          ),
        );
      }

      return interaction.reply({ embeds: [embed], components, flags: 64 });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Edit Button (author only)
  // ═══════════════════════════════════════════════════════════════════════

  {
    customIdPrefix: "sug:edit:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[2];
      const suggestion = await getSuggestion(publicId);
      if (!suggestion)
        return interaction.reply({ content: STALE_MESSAGE, flags: 64 });
      if (suggestion.authorId !== interaction.user.id)
        return interaction.reply({
          content: "🚫 Only the original author can edit this suggestion.",
          flags: 64,
        });

      const modal = new ModalBuilder()
        .setCustomId(`sug:modal:edit:${publicId}`)
        .setTitle("Edit Suggestion")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("title")
              .setLabel("Title")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100)
              .setValue(suggestion.title || ""),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("content")
              .setLabel("Suggestion text")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(2000)
              .setValue(suggestion.content),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Admin Buttons
  // ═══════════════════════════════════════════════════════════════════════

  {
    customIdPrefix: "sug:admin:open_thread:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[3];
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const suggestion = await getSuggestion(publicId);
      if (!suggestion)
        return interaction.reply({ content: STALE_MESSAGE, flags: 64 });

      await interaction.deferReply({ flags: 64 }).catch(() => {});

      // Check thread permissions
      const channel = await interaction.guild.channels
        .fetch(suggestion.channelId)
        .catch(() => null);
      if (!channel || !channel.isTextBased()) {
        return interaction.editReply({
          content: "⚠️ Suggestion channel not accessible.",
        });
      }

      const botMember = interaction.guild.members.me;
      const threadPerms = ["CreatePublicThreads", "SendMessagesInThreads"];
      const missing = threadPerms.filter(
        (p) => !channel.permissionsFor(botMember).has(p),
      );
      if (missing.length) {
        return interaction.editReply({
          content: `⚠️ Missing permissions: ${missing.join(", ")}.`,
        });
      }

      const threadId = await createDiscussionThread(
        interaction.client,
        suggestion,
      );
      if (!threadId) {
        return interaction.editReply({
          content: "⚠️ Could not create discussion thread.",
        });
      }

      await updateSuggestion(suggestion.id, { threadId });
      const updated = await getSuggestion(publicId);
      await tryUpdatePublicEmbed(interaction.client, updated);

      return interaction.editReply({
        content: `✅ Discussion thread opened: <#${threadId}>`,
      });
    },
  },

  {
    customIdPrefix: "sug:admin:close_thread:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[3];
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const suggestion = await getSuggestion(publicId);
      if (!suggestion || !suggestion.threadId)
        return interaction.reply({
          content: "No active thread to close.",
          flags: 64,
        });

      await interaction.deferReply({ flags: 64 }).catch(() => {});

      try {
        const thread = await interaction.client.channels
          .fetch(suggestion.threadId)
          .catch(() => null);
        if (thread?.isThread?.()) {
          await thread.setLocked(true).catch(() => {});
          await thread.setArchived(true).catch(() => {});
        }
      } catch {}

      await updateSuggestion(suggestion.id, { threadId: null });
      const updated = await getSuggestion(publicId);
      await tryUpdatePublicEmbed(interaction.client, updated);

      return interaction.editReply({
        content: "✅ Discussion thread has been closed and locked.",
      });
    },
  },

  {
    customIdPrefix: "sug:admin:approve:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[3];
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const suggestion = await getSuggestion(publicId);
      if (!suggestion)
        return interaction.reply({ content: STALE_MESSAGE, flags: 64 });

      await setSuggestionStatus(publicId, "APPROVED", interaction.user.id);
      const updated = await getSuggestion(publicId);
      const embed = await buildSuggestionEmbed(updated);
      const components = [
        ...buildSuggestionButtons(updated),
        ...buildAdminButtons(updated),
      ];

      // Update public embed
      await tryUpdatePublicEmbed(interaction.client, updated);

      // Status update in thread
      if (updated.threadId) {
        try {
          const thread = await interaction.client.channels
            .fetch(updated.threadId)
            .catch(() => null);
          if (thread?.isThread?.()) {
            await thread
              .send({
                content: `✅ Suggestion approved by ${interaction.user}.`,
              })
              .catch(() => {});
          }
        } catch {}
      }

      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customIdPrefix: "sug:admin:deny:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[3];
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      // Show reason modal
      const modal = new ModalBuilder()
        .setCustomId(`sug:modal:deny_reason:${publicId}`)
        .setTitle("Deny Suggestion")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("reason")
              .setLabel("Reason (optional)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(500)
              .setPlaceholder("Why is this suggestion being denied?"),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  {
    customIdPrefix: "sug:admin:review:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[3];
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      await setSuggestionStatus(publicId, "UNDER_REVIEW", interaction.user.id);
      const updated = await getSuggestion(publicId);
      const embed = await buildSuggestionEmbed(updated);
      const components = [
        ...buildSuggestionButtons(updated),
        ...buildAdminButtons(updated),
      ];
      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customIdPrefix: "sug:admin:planned:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[3];
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      await setSuggestionStatus(publicId, "PLANNED", interaction.user.id);
      const updated = await getSuggestion(publicId);
      const embed = await buildSuggestionEmbed(updated);
      const components = [
        ...buildSuggestionButtons(updated),
        ...buildAdminButtons(updated),
      ];

      if (updated.threadId) {
        try {
          const thread = await interaction.client.channels
            .fetch(updated.threadId)
            .catch(() => null);
          if (thread?.isThread?.()) {
            await thread
              .send({
                content: `📋 Suggestion moved to **Planned** by ${interaction.user}.`,
              })
              .catch(() => {});
          }
        } catch {}
      }

      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customIdPrefix: "sug:admin:implemented:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[3];
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      await setSuggestionStatus(publicId, "IMPLEMENTED", interaction.user.id);
      const updated = await getSuggestion(publicId);
      const embed = await buildSuggestionEmbed(updated);
      const components = [
        ...buildSuggestionButtons(updated),
        ...buildAdminButtons(updated),
      ];

      if (updated.threadId) {
        try {
          const thread = await interaction.client.channels
            .fetch(updated.threadId)
            .catch(() => null);
          if (thread?.isThread?.()) {
            await thread
              .send({
                content: `🚀 Suggestion marked as **Implemented** by ${interaction.user}.`,
              })
              .catch(() => {});
          }
        } catch {}
      }

      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customIdPrefix: "sug:admin:close_voting:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[3];
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      await setSuggestionStatus(publicId, "CLOSED", interaction.user.id);
      const updated = await getSuggestion(publicId);
      const embed = await buildSuggestionEmbed(updated);
      const components = [
        ...buildSuggestionButtons(updated),
        ...buildAdminButtons(updated),
      ];

      if (updated.threadId) {
        try {
          const thread = await interaction.client.channels
            .fetch(updated.threadId)
            .catch(() => null);
          if (thread?.isThread?.()) {
            await thread
              .send({ content: `🔒 Voting closed by ${interaction.user}.` })
              .catch(() => {});
          }
        } catch {}
      }

      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customIdPrefix: "sug:admin:delete:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[3];
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const suggestion = await getSuggestion(publicId);
      if (!suggestion)
        return interaction.reply({ content: STALE_MESSAGE, flags: 64 });

      // Confirm with additional button
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sug:delete_confirm:${publicId}`)
          .setLabel("Yes, Delete")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`sug:delete_cancel:${publicId}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary),
      );

      return interaction.reply({
        content: `🗑️ Delete suggestion \`${publicId}\`? This is permanent.`,
        components: [row],
        flags: 64,
      });
    },
  },

  {
    customIdPrefix: "sug:delete_confirm:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[2];

      // Recheck perms
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.editReply({
          content: "🚫 Missing permissions.",
          components: [],
        });

      const suggestion = await getSuggestion(publicId);
      if (!suggestion)
        return interaction.editReply({
          content: STALE_MESSAGE,
          components: [],
        });

      // Delete public message if possible
      if (suggestion.channelId && suggestion.messageId) {
        try {
          const ch = await interaction.client.channels
            .fetch(suggestion.channelId)
            .catch(() => null);
          if (ch)
            await ch.messages.delete(suggestion.messageId).catch(() => {});
        } catch {}
      }

      await purgeSuggestion(suggestion.id);

      return interaction.editReply({
        content: `✅ Suggestion \`${publicId}\` has been deleted.`,
        components: [],
      });
    },
  },

  {
    customIdPrefix: "sug:delete_cancel:",
    async execute(interaction) {
      return interaction.update({
        content: "✅ Deletion cancelled.",
        components: [],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Old compat: sug:approve, sug:deny, sug:delete mapped from public embed
  // (These may come from old embeds where admin buttons are inline)
  // ═══════════════════════════════════════════════════════════════════════

  {
    customIdPrefix: "sug:approve:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[2];
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });
      await setSuggestionStatus(publicId, "APPROVED", interaction.user.id);
      const updated = await getSuggestion(publicId);
      const embed = await buildSuggestionEmbed(updated);
      const components = buildSuggestionButtons(updated);
      await tryUpdatePublicEmbed(interaction.client, updated);
      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customIdPrefix: "sug:deny:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[2];
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });
      // Prompt for reason
      const modal = new ModalBuilder()
        .setCustomId(`sug:modal:deny_reason:${publicId}`)
        .setTitle("Deny Suggestion")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("reason")
              .setLabel("Reason (optional)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(500)
              .setPlaceholder("Why is this suggestion being denied?"),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  {
    customIdPrefix: "sug:delete:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[2];
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      if (!isAdminOrManager(interaction.member, settings))
        return interaction.reply({
          content: "🚫 Missing permissions.",
          flags: 64,
        });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sug:delete_confirm:${publicId}`)
          .setLabel("Yes, Delete")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`sug:delete_cancel:${publicId}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary),
      );

      return interaction.reply({
        content: `🗑️ Delete suggestion \`${publicId}\`?`,
        components: [row],
        flags: 64,
      });
    },
  },
];
