"use strict";

const {
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const {
  getPremiumStatus,
  getPremiumSource,
  getAiCreditStatus,
  updateAiSettings,
  getAiAdminSettings,
} = require("../../../modules/premium/service");

const PREMIUM_SKU = process.env.DISCORD_PREMIUM_SKU_ID;
const AI_CREDITS_SKU = process.env.DISCORD_AI_CREDITS_SKU_ID;

function isAdmin(member) {
  if (member.permissions?.has("ManageGuild")) return true;
  return false;
}

module.exports = [
  // ── Manage premium ──────────────────────────────────────────────────────
  {
    customIdPrefix: "premium:manage",
    async execute(interaction) {
      if (!PREMIUM_SKU) {
        return interaction.reply({
          content:
            "⚠️ This purchase option is not configured yet. Please contact the bot owner.",
          flags: 64,
        });
      }
      const embed = new EmbedBuilder()
        .setTitle("💎 Upgrade to Discore Premium")
        .setColor(0x1a7a9e)
        .setDescription(
          "**Premium unlocks:**\n" +
            "• Up to 50 live scoreboards\n" +
            "• Archives and scoreboard merging\n" +
            "• Premium branding\n" +
            "• Advanced setup tools\n" +
            "• 2,000 monthly AI credits\n\n" +
            "**How to subscribe:**\n" +
            "1. Open this server in Discord.\n" +
            "2. Click the server name at the top-left.\n" +
            "3. Open **Server Apps / App Directory**.\n" +
            "4. Find **Discore Official**.\n" +
            "5. Open the **Store / Premium** section.\n" +
            "6. Select **Discore Premium**.\n\n" +
            "After subscribing, press **Refresh Status** in `/premium`.",
        )
        .setFooter({ text: "Powered by Discore" })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: 64 });
    },
  },

  // ── Buy AI credits ──────────────────────────────────────────────────────
  {
    customIdPrefix: "premium:buy_ai_credits",
    async execute(interaction) {
      if (!AI_CREDITS_SKU) {
        return interaction.reply({
          content:
            "⚠️ This purchase option is not configured yet. Please contact the bot owner.",
          flags: 64,
        });
      }
      const embed = new EmbedBuilder()
        .setTitle("🤖 Buy 3,000 AI Credits")
        .setColor(0x1a7a9e)
        .setDescription(
          "AI Credits are a one-time purchase for this server.\n" +
            "Each pack adds **3,000 extra AI credits**.\n\n" +
            "**How to buy:**\n" +
            "1. Open this server in Discord.\n" +
            "2. Click the server name at the top-left.\n" +
            "3. Open **Server Apps / App Directory**.\n" +
            "4. Find **Discore Official**.\n" +
            "5. Open the **Store / Premium** section.\n" +
            "6. Select **AI Credits**.\n\n" +
            "After purchase, press **Refresh Status** in `/premium`.",
        )
        .setFooter({ text: "Powered by Discore" })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: 64 });
    },
  },

  // ── Refresh ──────────────────────────────────────────────────────────────
  {
    customIdPrefix: "premium:refresh",
    async execute(interaction) {
      await interaction.deferUpdate().catch(() => {});
      const [status, aiCredits, aiSettings] = await Promise.all([
        getPremiumStatus(interaction.guildId),
        getAiCreditStatus(interaction.guildId),
        getAiAdminSettings(interaction.guildId),
      ]);
      const premium = status.premium;
      const limits = status.limits;
      const fields = [
        {
          name: "Status",
          value: status.isActive ? "✅ Premium Active" : "Free",
          inline: true,
        },
        {
          name: "Current Package",
          value: status.isActive ? "Discore Premium" : "None",
          inline: true,
        },
        { name: "Source", value: getPremiumSource(premium), inline: true },
        {
          name: "Live Scoreboards",
          value: `${limits.liveScoreboards} limit`,
          inline: true,
        },
        {
          name: "Monthly AI Allowance",
          value: aiCredits.monthlyAllowance.toLocaleString(),
          inline: true,
        },
        {
          name: "AI Credits Used This Month",
          value: aiCredits.monthlyUsed.toLocaleString(),
          inline: true,
        },
      ];
      if (status.isActive) {
        fields.push(
          {
            name: "Monthly AI Remaining",
            value: aiCredits.monthlyRemaining.toLocaleString(),
            inline: true,
          },
          {
            name: "Extra Purchased AI Credits",
            value: aiCredits.extraCredits.toLocaleString(),
            inline: true,
          },
          {
            name: "Total AI Credits Available",
            value: aiCredits.totalAvailable.toLocaleString(),
            inline: true,
          },
        );
        if (aiCredits.monthlyPeriodEnd) {
          fields.push({
            name: "Next Monthly Refill",
            value: `<t:${Math.floor(new Date(aiCredits.monthlyPeriodEnd).getTime() / 1000)}:R>`,
            inline: true,
          });
        }
        if (status.isLifetime)
          fields.push({ name: "Type", value: "🌟 Lifetime", inline: true });
      }

      // ── AI Feature Status ──────────────────────────────────────────
      const aiStatusLines = [
        `AI Translation: ${aiSettings.aiTranslationEnabled ? "✅ Enabled" : "❌ Disabled"}`,
        `AI Welcome: ${aiSettings.aiWelcomeEnabled ? "✅ Enabled" : "❌ Disabled"}`,
      ];
      if (aiSettings.aiWelcomeEnabled && !aiSettings.aiWelcomeChannelId) {
        aiStatusLines.push(
          "⚠️ AI Welcome has no channel set. Use `/server channel` to configure.",
        );
      }
      fields.push({
        name: "🧠 AI Feature Status",
        value: aiStatusLines.join("\n"),
        inline: false,
      });

      const embed = new EmbedBuilder()
        .setTitle("💎 Discore Premium")
        .setColor(0x1a7a9e)
        .setFooter({ text: interaction.guild.name })
        .setTimestamp()
        .addFields(fields);

      const {
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
      } = require("discord.js");
      const buttons = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("premium:manage")
            .setLabel("Upgrade / Manage Premium")
            .setEmoji("💎")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("premium:buy_ai_credits")
            .setLabel("Buy 3,000 AI Credits")
            .setEmoji("🤖")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("premium:refresh")
            .setLabel("Refresh Status")
            .setEmoji("🔄")
            .setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("premium:ai_usage")
            .setLabel("AI Usage Limits")
            .setEmoji("⚙️")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("premium:ai_features")
            .setLabel("AI Feature Toggles")
            .setEmoji("🧠")
            .setStyle(ButtonStyle.Primary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("premium:usage")
            .setLabel("Usage Details")
            .setEmoji("📊")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];

      await interaction.followUp({
        content:
          "🔄 Premium status refreshed. If you just purchased, Discord may take a moment to sync.",
        flags: 64,
      });
      return interaction.editReply({ embeds: [embed], components: buttons });
    },
  },

  // ── AI usage limits modal ────────────────────────────────────────────────
  {
    customIdPrefix: "premium:ai_usage",
    async execute(interaction) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content:
            "🚫 You need Manage Server permission to change AI settings.",
          flags: 64,
        });
      }
      const settings = await getAiAdminSettings(interaction.guildId);
      const modal = new ModalBuilder()
        .setCustomId("premium_ai_usage_modal:")
        .setTitle("AI Usage Limits");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("serverDailyLimit")
            .setLabel("Server daily AI limit (0 = unlimited)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(settings.serverDailyLimit)),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("perUserDailyLimit")
            .setLabel("Per-user daily AI limit (0 = unlimited)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(settings.perUserDailyLimit)),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("cooldownSeconds")
            .setLabel("Cooldown in seconds (0 = none)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(settings.cooldownSeconds)),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("aiEnabled")
            .setLabel("AI enabled? (true/false)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(settings.aiEnabled)),
        ),
      );
      return interaction.showModal(modal);
    },
  },

  // ── AI feature toggles modal ──────────────────────────────────────────────
  {
    customIdPrefix: "premium:ai_features",
    async execute(interaction) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content:
            "🚫 You need Manage Server permission to change AI settings.",
          flags: 64,
        });
      }
      const settings = await getAiAdminSettings(interaction.guildId);
      const modal = new ModalBuilder()
        .setCustomId("premium_ai_features_modal:")
        .setTitle("AI Feature Toggles");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("aiTranslationEnabled")
            .setLabel("AI translation enabled? (true/false)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(settings.aiTranslationEnabled ?? false)),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("aiWelcomeEnabled")
            .setLabel("AI welcome enabled? (true/false)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(settings.aiWelcomeEnabled ?? false)),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("aiWelcomeInstructions")
            .setLabel("Welcome style/instructions")
            .setPlaceholder(
              "e.g. Give a fun welcome, mention rules and say hi in general chat",
            )
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(800)
            .setValue(settings.aiWelcomeInstructions || ""),
        ),
      );
      return interaction.showModal(modal);
    },
  },

  // ── AI usage limits modal submit ──────────────────────────────────────────
  {
    customIdPrefix: "premium_ai_usage_modal:",
    async execute(interaction) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content: "🚫 You need Manage Server permission.",
          flags: 64,
        });
      }
      await interaction.deferUpdate().catch(() => {});
      try {
        await updateAiSettings(interaction.guildId, {
          serverDailyLimit:
            interaction.fields.getTextInputValue("serverDailyLimit"),
          perUserDailyLimit:
            interaction.fields.getTextInputValue("perUserDailyLimit"),
          cooldownSeconds:
            interaction.fields.getTextInputValue("cooldownSeconds"),
          aiEnabled: interaction.fields.getTextInputValue("aiEnabled"),
        });
        return interaction.followUp({
          content: "✅ AI usage limits updated.",
          flags: 64,
        });
      } catch (err) {
        return interaction.followUp({
          content: "❌ Failed to update settings: " + err.message,
          flags: 64,
        });
      }
    },
  },

  // ── AI feature toggles modal submit ───────────────────────────────────────
  {
    customIdPrefix: "premium_ai_features_modal:",
    async execute(interaction) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content: "🚫 You need Manage Server permission.",
          flags: 64,
        });
      }
      await interaction.deferUpdate().catch(() => {});
      try {
        await updateAiSettings(interaction.guildId, {
          aiTranslationEnabled: interaction.fields.getTextInputValue(
            "aiTranslationEnabled",
          ),
          aiWelcomeEnabled:
            interaction.fields.getTextInputValue("aiWelcomeEnabled"),
          aiWelcomeInstructions: interaction.fields.getTextInputValue(
            "aiWelcomeInstructions",
          ),
        });
        return interaction.followUp({
          content: "✅ AI feature toggles updated.",
          flags: 64,
        });
      } catch (err) {
        return interaction.followUp({
          content: "❌ Failed to update settings: " + err.message,
          flags: 64,
        });
      }
    },
  },

  // ── Usage details ───────────────────────────────────────────────────────
  {
    customIdPrefix: "premium:usage",
    async execute(interaction) {
      await interaction.deferReply({ flags: 64 });
      const [status, aiCredits] = await Promise.all([
        getPremiumStatus(interaction.guildId),
        getAiCreditStatus(interaction.guildId),
      ]);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [todayUsage, userToday] = await Promise.all([
        prisma.botAiUsage.aggregate({
          where: {
            guildId: interaction.guildId,
            createdAt: { gte: todayStart },
          },
          _sum: { creditsUsed: true },
        }),
        prisma.botAiUsage.aggregate({
          where: {
            guildId: interaction.guildId,
            userId: interaction.user.id,
            createdAt: { gte: todayStart },
          },
          _sum: { creditsUsed: true },
        }),
      ]);
      const embed = new EmbedBuilder()
        .setTitle("📊 AI Usage Details")
        .setColor(0x1a7a9e)
        .addFields(
          {
            name: "Monthly Allowance",
            value: aiCredits.monthlyAllowance.toLocaleString(),
            inline: true,
          },
          {
            name: "Used This Month",
            value: aiCredits.monthlyUsed.toLocaleString(),
            inline: true,
          },
          {
            name: "Extra Credits",
            value: aiCredits.extraCredits.toLocaleString(),
            inline: true,
          },
          {
            name: "Total Remaining",
            value: aiCredits.totalAvailable.toLocaleString(),
            inline: true,
          },
          {
            name: "Server Used Today",
            value: `${todayUsage._sum.creditsUsed || 0} credits`,
            inline: true,
          },
          {
            name: "Your Usage Today",
            value: `${userToday._sum.creditsUsed || 0} credits`,
            inline: true,
          },
        );
      const settings = await getAiAdminSettings(interaction.guildId);
      embed.addFields({
        name: "Settings",
        value: `Server daily limit: ${settings.serverDailyLimit || "Unlimited"}\nPer-user daily limit: ${settings.perUserDailyLimit || "Unlimited"}\nCooldown: ${settings.cooldownSeconds || 0}s\nAI Enabled: ${settings.aiEnabled ? "Yes" : "No"}\nAI Translation: ${settings.aiTranslationEnabled ? "Enabled" : "Disabled"}\nAI Welcome: ${settings.aiWelcomeEnabled ? "Enabled" : "Disabled"}${settings.aiWelcomeEnabled && !settings.aiWelcomeChannelId ? "\n⚠️ AI Welcome is enabled, but no welcome channel is configured. Set one with /server channel." : ""}`,
        inline: false,
      });
      return interaction.editReply({ embeds: [embed] });
    },
  },
];
