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
const prisma = require("../../../lib/prisma");
const {
  checkAdmin,
  checkPremiumActive,
  getPosts,
  getPost,
  getPostCount,
  createPost,
  updatePost,
  deletePost,
  pausePost,
  resumePost,
  sendAutoPost,
  calculateNextRun,
  logAutoPostAction,
  MAX_POSTS_PER_SERVER,
  VALID_TRIGGER_TYPES,
  VALID_MESSAGE_MODES,
  validateName,
  validateContent,
  validateEmbedTitle,
  validateEmbedDescription,
  validateFooter,
  validateTimezone,
} = require("../../../modules/autopost/autoPostService");
const {
  buildDashboardEmbed,
  buildPremiumLockedEmbed,
  buildPostListEmbed,
  buildStepEmbed,
  buildPlaceholderHelpEmbed,
  TRIGGER_LABELS,
  TRIGGER_EMOJIS,
} = require("../../../modules/autopost/autoPostEmbeds");

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
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("Upgrade / Manage Premium")
            .setStyle(ButtonStyle.Link)
            .setURL(
              "https://discord.com/application-directory/1095716768077590568",
            ),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

// ── Build list select menu ────────────────────────────────────────────────

function buildPostSelectMenu(posts, customId) {
  const options = posts.map((p) => {
    const status =
      p.status === "ACTIVE"
        ? "[Active]"
        : p.status === "PAUSED"
          ? "[Paused]"
          : "[Failed]";
    return new StringSelectMenuOptionBuilder()
      .setLabel(p.name.substring(0, 100))
      .setDescription(
        `${status} ${TRIGGER_LABELS[p.triggerType] || p.triggerType}`,
      )
      .setValue(p.id)
      .setEmoji(TRIGGER_EMOJIS[p.triggerType] || "📌");
  });

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Select an auto post...")
      .addOptions(options.slice(0, 25)), // Discord limit 25
  );
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = [
  // ═══════════════════════════════════════════════════════════════════════
  // Dashboard: Refresh
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:refresh",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      await interaction.deferUpdate().catch(() => {});
      const embed = await buildDashboardEmbed(
        interaction.guildId,
        interaction.guild,
      );
      const {
        buildDashboardButtons,
      } = require("../../../modules/autopost/autoPostEmbeds");

      await interaction.editReply({
        embeds: [embed],
        components: buildDashboardButtons(),
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Dashboard: Help
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:help",
    async execute(interaction) {
      const embed = new EmbedBuilder()
        .setTitle("📣 Auto Posts — Help & Trigger Guide")
        .setColor("#5865F2")
        .setDescription(
          "### 🔰 Getting Started\n" +
            "Auto Posts let you automate messages in your server based on triggers.\n\n" +
            "### 📋 Trigger Types\n" +
            "**⏰ Scheduled** — Send at specific times (daily, weekly, monthly, every X hours, or once)\n" +
            "**👋 Member Join** — Send when a new member joins\n" +
            "**💬 Mention** — Send when a configured role/user/channel is mentioned\n" +
            "**🔑 Keyword** — Send when a phrase appears in chat\n\n" +
            "### 📝 Placeholders\n" +
            "`{user}` `{userMention}` `{username}` `{displayName}` `{serverName}` `{memberCount}` `{channel}` `{date}` `{time}` `{trigger}`\n\n" +
            "### 🛡️ Safety\n" +
            "• Auto post messages never ping `@everyone` or `@here`\n" +
            "• Cooldowns prevent spam (default: 5 min for triggers)\n" +
            "• Bot messages and self-posts are ignored\n" +
            "• Auto-pauses after 3 consecutive failures\n\n" +
            "### 🎮 Usage\n" +
            "1. Click **➕ Create** to set up a new auto post\n" +
            "2. Follow the step-by-step setup\n" +
            "3. Use **🧪 Test Send** to preview\n" +
            "4. Manage with pause, resume, edit, or delete\n\n" +
            "### ⚠️ Limits\n" +
            "• Max 5 auto posts per server\n" +
            "• Premium-only feature",
        )
        .setFooter({ text: "Discore Auto Posts • Premium" });
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Create: Start flow → trigger type select
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:create",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;

      const count = await getPostCount(interaction.guildId);
      if (count >= MAX_POSTS_PER_SERVER) {
        return interaction.reply({
          content: `⚠️ This server already has ${MAX_POSTS_PER_SERVER} active Auto Posts. Pause or delete one before creating another.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = buildStepEmbed(
        1,
        "Choose Trigger Type",
        "Select what will trigger this auto post to send.",
      );

      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("autopost:create:trigger")
          .setPlaceholder("Choose a trigger type...")
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel("Scheduled Time")
              .setDescription(
                "Send at specific times (daily, weekly, monthly...)",
              )
              .setValue("SCHEDULED")
              .setEmoji("⏰"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Member Join")
              .setDescription("Send when a new member joins the server")
              .setValue("MEMBER_JOIN")
              .setEmoji("👋"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Mention Trigger")
              .setDescription("Send when a role/user/channel is mentioned")
              .setValue("MENTION")
              .setEmoji("💬"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Keyword/Phrase")
              .setDescription("Send when a keyword/phrase appears in chat")
              .setValue("KEYWORD")
              .setEmoji("🔑"),
          ),
      );

      await interaction.reply({
        embeds: [embed],
        components: [selectRow],
        flags: MessageFlags.Ephemeral,
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // List
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:list",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      await interaction.deferUpdate().catch(() => {});
      const posts = await getPosts(interaction.guildId);
      const embed = buildPostListEmbed(posts, interaction.guild);

      if (posts.length === 0) {
        return interaction.editReply({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("autopost:refresh")
                .setLabel("Back to Dashboard")
                .setEmoji("⬅️")
                .setStyle(ButtonStyle.Secondary),
            ),
          ],
        });
      }

      const selectRow = buildPostSelectMenu(posts, "autopost:select:view");

      await interaction.editReply({
        embeds: [embed],
        components: [selectRow],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Edit: Show post selection
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:edit",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      await interaction.deferUpdate().catch(() => {});
      const posts = await getPosts(interaction.guildId);

      if (posts.length === 0) {
        return interaction.editReply({
          content: "No auto posts to edit.",
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("autopost:refresh")
                .setLabel("Back to Dashboard")
                .setEmoji("⬅️")
                .setStyle(ButtonStyle.Secondary),
            ),
          ],
        });
      }

      const selectRow = buildPostSelectMenu(posts, "autopost:select:edit");

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✏️ Edit Auto Post")
            .setDescription("Select an auto post to edit.")
            .setColor("#5865F2"),
        ],
        components: [selectRow],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Pause/Resume: Show post selection
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:pause_resume",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      await interaction.deferUpdate().catch(() => {});
      const posts = await getPosts(interaction.guildId);

      if (posts.length === 0) {
        return interaction.editReply({
          content: "No auto posts to manage.",
        });
      }

      const selectRow = buildPostSelectMenu(
        posts,
        "autopost:select:pause_resume",
      );

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("⏸️ Pause / Resume Auto Post")
            .setDescription(
              "Select an auto post to toggle its status.\n\n🟢 Active → ⏸️ Pause\n🟡 Paused → ▶️ Resume",
            )
            .setColor("#5865F2"),
        ],
        components: [selectRow],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Delete: Show post selection
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:delete_post",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      await interaction.deferUpdate().catch(() => {});
      const posts = await getPosts(interaction.guildId);

      if (posts.length === 0) {
        return interaction.editReply({
          content: "No auto posts to delete.",
        });
      }

      const selectRow = buildPostSelectMenu(posts, "autopost:select:delete");

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🗑️ Delete Auto Post")
            .setDescription(
              "Select an auto post to delete. **This cannot be undone.**",
            )
            .setColor("#E74C3C"),
        ],
        components: [selectRow],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Test Send: Show post selection
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:test_send",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      await interaction.deferUpdate().catch(() => {});
      const posts = await getPosts(interaction.guildId);

      if (posts.length === 0) {
        return interaction.editReply({
          content: "No auto posts to test.",
        });
      }

      const selectRow = buildPostSelectMenu(posts, "autopost:select:test");

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🧪 Test Send Auto Post")
            .setDescription(
              "Select an auto post to test send. The post will be sent to its configured channel with a test label.",
            )
            .setColor("#5865F2"),
        ],
        components: [selectRow],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // View Placeholders
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:placeholders",
    async execute(interaction) {
      const embed = buildPlaceholderHelpEmbed();
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    },
  },
];
