"use strict";

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const {
  toggleVote,
  getSuggestion,
  getVoters,
  countVotes,
  buildSuggestionEmbed,
  buildSuggestionButtons,
  approveSuggestion,
  denySuggestion,
  deleteSuggestion,
  updateSuggestion,
  tryUpdatePublicEmbed,
} = require("../../../modules/suggestions/service");

const VOTERS_PER_PAGE = 20;

// ─── Permission helper ────────────────────────────────────────────────────────

async function isAdminOrManager(member, guildId) {
  if (member.permissions?.has("ManageGuild")) return true;
  const g = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { discoreManagerRoleId: true, disAdminRoleId: true },
  });
  if (g?.discoreManagerRoleId && member.roles.cache.has(g.discoreManagerRoleId))
    return true;
  if (g?.disAdminRoleId && member.roles.cache.has(g.disAdminRoleId))
    return true;
  return false;
}

// ─── Components ───────────────────────────────────────────────────────────────

module.exports = [
  // ── Upvote / Downvote ──────────────────────────────────────────────────
  {
    customIdPrefix: "sug:up:",
    async execute(interaction) {
      // Defer first — acknowledge the interaction immediately
      await interaction.deferUpdate();

      const publicId = interaction.customId.split(":")[2];
      const suggestion = await getSuggestion(publicId);
      if (!suggestion) {
        return interaction.followUp({
          content: "⚠️ Suggestion not found.",
          flags: 64,
        });
      }
      if (suggestion.status !== "PENDING") {
        return interaction.followUp({
          content: "⚠️ This suggestion is no longer live.",
          flags: 64,
        });
      }

      const result = await toggleVote(suggestion.id, interaction.user.id, "UP");
      const messages = {
        added: "✅ Your upvote has been added.",
        changed: "✅ Your vote has been changed to upvote.",
        removed: "✅ Your upvote has been removed.",
      };

      const updated = await getSuggestion(publicId);
      const settings = await prisma.guild.findUnique({
        where: { id: suggestion.guildId },
        select: { publicSuggestionVoters: true, themeColor: true },
      });
      const embed = await buildSuggestionEmbed(suggestion.guildId, updated);
      const components = buildSuggestionButtons(updated, settings);

      await interaction.editReply({ embeds: [embed], components });
      tryUpdatePublicEmbed(interaction.client, updated);

      return interaction.followUp({ content: messages[result], flags: 64 });
    },
  },

  {
    customIdPrefix: "sug:down:",
    async execute(interaction) {
      // Defer first — acknowledge the interaction immediately
      await interaction.deferUpdate();

      const publicId = interaction.customId.split(":")[2];
      const suggestion = await getSuggestion(publicId);
      if (!suggestion) {
        return interaction.followUp({
          content: "⚠️ Suggestion not found.",
          flags: 64,
        });
      }
      if (suggestion.status !== "PENDING") {
        return interaction.followUp({
          content: "⚠️ This suggestion is no longer live.",
          flags: 64,
        });
      }

      const result = await toggleVote(
        suggestion.id,
        interaction.user.id,
        "DOWN",
      );
      const messages = {
        added: "✅ Your downvote has been added.",
        changed: "✅ Your vote has been changed to downvote.",
        removed: "✅ Your downvote has been removed.",
      };

      const updated = await getSuggestion(publicId);
      const settings = await prisma.guild.findUnique({
        where: { id: suggestion.guildId },
        select: { publicSuggestionVoters: true, themeColor: true },
      });
      const embed = await buildSuggestionEmbed(suggestion.guildId, updated);
      const components = buildSuggestionButtons(updated, settings);

      await interaction.editReply({ embeds: [embed], components });
      tryUpdatePublicEmbed(interaction.client, updated);

      return interaction.followUp({ content: messages[result], flags: 64 });
    },
  },

  // ── Approve ────────────────────────────────────────────────────────────
  {
    customIdPrefix: "sug:approve:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[2];
      if (!(await isAdminOrManager(interaction.member, interaction.guildId))) {
        return interaction.reply({
          content: "🚫 You do not have permission to do that.",
          flags: 64,
        });
      }
      const suggestion = await getSuggestion(publicId);
      if (!suggestion || suggestion.status !== "PENDING") {
        return interaction.reply({
          content: "⚠️ This suggestion is no longer live.",
          flags: 64,
        });
      }

      const updated = await approveSuggestion(publicId, interaction.user.id);
      const settings = await prisma.guild.findUnique({
        where: { id: suggestion.guildId },
        select: { publicSuggestionVoters: true, themeColor: true },
      });
      const embed = await buildSuggestionEmbed(suggestion.guildId, updated);
      const components = buildSuggestionButtons(updated, settings);

      await interaction.update({ embeds: [embed], components }).catch(() => {});
      tryUpdatePublicEmbed(interaction.client, updated);
    },
  },

  // ── Deny (opens modal for reason) ──────────────────────────────────────
  {
    customIdPrefix: "sug:deny:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[2];
      if (!(await isAdminOrManager(interaction.member, interaction.guildId))) {
        return interaction.reply({
          content: "🚫 You do not have permission to do that.",
          flags: 64,
        });
      }
      const suggestion = await getSuggestion(publicId);
      if (!suggestion || suggestion.status !== "PENDING") {
        return interaction.reply({
          content: "⚠️ This suggestion is no longer live.",
          flags: 64,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`sug_deny_modal:${publicId}`)
        .setTitle("Deny Suggestion");

      const reasonInput = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Reason for denial (optional)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500)
        .setPlaceholder("Enter a reason...");

      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      return interaction.showModal(modal);
    },
  },

  // ─── Deny modal handler ───────────────────────────────────────────────
  {
    customIdPrefix: "sug_deny_modal:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[1];
      const reason = interaction.fields.getTextInputValue("reason");
      const suggestion = await getSuggestion(publicId);
      if (!suggestion)
        return interaction.reply({
          content: "⚠️ Suggestion not found.",
          flags: 64,
        });

      const updated = await denySuggestion(
        publicId,
        interaction.user.id,
        reason || null,
      );
      const settings = await prisma.guild.findUnique({
        where: { id: suggestion.guildId },
        select: { publicSuggestionVoters: true, themeColor: true },
      });
      const embed = await buildSuggestionEmbed(suggestion.guildId, updated);
      const components = buildSuggestionButtons(updated, settings);

      await interaction.update({ embeds: [embed], components }).catch(() => {});
      tryUpdatePublicEmbed(interaction.client, updated);
    },
  },

  // ── Delete ─────────────────────────────────────────────────────────────
  {
    customIdPrefix: "sug:delete:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[2];
      if (!(await isAdminOrManager(interaction.member, interaction.guildId))) {
        return interaction.reply({
          content: "🚫 You do not have permission to do that.",
          flags: 64,
        });
      }

      // Show confirmation
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sug:delete_confirm:${publicId}`)
          .setLabel("Delete Suggestion")
          .setEmoji("🗑️")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`sug:delete_cancel:${publicId}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary),
      );

      return interaction.reply({
        content: `⚠️ Are you sure you want to delete \`${publicId}\`?`,
        components: [confirmRow],
        flags: 64,
      });
    },
  },

  {
    customIdPrefix: "sug:delete_confirm:",
    async execute(interaction) {
      // Defer first so the interaction doesn't expire during DB/Discord work
      await interaction.deferUpdate();

      const publicId = interaction.customId.split(":")[2];
      if (!(await isAdminOrManager(interaction.member, interaction.guildId)))
        return interaction.editReply({
          content: "🚫 No permission.",
          components: [],
        });

      const suggestion = await getSuggestion(publicId);
      if (!suggestion)
        return interaction.editReply({
          content: "Suggestion not found.",
          components: [],
        });

      await deleteSuggestion(publicId, interaction.user.id);

      // Try to delete the public message
      if (suggestion.channelId && suggestion.messageId) {
        try {
          const ch = await interaction.client.channels
            .fetch(suggestion.channelId)
            .catch(() => null);
          if (ch)
            await ch.messages.delete(suggestion.messageId).catch(() => {});
        } catch {}
      }

      const embed = new EmbedBuilder()
        .setTitle(`🗑️ ${publicId} Deleted`)
        .setDescription("This suggestion has been deleted.")
        .setColor(0xff0000);

      return interaction.editReply({
        content: null,
        embeds: [embed],
        components: [],
      });
    },
  },

  {
    customIdPrefix: "sug:delete_cancel:",
    async execute(interaction) {
      await interaction.deferUpdate();
      return interaction.editReply({
        content: "Deletion cancelled.",
        components: [],
        embeds: [],
      });
    },
  },

  // ── Edit (author only) ─────────────────────────────────────────────────
  {
    customIdPrefix: "sug:edit:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[2];
      const suggestion = await getSuggestion(publicId);
      if (!suggestion)
        return interaction.reply({
          content: "⚠️ Suggestion not found.",
          flags: 64,
        });
      if (suggestion.authorId !== interaction.user.id) {
        return interaction.reply({
          content: "🚫 Only the original author can edit this suggestion.",
          flags: 64,
        });
      }
      if (suggestion.status !== "PENDING") {
        return interaction.reply({
          content: "⚠️ This suggestion is no longer live.",
          flags: 64,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`sug_edit_modal:${publicId}`)
        .setTitle("Edit Suggestion");

      const titleInput = new TextInputBuilder()
        .setCustomId("title")
        .setLabel("Title")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setValue(suggestion.title || "");

      const contentInput = new TextInputBuilder()
        .setCustomId("content")
        .setLabel("Suggestion text")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(2000)
        .setValue(suggestion.content);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(contentInput),
      );

      return interaction.showModal(modal);
    },
  },

  {
    customIdPrefix: "sug_edit_modal:",
    async execute(interaction) {
      const publicId = interaction.customId.split(":")[1];
      const title = interaction.fields.getTextInputValue("title");
      const content = interaction.fields.getTextInputValue("content");

      const updated = await updateSuggestion(publicId, {
        title,
        content,
        updatedAt: new Date(),
      });

      const settings = await prisma.guild.findUnique({
        where: { id: updated.guildId },
        select: { publicSuggestionVoters: true, themeColor: true },
      });
      const embed = await buildSuggestionEmbed(updated.guildId, updated);
      const components = buildSuggestionButtons(updated, settings);

      await interaction.update({ embeds: [embed], components }).catch(() => {});
      tryUpdatePublicEmbed(interaction.client, updated);

      return interaction.followUp({
        content: "✅ Suggestion updated.",
        flags: 64,
      });
    },
  },

  // ── See Voters ─────────────────────────────────────────────────────────
  {
    customIdPrefix: "sug:voters:",
    async execute(interaction) {
      const parts = interaction.customId.split(":");
      const publicId = parts[2];
      const page = parseInt(parts[3], 10) || 0;

      const settings = await prisma.guild.findUnique({
        where: { id: interaction.guildId },
        select: { publicSuggestionVoters: true },
      });

      if (!settings?.publicSuggestionVoters) {
        return interaction.reply({
          content: "🔒 Voter lists are private on this server.",
          flags: 64,
        });
      }

      const suggestion = await getSuggestion(publicId);
      if (!suggestion)
        return interaction.reply({
          content: "⚠️ Suggestion not found.",
          flags: 64,
        });

      const voters = await getVoters(suggestion.id);
      const totalUp = voters.up.length;
      const totalDown = voters.down.length;

      const totalPages = Math.ceil(
        Math.max(totalUp, totalDown) / VOTERS_PER_PAGE,
      );
      const safeP = Math.min(Math.max(page, 0), Math.max(0, totalPages - 1));

      const upSlice =
        voters.up
          .slice(safeP * VOTERS_PER_PAGE, (safeP + 1) * VOTERS_PER_PAGE)
          .map((id) => `<@${id}>`)
          .join("\n") || "None";
      const downSlice =
        voters.down
          .slice(safeP * VOTERS_PER_PAGE, (safeP + 1) * VOTERS_PER_PAGE)
          .map((id) => `<@${id}>`)
          .join("\n") || "None";

      const embed = new EmbedBuilder()
        .setTitle(`👥 Voters for ${publicId}`)
        .setDescription(
          `**${suggestion.title || suggestion.content.slice(0, 100)}**`,
        )
        .setColor(0x1a7a9e)
        .setFooter({
          text: `Page ${safeP + 1}/${Math.max(1, totalPages)} · Total: ${totalUp} up / ${totalDown} down`,
        })
        .setTimestamp()
        .addFields(
          { name: `👍 Upvotes (${totalUp})`, value: upSlice, inline: false },
          {
            name: `👎 Downvotes (${totalDown})`,
            value: downSlice,
            inline: false,
          },
        );

      const components = [];
      if (totalPages > 1) {
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`sug:voters_page:${publicId}:${safeP - 1}`)
              .setLabel("⬅ Previous")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(safeP <= 0),
            new ButtonBuilder()
              .setCustomId(`sug:voters_page:${publicId}:${safeP + 1}`)
              .setLabel("Next ➡")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(safeP >= totalPages - 1),
          ),
        );
      }

      return interaction.reply({ embeds: [embed], components, flags: 64 });
    },
  },

  // ── Voters pagination ──────────────────────────────────────────────────
  {
    customIdPrefix: "sug:voters_page:",
    async execute(interaction) {
      const parts = interaction.customId.split(":");
      const publicId = parts[2];
      const page = parseInt(parts[3], 10) || 0;

      const settings = await prisma.guild.findUnique({
        where: { id: interaction.guildId },
        select: { publicSuggestionVoters: true },
      });

      if (!settings?.publicSuggestionVoters) {
        return interaction.update({
          content: "🔒 Voter lists are private on this server.",
          embeds: [],
          components: [],
        });
      }

      const suggestion = await getSuggestion(publicId);
      if (!suggestion)
        return interaction.update({
          content: "⚠️ Suggestion not found.",
          embeds: [],
          components: [],
        });

      const voters = await getVoters(suggestion.id);
      const totalUp = voters.up.length;
      const totalDown = voters.down.length;

      const totalPages = Math.ceil(
        Math.max(totalUp, totalDown) / VOTERS_PER_PAGE,
      );
      const safeP = Math.min(Math.max(page, 0), Math.max(0, totalPages - 1));

      const upSlice =
        voters.up
          .slice(safeP * VOTERS_PER_PAGE, (safeP + 1) * VOTERS_PER_PAGE)
          .map((id) => `<@${id}>`)
          .join("\n") || "None";
      const downSlice =
        voters.down
          .slice(safeP * VOTERS_PER_PAGE, (safeP + 1) * VOTERS_PER_PAGE)
          .map((id) => `<@${id}>`)
          .join("\n") || "None";

      const embed = new EmbedBuilder()
        .setTitle(`👥 Voters for ${publicId}`)
        .setDescription(
          `**${suggestion.title || suggestion.content.slice(0, 100)}**`,
        )
        .setColor(0x1a7a9e)
        .setFooter({
          text: `Page ${safeP + 1}/${Math.max(1, totalPages)} · Total: ${totalUp} up / ${totalDown} down`,
        })
        .setTimestamp()
        .addFields(
          { name: `👍 Upvotes (${totalUp})`, value: upSlice, inline: false },
          {
            name: `👎 Downvotes (${totalDown})`,
            value: downSlice,
            inline: false,
          },
        );

      const components = [];
      if (totalPages > 1) {
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`sug:voters_page:${publicId}:${safeP - 1}`)
              .setLabel("⬅ Previous")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(safeP <= 0),
            new ButtonBuilder()
              .setCustomId(`sug:voters_page:${publicId}:${safeP + 1}`)
              .setLabel("Next ➡")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(safeP >= totalPages - 1),
          ),
        );
      }

      return interaction.update({ embeds: [embed], components });
    },
  },
];
