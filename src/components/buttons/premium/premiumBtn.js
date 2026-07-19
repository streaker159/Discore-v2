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
  redeemPremiumCode,
} = require("../../../modules/premium/service");

function isAdmin(member) {
  if (member.permissions?.has("ManageGuild")) return true;
  return false;
}

module.exports = [
  // ── Manage premium ──────────────────────────────────────────────────────
  {
    customIdPrefix: "premium:manage",
    async execute(interaction) {
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
            "**How to get Premium:**\n" +
            "Discore no longer uses the Discord Shop. Contact the Discore owner directly or ask in the official Discore server for current costs, rates, and available deals. Payments are handled directly outside Discord Shop.\n\n" +
            "If you already have a code, use **Redeem Code** in `/premium`.",
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
      const embed = new EmbedBuilder()
        .setTitle("🤖 AI Credits")
        .setColor(0x1a7a9e)
        .setDescription(
          "AI credits are handled directly by the Discore owner now. Contact the owner or official Discore server for current AI credit costs, monthly bundles, and server deals.\n\n" +
            "If you receive a premium code, redeem it from `/premium` with **Redeem Code**.",
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
      // ── Premium-specific ───────────────────────────────────────────
      if (status.isLifetime)
        fields.push({ name: "Type", value: "🌟 Lifetime", inline: true });

      // ── AI Credits (shown regardless of Premium) ───────────────────
      const aiAccessSource = status.isActive
        ? "Premium"
        : aiCredits.totalAvailable > 0
          ? "AI Credits"
          : "None";
      const aiAccessActive = aiCredits.totalAvailable > 0;
      fields.push(
        {
          name: "AI Access",
          value: aiAccessActive
            ? `✅ Active via ${aiAccessSource}`
            : "❌ No AI credits available",
          inline: true,
        },
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

      // ── AI Feature Status ──────────────────────────────────────────
      const aiStatusLines = [
        `AI Chat: ${aiSettings.aiEnabled ? "✅ Enabled" : "❌ Disabled"}`,
        `AI Translation: ${aiSettings.aiTranslationEnabled ? "✅ Enabled" : "❌ Disabled"}`,
        `AI Welcome: ${aiSettings.aiWelcomeEnabled ? "✅ Enabled" : "❌ Disabled"}`,
        `AI Image Gen: ${aiSettings.aiImageGenEnabled ? "✅ Enabled" : "❌ Disabled"}`,
      ];
      if (aiSettings.aiWelcomeEnabled && !aiSettings.aiWelcomeChannelId) {
        aiStatusLines.push(
          "⚠️ AI Welcome has no channel set. Use `/server channel` to configure.",
        );
      }
      if (aiSettings.aiImageGenEnabled) {
        aiStatusLines.push(
          `Per-user daily image limit: ${aiSettings.perUserDailyImageGenLimit || "Unlimited"}`,
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
            .setLabel("Contact for Premium")
            .setEmoji("💎")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("premium:redeem_code")
            .setLabel("Redeem Code")
            .setEmoji("🎟️")
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
          "🔄 Premium status refreshed. If the owner just granted access or you redeemed a code, the updated status should show here.",
        flags: 64,
      });
      return interaction.editReply({ embeds: [embed], components: buttons });
    },
  },

  // ── Redeem premium code ────────────────────────────────────────────────
  {
    customIdPrefix: "premium:redeem_code",
    async execute(interaction) {
      const modal = new ModalBuilder()
        .setCustomId("premium_redeem_code_modal:")
        .setTitle("Redeem Premium Code");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("code")
            .setLabel("Premium code")
            .setPlaceholder("DISCORE-XXXXXXX")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(80),
        ),
      );
      return interaction.showModal(modal);
    },
  },

  // ── Redeem premium code modal submit ───────────────────────────────────
  {
    customIdPrefix: "premium_redeem_code_modal:",
    async execute(interaction) {
      const code = interaction.fields.getTextInputValue("code");
      await interaction.deferReply({ flags: 64 });
      try {
        const premium = await redeemPremiumCode({
          guildId: interaction.guildId,
          userId: interaction.user.id,
          code,
        });
        return interaction.editReply({
          content:
            `✅ Code redeemed. **${premium.tier}** is now active for this server. ` +
            (premium.expiresAt
              ? `Expires <t:${Math.floor(premium.expiresAt.getTime() / 1000)}:R>.`
              : "This grant does not expire."),
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ ${err.message || "That code could not be redeemed."}`,
        });
      }
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
            .setCustomId("perUserDailyImageGenLimit")
            .setLabel("Per-user daily image gen limit (0 = unlimited)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(settings.perUserDailyImageGenLimit)),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("cooldownSeconds")
            .setLabel("Cooldown in seconds (0 = none)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(settings.cooldownSeconds)),
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
            .setCustomId("aiEnabled")
            .setLabel("AI enabled? (true/false — master switch)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(settings.aiEnabled)),
        ),
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
            .setCustomId("aiImageGenEnabled")
            .setLabel("AI image generation enabled? (true/false)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(settings.aiImageGenEnabled ?? false)),
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
          perUserDailyImageGenLimit: interaction.fields.getTextInputValue(
            "perUserDailyImageGenLimit",
          ),
          cooldownSeconds:
            interaction.fields.getTextInputValue("cooldownSeconds"),
        });
        return interaction.followUp({
          content: "✅ AI usage limits updated.",
          flags: 64,
        });
      } catch (err) {
        const msg = err?.message || String(err);
        const logger = require("../../../lib/logger");
        logger.error("premium_ai_usage_modal submit failed", {
          error: msg,
          guildId: interaction.guildId,
        });
        return interaction.followUp({
          content: "❌ Failed to update settings: " + msg.substring(0, 1900),
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
          aiEnabled: interaction.fields.getTextInputValue("aiEnabled"),
          aiTranslationEnabled: interaction.fields.getTextInputValue(
            "aiTranslationEnabled",
          ),
          aiWelcomeEnabled:
            interaction.fields.getTextInputValue("aiWelcomeEnabled"),
          aiImageGenEnabled:
            interaction.fields.getTextInputValue("aiImageGenEnabled"),
          aiWelcomeInstructions: interaction.fields.getTextInputValue(
            "aiWelcomeInstructions",
          ),
        });
        return interaction.followUp({
          content: "✅ AI feature toggles updated.",
          flags: 64,
        });
      } catch (err) {
        const msg = err?.message || String(err);
        const logger = require("../../../lib/logger");
        logger.error("premium_ai_features_modal submit failed", {
          error: msg,
          guildId: interaction.guildId,
        });
        return interaction.followUp({
          content: "❌ Failed to update settings: " + msg.substring(0, 1900),
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

  // ── Contact Developer ────────────────────────────────────────────────────
  {
    customIdPrefix: "premium:contact_dev",
    async execute(interaction) {
      const modal = new ModalBuilder()
        .setCustomId("premium_contact_dev_modal:")
        .setTitle("Contact Developer");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("message")
            .setLabel("Your message to the developer")
            .setPlaceholder("Describe your question, issue, or feedback...")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000),
        ),
      );
      return interaction.showModal(modal);
    },
  },

  // ── Contact Developer modal submit ────────────────────────────────────────
  {
    customIdPrefix: "premium_contact_dev_modal:",
    async execute(interaction) {
      const message = interaction.fields.getTextInputValue("message");
      const reportChannelId = process.env.DEV_REPORT_CHANNEL_ID;

      if (!reportChannelId) {
        return interaction.reply({
          content:
            "⚠️ The developer contact system is not configured yet. Please try again later.",
          flags: 64,
        });
      }

      await interaction.deferUpdate().catch(() => {});

      try {
        const channel = await interaction.client.channels
          .fetch(reportChannelId)
          .catch(() => null);

        if (!channel) {
          return interaction.followUp({
            content:
              "⚠️ Could not deliver your message. Please try again later.",
            flags: 64,
          });
        }

        const { EmbedBuilder } = require("discord.js");
        const embed = new EmbedBuilder()
          .setColor(0x1a7a9e)
          .setTitle("📬 Developer Contact")
          .setDescription(message)
          .addFields(
            {
              name: "From",
              value: `<@${interaction.user.id}> (${interaction.user.tag})`,
              inline: true,
            },
            {
              name: "Server",
              value: `${interaction.guild.name} (${interaction.guildId})`,
              inline: true,
            },
            {
              name: "Channel",
              value: `<#${interaction.channelId}>`,
              inline: true,
            },
          )
          .setTimestamp();

        await channel.send({ embeds: [embed] });

        return interaction.followUp({
          content: "✅ Your message has been sent to the developer. Thank you!",
          flags: 64,
        });
      } catch (err) {
        const logger = require("../../../lib/logger");
        logger.error("Failed to deliver developer contact message", {
          error: err.message,
        });
        return interaction.followUp({
          content: "❌ Failed to send your message: " + err.message,
          flags: 64,
        });
      }
    },
  },
];
