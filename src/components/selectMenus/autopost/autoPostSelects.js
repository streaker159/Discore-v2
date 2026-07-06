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
  MessageFlags,
} = require("discord.js");
const {
  checkAdmin,
  checkPremiumActive,
  getPosts,
  getPost,
  getPostCount,
  createPost,
  deletePost,
  pausePost,
  resumePost,
  sendAutoPost,
  updatePost,
  calculateNextRun,
  logAutoPostAction,
  MAX_POSTS_PER_SERVER,
  validateTimezone,
} = require("../../../modules/autopost/autoPostService");
const {
  buildDashboardEmbed,
  buildPremiumLockedEmbed,
  buildPostDetailEmbed,
  buildPostListEmbed,
  buildStepEmbed,
  buildPreviewEmbed,
  TRIGGER_LABELS,
  TRIGGER_EMOJIS,
  STATUS_LABELS,
  RECURRENCE_LABELS,
} = require("../../../modules/autopost/autoPostEmbeds");

const {
  getSession,
  setSession,
  clearSession,
} = require("../../../modules/autopost/autoPostSessions");

// ── Helpers ──────────────────────────────────────────────────────────────

async function requireAccess(interaction) {
  if (!(await checkAdmin(interaction))) {
    await interaction.reply({
      content: "🔒 You need **Manage Guild** or **Administrator** permission.",
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  const isPremium = await checkPremiumActive(interaction.guildId);
  if (!isPremium) {
    await interaction.reply({
      embeds: [buildPremiumLockedEmbed()],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

function backButton() {
  return new ButtonBuilder()
    .setCustomId("autopost:refresh")
    .setLabel("Cancel / Back")
    .setEmoji("⬅️")
    .setStyle(ButtonStyle.Secondary);
}

module.exports = [
  // ═══════════════════════════════════════════════════════════════════════
  // Create: Trigger type selected → show channel selector
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:create:trigger",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      const triggerType = interaction.values[0];
      setSession(interaction.user.id, { triggerType });

      const embed = buildStepEmbed(
        2,
        "Select Target Channel",
        `**Trigger:** ${TRIGGER_LABELS[triggerType]}\n\nSelect the channel where this auto post will be sent.`,
      );

      const channelSelect = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId("autopost:create:channel")
          .setPlaceholder("Choose a channel...")
          .setChannelTypes([
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
          ]),
      );

      await interaction.update({
        embeds: [embed],
        components: [channelSelect],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Create: Channel selected → show message mode select
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:create:channel",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      const channelId = interaction.values[0];
      // Validate the channel exists and bot has permissions
      let channel;
      try {
        channel = await interaction.guild.channels.fetch(channelId);
      } catch {
        return interaction.update({
          content: "❌ Channel not found. Please try again.",
          embeds: [],
          components: [],
        });
      }

      const perms = channel.permissionsFor(interaction.guild.members.me);
      const missing = [];
      if (!perms?.has("ViewChannel")) missing.push("View Channel");
      if (!perms?.has("SendMessages")) missing.push("Send Messages");
      if (!perms?.has("EmbedLinks") && interaction.values?.[0])
        missing.push("Embed Links");

      if (missing.length > 0) {
        return interaction.update({
          content: `⚠️ **Permission Warning:**\nI'm missing these permissions in ${channel}:\n${missing.map((m) => `• ${m}`).join("\n")}\n\nThe auto post may fail to send. Please check permissions.`,
          embeds: [],
          components: [
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("autopost:create:channel")
                .setPlaceholder("Choose another channel...")
                .setChannelTypes([
                  ChannelType.GuildText,
                  ChannelType.GuildAnnouncement,
                ]),
            ),
          ],
        });
      }

      setSession(interaction.user.id, { channelId });

      const embed = buildStepEmbed(
        3,
        "Choose Message Mode",
        `**Channel:** <#${channelId}>\n\nSelect how your auto post should look.`,
        "#5865F2",
      );

      const modeSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("autopost:create:mode")
          .setPlaceholder("Choose message mode...")
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel("Plain Text")
              .setDescription("Simple text message")
              .setValue("PLAIN")
              .setEmoji("📝"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Embed")
              .setDescription("Rich embed message")
              .setValue("EMBED")
              .setEmoji("📋"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Message + Embed")
              .setDescription("Plain text with an embed below")
              .setValue("BOTH")
              .setEmoji("✨"),
          ),
      );

      await interaction.update({
        embeds: [embed],
        components: [modeSelect],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Create: Message mode selected → open content modal
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:create:mode",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      const messageMode = interaction.values[0];
      setSession(interaction.user.id, { messageMode });

      const session = getSession(interaction.user.id);

      // Show a modal for content
      const modal = new ModalBuilder()
        .setCustomId("autopost:modal:content")
        .setTitle("Auto Post Content");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("name")
            .setLabel("Auto Post Name (1-50 chars)")
            .setMaxLength(50)
            .setMinLength(1)
            .setPlaceholder("e.g., Daily Announcement")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );

      if (messageMode === "PLAIN" || messageMode === "BOTH") {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("content")
              .setLabel("Message Content")
              .setMaxLength(1900)
              .setPlaceholder("Use {serverName}, {memberCount}, etc.")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(messageMode === "PLAIN"),
          ),
        );
      }

      if (messageMode === "EMBED" || messageMode === "BOTH") {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("embedTitle")
              .setLabel("Embed Title (max 256 chars)")
              .setMaxLength(256)
              .setPlaceholder("Optional title for the embed")
              .setStyle(TextInputStyle.Short)
              .setRequired(false),
          ),
        );
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("embedDescription")
              .setLabel("Embed Description (max 4000)")
              .setMaxLength(4000)
              .setPlaceholder("Optional description")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false),
          ),
        );
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("embedFooter")
              .setLabel("Embed Footer (max 2048, optional)")
              .setMaxLength(2048)
              .setPlaceholder("Optional footer text")
              .setStyle(TextInputStyle.Short)
              .setRequired(false),
          ),
        );
      }

      await interaction.showModal(modal);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // View post detail
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:select:view",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      const postId = interaction.values[0];
      const post = await getPost(postId, interaction.guildId);

      if (!post) {
        return interaction.update({
          content: "❌ Post not found.",
          embeds: [],
          components: [],
        });
      }

      const embed = buildPostDetailEmbed(post, interaction.guild);

      await interaction.update({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("autopost:list")
              .setLabel("Back to List")
              .setEmoji("⬅️")
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId("autopost:refresh")
              .setLabel("Dashboard")
              .setEmoji("🏠")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Edit post → show edit options
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:select:edit",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      const postId = interaction.values[0];
      const post = await getPost(postId, interaction.guildId);

      if (!post) {
        return interaction.update({
          content: "❌ Post not found.",
          embeds: [],
          components: [],
        });
      }

      setSession(interaction.user.id, { editingPostId: postId });

      const embed = buildPostDetailEmbed(post, interaction.guild);

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("autopost:edit:content")
          .setLabel("Edit Content")
          .setEmoji("📝")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("autopost:edit:channel")
          .setLabel("Change Channel")
          .setEmoji("📢")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("autopost:refresh")
          .setLabel("Back")
          .setEmoji("⬅️")
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.update({
        embeds: [embed],
        components: [buttons],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Pause / Resume action
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:select:pause_resume",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      const postId = interaction.values[0];
      const post = await getPost(postId, interaction.guildId);

      if (!post) {
        return interaction.update({
          content: "❌ Post not found.",
          embeds: [],
          components: [],
        });
      }

      if (post.status === "ACTIVE") {
        await pausePost(postId, interaction.guildId, "Manually paused");
        await logAutoPostAction(
          interaction.guildId,
          "PAUSE",
          interaction.user.id,
          { postId, postName: post.name },
        );
        await interaction.update({
          content: `⏸️ **${post.name}** has been paused.`,
          embeds: [],
          components: [],
        });
      } else {
        await resumePost(postId, interaction.guildId);
        await logAutoPostAction(
          interaction.guildId,
          "RESUME",
          interaction.user.id,
          { postId, postName: post.name },
        );
        await interaction.update({
          content: `▶️ **${post.name}** has been resumed.`,
          embeds: [],
          components: [],
        });
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Delete confirmation
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:select:delete",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      const postId = interaction.values[0];
      const post = await getPost(postId, interaction.guildId);

      if (!post) {
        return interaction.update({
          content: "❌ Post not found.",
          embeds: [],
          components: [],
        });
      }

      setSession(interaction.user.id, { deletingPostId: postId });

      const embed = new EmbedBuilder()
        .setTitle("🗑️ Confirm Deletion")
        .setDescription(
          `Are you sure you want to delete **${post.name}**?\n\nThis cannot be undone.`,
        )
        .setColor("#E74C3C");

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("autopost:delete:confirm")
          .setLabel("Confirm Delete")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("autopost:refresh")
          .setLabel("Cancel")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.update({
        embeds: [embed],
        components: [buttons],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Confirm delete
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:delete:confirm",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      const session = getSession(interaction.user.id);
      const postId = session.deletingPostId;

      if (!postId) {
        return interaction.update({
          content: "❌ No post selected for deletion. Please try again.",
          embeds: [],
          components: [],
        });
      }

      const post = await getPost(postId, interaction.guildId);
      const postName = post?.name || "Unknown";
      await deletePost(postId, interaction.guildId);
      await logAutoPostAction(
        interaction.guildId,
        "DELETE",
        interaction.user.id,
        { postId, postName },
      );
      clearSession(interaction.user.id);

      const embed = await buildDashboardEmbed(
        interaction.guildId,
        interaction.guild,
      );
      const {
        buildDashboardButtons,
      } = require("../../buttons/autopost/autoPostButtons");

      await interaction.update({
        content: `🗑️ **${postName}** has been deleted.`,
        embeds: [embed],
        components: buildDashboardButtons(),
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Test send: execute test
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:select:test",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      const postId = interaction.values[0];
      const post = await getPost(postId, interaction.guildId);

      if (!post) {
        return interaction.update({
          content: "❌ Post not found.",
          embeds: [],
          components: [],
        });
      }

      await interaction.deferUpdate().catch(() => {});

      const result = await sendAutoPost(
        interaction.client,
        post,
        {
          serverName: interaction.guild.name,
          memberCount: String(interaction.guild.memberCount),
        },
        true,
      );

      if (result.success) {
        await interaction.editReply({
          content: `🧪 Test sent successfully to <#${post.channelId}>!`,
          embeds: [],
          components: [],
        });
      } else {
        await interaction.editReply({
          content: `❌ Test failed: ${result.error}`,
          embeds: [],
          components: [],
        });
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Edit: Change channel → show channel selector
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:edit:channel",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      const channelSelect = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId("autopost:edit:channel:select")
          .setPlaceholder("Choose new channel...")
          .setChannelTypes([
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
          ]),
      );

      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("📢 Change Target Channel")
            .setDescription("Select the new channel for this auto post.")
            .setColor("#5865F2"),
        ],
        components: [channelSelect],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Edit: Channel selected → update
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:edit:channel:select",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      const channelId = interaction.values[0];
      const session = getSession(interaction.user.id);
      const postId = session.editingPostId;

      if (!postId) {
        return interaction.update({
          content: "❌ No post being edited.",
          embeds: [],
          components: [],
        });
      }

      await updatePost(postId, interaction.guildId, { channelId });
      await logAutoPostAction(
        interaction.guildId,
        "EDIT_CHANNEL",
        interaction.user.id,
        { postId, channelId },
      );

      const post = await getPost(postId, interaction.guildId);

      await interaction.update({
        content: `✅ Channel updated to <#${channelId}>.`,
        embeds: [buildPostDetailEmbed(post, interaction.guild)],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("autopost:edit:content")
              .setLabel("Edit Content")
              .setEmoji("📝")
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId("autopost:refresh")
              .setLabel("Dashboard")
              .setEmoji("🏠")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
    },
  },
];
