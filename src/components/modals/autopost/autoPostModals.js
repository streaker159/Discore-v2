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
  MessageFlags,
} = require("discord.js");

const {
  checkAdmin,
  checkPremiumActive,
  getPosts,
  getPost,
  getPostCount,
  createPost,
  updatePost,
  logAutoPostAction,
  calculateNextRun,
  MAX_POSTS_PER_SERVER,
  validateName,
  validateContent,
  validateEmbedTitle,
  validateEmbedDescription,
  validateFooter,
  validateTimezone,
  sendAutoPost,
} = require("../../../modules/autopost/autoPostService");
const {
  buildDashboardEmbed,
  buildPremiumLockedEmbed,
  buildPostDetailEmbed,
  buildStepEmbed,
  TRIGGER_LABELS,
} = require("../../../modules/autopost/autoPostEmbeds");
const {
  buildDashboardButtons,
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

const modalHandlers = [
  // ═══════════════════════════════════════════════════════════════════════
  // Modal: Content submitted → show trigger config
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:modal:content",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;

      const name = interaction.fields.getTextInputValue("name").trim();
      const nameErr = validateName(name);
      if (nameErr) {
        return interaction.reply({
          content: `❌ ${nameErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const session = getSession(interaction.user.id);
      const messageMode = session.messageMode || "PLAIN";

      const content =
        interaction.fields.getTextInputValue("content")?.trim() || null;
      const embedTitle =
        interaction.fields.getTextInputValue("embedTitle")?.trim() || null;
      const embedDescription =
        interaction.fields.getTextInputValue("embedDescription")?.trim() ||
        null;
      const embedFooter =
        interaction.fields.getTextInputValue("embedFooter")?.trim() || null;

      // Validate
      const contentErr = validateContent(content);
      if (contentErr) {
        return interaction.reply({
          content: `❌ ${contentErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const titleErr = validateEmbedTitle(embedTitle);
      if (titleErr) {
        return interaction.reply({
          content: `❌ ${titleErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const descErr = validateEmbedDescription(embedDescription);
      if (descErr) {
        return interaction.reply({
          content: `❌ ${descErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const footerErr = validateFooter(embedFooter);
      if (footerErr) {
        return interaction.reply({
          content: `❌ ${footerErr}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // Store in session
      setSession(interaction.user.id, {
        name,
        content,
        embedTitle,
        embedDescription,
        embedFooter,
        embedColor: "#5865F2",
      });

      const triggerType = session.triggerType;

      if (triggerType === "SCHEDULED") {
        // Show schedule config modal
        const modal = new ModalBuilder()
          .setCustomId("autopost:modal:schedule")
          .setTitle("Schedule Settings");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("recurrence")
              .setLabel(
                "Recurrence (once / daily / weekly / monthly / every_x_hours)",
              )
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("daily")
              .setValue("daily")
              .setRequired(true),
          ),
        );
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("time")
              .setLabel("Time (HH:MM, 24h format)")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("09:00")
              .setValue("09:00")
              .setRequired(true),
          ),
        );
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("timezone")
              .setLabel("Timezone (e.g., UTC, Europe/Paris)")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("UTC")
              .setValue("UTC")
              .setRequired(true),
          ),
        );
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("weekday")
              .setLabel("Weekday (1=Mon, 7=Sun, for weekly only)")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Leave blank if not weekly")
              .setRequired(false),
          ),
        );
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("intervalHours")
              .setLabel("Interval hours (for every_x_hours only)")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("24")
              .setRequired(false),
          ),
        );

        return interaction.showModal(modal);
      }

      if (triggerType === "MEMBER_JOIN") {
        // No extra config needed → go straight to preview
        return showPreview(interaction);
      }

      if (triggerType === "MENTION") {
        const modal = new ModalBuilder()
          .setCustomId("autopost:modal:mention")
          .setTitle("Mention Trigger Settings");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("targetId")
              .setLabel("Role ID or User ID to watch for")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Paste the role or user ID")
              .setRequired(true),
          ),
        );
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("cooldown")
              .setLabel("Cooldown in seconds (30-86400)")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("300")
              .setValue("300")
              .setRequired(true),
          ),
        );

        return interaction.showModal(modal);
      }

      if (triggerType === "KEYWORD") {
        const modal = new ModalBuilder()
          .setCustomId("autopost:modal:keyword")
          .setTitle("Keyword Trigger Settings");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("phrase")
              .setLabel("Keyword/phrase (2-100 chars)")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("e.g., how do I apply")
              .setMinLength(2)
              .setMaxLength(100)
              .setRequired(true),
          ),
        );
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("matchType")
              .setLabel("Match type: CONTAINS or EXACT")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("CONTAINS")
              .setValue("CONTAINS")
              .setRequired(true),
          ),
        );
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("cooldown")
              .setLabel("Cooldown in seconds (30-86400)")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("300")
              .setValue("300")
              .setRequired(true),
          ),
        );

        return interaction.showModal(modal);
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Modal: Schedule config → preview
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:modal:schedule",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;

      const recurrence = interaction.fields
        .getTextInputValue("recurrence")
        .trim()
        .toLowerCase();
      const time = interaction.fields.getTextInputValue("time").trim();
      const timezone = interaction.fields.getTextInputValue("timezone").trim();
      const weekday =
        interaction.fields.getTextInputValue("weekday")?.trim() || null;
      const intervalHours =
        interaction.fields.getTextInputValue("intervalHours")?.trim() || null;

      // Validate
      const validRecurrences = [
        "once",
        "daily",
        "weekly",
        "monthly",
        "every_x_hours",
      ];
      if (!validRecurrences.includes(recurrence)) {
        return interaction.reply({
          content: `❌ Invalid recurrence. Must be one of: ${validRecurrences.join(", ")}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!/^\d{1,2}:\d{2}$/.test(time)) {
        return interaction.reply({
          content: "❌ Time must be in HH:MM format.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!validateTimezone(timezone)) {
        return interaction.reply({
          content: `❌ Invalid timezone: ${timezone}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const scheduleConfig = {
        recurrence,
        time,
      };

      if (recurrence === "weekly" && weekday) {
        const wd = parseInt(weekday, 10);
        if (isNaN(wd) || wd < 1 || wd > 7) {
          return interaction.reply({
            content: "❌ Weekday must be 1-7 (Monday=1, Sunday=7).",
            flags: MessageFlags.Ephemeral,
          });
        }
        scheduleConfig.weekday = wd;
      }

      if (recurrence === "every_x_hours" && intervalHours) {
        const ih = parseInt(intervalHours, 10);
        if (isNaN(ih) || ih < 1 || ih > 168) {
          return interaction.reply({
            content: "❌ Interval hours must be 1-168.",
            flags: MessageFlags.Ephemeral,
          });
        }
        scheduleConfig.intervalHours = ih;
      }

      setSession(interaction.user.id, {
        scheduleConfig,
        timezone,
      });

      return showPreview(interaction);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Modal: Mention config → preview
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:modal:mention",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;

      const targetId = interaction.fields.getTextInputValue("targetId").trim();
      const cooldown = parseInt(
        interaction.fields.getTextInputValue("cooldown").trim(),
        10,
      );

      if (!/^\d+$/.test(targetId)) {
        return interaction.reply({
          content: "❌ Target ID must be a numeric Discord ID.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (isNaN(cooldown) || cooldown < 30 || cooldown > 86400) {
        return interaction.reply({
          content: "❌ Cooldown must be 30-86400 seconds.",
          flags: MessageFlags.Ephemeral,
        });
      }

      setSession(interaction.user.id, {
        triggerConfig: { targetId },
        cooldownSeconds: cooldown,
      });

      return showPreview(interaction);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Modal: Keyword config → preview
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:modal:keyword",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;

      const phrase = interaction.fields.getTextInputValue("phrase").trim();
      const matchType = interaction.fields
        .getTextInputValue("matchType")
        .trim()
        .toUpperCase();
      const cooldown = parseInt(
        interaction.fields.getTextInputValue("cooldown").trim(),
        10,
      );

      if (phrase.length < 2 || phrase.length > 100) {
        return interaction.reply({
          content: "❌ Phrase must be 2-100 characters.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!["CONTAINS", "EXACT"].includes(matchType)) {
        return interaction.reply({
          content: "❌ Match type must be CONTAINS or EXACT.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (isNaN(cooldown) || cooldown < 30 || cooldown > 86400) {
        return interaction.reply({
          content: "❌ Cooldown must be 30-86400 seconds.",
          flags: MessageFlags.Ephemeral,
        });
      }

      setSession(interaction.user.id, {
        triggerConfig: { phrase, matchType },
        cooldownSeconds: cooldown,
      });

      return showPreview(interaction);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Edit content modal → show form with existing values
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:edit:content",
    async execute(interaction) {
      // This is a button, hence in selects file — but handling here for consistency
    },
  },
];

// ── Preview and save flow ─────────────────────────────────────────────────

async function showPreview(interaction) {
  const session = getSession(interaction.user.id);

  const embed = new EmbedBuilder()
    .setTitle("📋 Review Your Auto Post")
    .setDescription(
      "Review the details before saving.\n\n**Use the buttons below:**",
    )
    .setColor("#5865F2")
    .addFields(
      { name: "Name", value: session.name || "N/A", inline: true },
      {
        name: "Trigger",
        value: TRIGGER_LABELS[session.triggerType] || "N/A",
        inline: true,
      },
      {
        name: "Channel",
        value: session.channelId ? `<#${session.channelId}>` : "N/A",
        inline: true,
      },
      {
        name: "Message Mode",
        value: session.messageMode || "PLAIN",
        inline: true,
      },
    );

  if (session.content) {
    embed.addFields({
      name: "Content Preview",
      value:
        session.content.length > 300
          ? session.content.substring(0, 300) + "..."
          : session.content,
      inline: false,
    });
  }

  if (session.embedTitle) {
    embed.addFields({
      name: "Embed Title",
      value: session.embedTitle,
      inline: false,
    });
  }

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("autopost:save")
      .setLabel("Save")
      .setEmoji("💾")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("autopost:save_and_test")
      .setLabel("Save & Test")
      .setEmoji("🧪")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("autopost:refresh")
      .setLabel("Cancel")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    embeds: [embed],
    components: [buttons],
    flags: MessageFlags.Ephemeral,
  });
}

// Extend the module exports with the save/test buttons
const saveButtonsModule = [
  // ═══════════════════════════════════════════════════════════════════════
  // Save button
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:save",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      const session = getSession(interaction.user.id);

      if (!session.name || !session.triggerType || !session.channelId) {
        return interaction.update({
          content: "❌ Missing required fields. Please start again.",
          embeds: [],
          components: [],
        });
      }

      await interaction.deferUpdate().catch(() => {});

      const nextRun =
        session.triggerType === "SCHEDULED"
          ? calculateNextRun({
              triggerType: "SCHEDULED",
              scheduleConfig: session.scheduleConfig,
              timezone: session.timezone,
              lastRunAt: null,
            })
          : null;

      try {
        const post = await createPost(interaction.guildId, {
          name: session.name,
          triggerType: session.triggerType,
          channelId: session.channelId,
          messageMode: session.messageMode || "PLAIN",
          content: session.content || null,
          embedTitle: session.embedTitle || null,
          embedDescription: session.embedDescription || null,
          embedFooter: session.embedFooter || null,
          embedColor: session.embedColor || null,
          triggerConfig: session.triggerConfig || null,
          scheduleConfig: session.scheduleConfig || null,
          timezone: session.timezone || "UTC",
          nextRunAt: nextRun,
          cooldownSeconds: session.cooldownSeconds || 300,
          createdById: interaction.user.id,
        });

        await logAutoPostAction(
          interaction.guildId,
          "CREATE",
          interaction.user.id,
          { postId: post.id, postName: post.name },
        );
        clearSession(interaction.user.id);

        const embed = await buildDashboardEmbed(
          interaction.guildId,
          interaction.guild,
        );

        await interaction.editReply({
          content: `✅ **${session.name}** created successfully!`,
          embeds: [embed],
          components: buildDashboardButtons(),
        });
      } catch (err) {
        await interaction.editReply({
          content: `❌ Failed to create: ${err.message}`,
          embeds: [],
          components: [],
        });
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Save & Test button
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "autopost:save_and_test",
    async execute(interaction) {
      if (!(await requireAccess(interaction))) return;
      const session = getSession(interaction.user.id);

      if (!session.name || !session.triggerType || !session.channelId) {
        return interaction.update({
          content: "❌ Missing required fields. Please start again.",
          embeds: [],
          components: [],
        });
      }

      await interaction.deferUpdate().catch(() => {});

      const nextRun =
        session.triggerType === "SCHEDULED"
          ? calculateNextRun({
              triggerType: "SCHEDULED",
              scheduleConfig: session.scheduleConfig,
              timezone: session.timezone,
              lastRunAt: null,
            })
          : null;

      try {
        const post = await createPost(interaction.guildId, {
          name: session.name,
          triggerType: session.triggerType,
          channelId: session.channelId,
          messageMode: session.messageMode || "PLAIN",
          content: session.content || null,
          embedTitle: session.embedTitle || null,
          embedDescription: session.embedDescription || null,
          embedFooter: session.embedFooter || null,
          embedColor: session.embedColor || null,
          triggerConfig: session.triggerConfig || null,
          scheduleConfig: session.scheduleConfig || null,
          timezone: session.timezone || "UTC",
          nextRunAt: nextRun,
          cooldownSeconds: session.cooldownSeconds || 300,
          createdById: interaction.user.id,
        });

        await logAutoPostAction(
          interaction.guildId,
          "CREATE",
          interaction.user.id,
          { postId: post.id, postName: post.name },
        );
        clearSession(interaction.user.id);

        // Test send
        const testResult = await sendAutoPost(
          interaction.client,
          post,
          {
            serverName: interaction.guild.name,
            memberCount: String(interaction.guild.memberCount),
          },
          true,
        );

        const embed = await buildDashboardEmbed(
          interaction.guildId,
          interaction.guild,
        );

        await interaction.editReply({
          content: `✅ **${session.name}** created!${testResult.success ? ` Test sent to <#${post.channelId}>.` : ` Test failed: ${testResult.error}`}`,
          embeds: [embed],
          components: buildDashboardButtons(),
        });
      } catch (err) {
        await interaction.editReply({
          content: `❌ Failed: ${err.message}`,
          embeds: [],
          components: [],
        });
      }
    },
  },
];

// Combine all
module.exports = [...modalHandlers, ...saveButtonsModule];
