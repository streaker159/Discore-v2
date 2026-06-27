"use strict";

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  parseDuration,
  getGuildSuggestionSettings,
  createSuggestion,
  getSuggestion,
  listPendingSuggestions,
  buildSuggestionEmbed,
  buildSuggestionButtons,
  CATEGORY_LABELS,
} = require("../../../modules/suggestions/service");
const prisma = require("../../../lib/prisma");

function isAdmin(member, guildSettings) {
  if (member.permissions?.has("ManageGuild")) return true;
  if (
    guildSettings?.discoreManagerRoleId &&
    member.roles.cache.has(guildSettings.discoreManagerRoleId)
  )
    return true;
  if (
    guildSettings?.disAdminRoleId &&
    member.roles.cache.has(guildSettings.disAdminRoleId)
  )
    return true;
  return false;
}

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("suggestion")
    .setDescription("Create and manage suggestions.")
    .addSubcommand((s) =>
      s
        .setName("submit")
        .setDescription("Submit a new suggestion.")
        .addStringOption((o) =>
          o
            .setName("title")
            .setDescription("Suggestion title")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("suggestion")
            .setDescription("Your full suggestion text")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("category")
            .setDescription("Choose a category")
            .setRequired(true)
            .addChoices(
              { name: "🎮 Game", value: "GAME" },
              { name: "🏰 Server", value: "SERVER" },
              { name: "✨ Features", value: "FEATURES" },
              { name: "#️⃣ Channel", value: "CHANNEL" },
              { name: "📜 Rule", value: "RULE" },
              { name: "⚠️ Issue", value: "ISSUE" },
              { name: "💬 General", value: "GENERAL" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("duration")
            .setDescription("How long open (e.g. 1d, 3d, 7d). Default: 7d"),
        )
        .addAttachmentOption((o) =>
          o.setName("image").setDescription("Optional image attachment"),
        )
        .addBooleanOption((o) =>
          o
            .setName("show_voters")
            .setDescription("Let users see who voted? Default: false"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("view")
        .setDescription("View suggestions.")
        .addStringOption((o) =>
          o.setName("id").setDescription("Suggestion ID (e.g. SUG-001)"),
        )
        .addStringOption((o) =>
          o
            .setName("category")
            .setDescription("Filter by category")
            .addChoices(
              { name: "🎮 Game", value: "GAME" },
              { name: "🏰 Server", value: "SERVER" },
              { name: "✨ Features", value: "FEATURES" },
              { name: "#️⃣ Channel", value: "CHANNEL" },
              { name: "📜 Rule", value: "RULE" },
              { name: "⚠️ Issue", value: "ISSUE" },
              { name: "💬 General", value: "GENERAL" },
            ),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "submit") {
      const settings = await getGuildSuggestionSettings(interaction.guildId);
      let channel;
      let fallback = false;

      if (settings?.suggestionChannelId) {
        channel = await interaction.guild.channels
          .fetch(settings.suggestionChannelId)
          .catch(() => null);
      }
      if (!channel || !channel.isTextBased()) {
        channel = interaction.channel;
        fallback = true;
      }

      const title = interaction.options.getString("title", true);
      const content = interaction.options.getString("suggestion", true);
      const category = interaction.options.getString("category", true);
      const durationStr = interaction.options.getString("duration");
      const attachment = interaction.options.getAttachment("image");
      const showVoters = interaction.options.getBoolean("show_voters") ?? false;

      const parsed = parseDuration(durationStr || "7d");
      if (parsed.error)
        return interaction.reply({ content: `⚠️ ${parsed.error}`, flags: 64 });

      let imageUrl = attachment?.url || null;
      if (attachment && !attachment.contentType?.startsWith("image/")) {
        return interaction.reply({
          content: "⚠️ The attachment must be an image file.",
          flags: 64,
        });
      }

      await interaction.deferReply({ flags: 64 });

      const suggestion = await createSuggestion({
        guildId: interaction.guildId,
        authorId: interaction.user.id,
        title,
        content,
        imageUrl,
        channelId: channel.id,
        expiresAt: parsed.expiresAt,
        category,
        showVoters,
      });

      const embed = await buildSuggestionEmbed(interaction.guildId, suggestion);
      const components = buildSuggestionButtons(suggestion);

      let message;
      try {
        message = await channel.send({ embeds: [embed], components });
      } catch {
        return interaction.editReply({
          content:
            "⚠️ I cannot post to the suggestions channel. Check permissions.",
        });
      }

      await prisma.suggestion.update({
        where: { id: suggestion.id },
        data: { messageId: message.id },
      });

      const fallbackNote = fallback
        ? "\n⚠️ No suggestions channel configured — posted here instead."
        : "";
      return interaction.editReply({
        content: `✅ Suggestion submitted.\nPosted in ${channel}.${fallbackNote}\nSuggestion ID: \`${suggestion.publicId}\`\nVoter list: ${suggestion.showVoters ? "Public" : "Private"}`,
      });
    }

    if (sub === "view") {
      const id = interaction.options.getString("id");
      const catFilter = interaction.options.getString("category");

      if (!id) {
        const pending = await listPendingSuggestions(
          interaction.guildId,
          1,
          25,
          catFilter,
        );
        if (!pending.length) {
          return interaction.reply({
            content: catFilter
              ? `📭 No live suggestions found in this category.`
              : "📭 No live suggestions right now.",
            flags: 64,
          });
        }

        const lines = pending.map((s) => {
          const v = s.votes.filter((x) => x.type === "UP").length || 0;
          const d = s.votes.filter((x) => x.type === "DOWN").length || 0;
          const cat = CATEGORY_LABELS[s.category] || "💬 General";
          return `\`${s.publicId}\` | ${cat} | ${s.title || s.content.slice(0, 50)} | 👍 ${v} 👎 ${d}`;
        });

        const embed = new EmbedBuilder()
          .setTitle("💡 Live Suggestions")
          .setDescription(lines.join("\n"))
          .setColor(0x1a7a9e)
          .setFooter({ text: "Use /suggestion view id:SUG-xxx to see details" })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: 64 });
      }

      const suggestion = await getSuggestion(id.toUpperCase());
      if (!suggestion || suggestion.guildId !== interaction.guildId) {
        return interaction.reply({
          content: "⚠️ Suggestion not found.",
          flags: 64,
        });
      }

      const embed = await buildSuggestionEmbed(interaction.guildId, suggestion);
      if (suggestion.channelId && suggestion.messageId) {
        embed.addFields({
          name: "Original",
          value: `[Jump to suggestion](https://discord.com/channels/${suggestion.guildId}/${suggestion.channelId}/${suggestion.messageId})`,
          inline: false,
        });
      }
      embed.addFields({
        name: "Voter list",
        value: suggestion.showVoters ? "✅ Public" : "🔒 Private",
        inline: false,
      });

      const guildSettings = await prisma.guild.findUnique({
        where: { id: interaction.guildId },
        select: { discoreManagerRoleId: true, disAdminRoleId: true },
      });
      const components = [];
      if (
        isAdmin(interaction.member, guildSettings) &&
        suggestion.status === "PENDING"
      ) {
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`sug:approve:${suggestion.publicId}`)
              .setLabel("Approve")
              .setEmoji("✅")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`sug:deny:${suggestion.publicId}`)
              .setLabel("Deny")
              .setEmoji("❌")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`sug:delete:${suggestion.publicId}`)
              .setLabel("Delete")
              .setEmoji("🗑️")
              .setStyle(ButtonStyle.Danger),
          ),
        );
      }

      return interaction.reply({ embeds: [embed], components, flags: 64 });
    }
  },
};
