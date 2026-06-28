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
      const status = await getPremiumStatus(interaction.guildId);
      const aiCredits = await getAiCreditStatus(interaction.guildId);

      // Rebuild the same dashboard structure
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

      const embed = new EmbedBuilder()
        .setTitle("💎 Discore Premium")
        .setColor(0x1a7a9e)
        .setFooter({ text: interaction.guild.name })
        .setTimestamp()
        .addFields(fields);

      // Keep buttons visible after refresh
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
            .setCustomId("premium:ai_admin")
            .setLabel("AI Admin Settings")
            .setEmoji("⚙️")
            .setStyle(ButtonStyle.Primary),
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

  // ── AI admin settings ───────────────────────────────────────────────────
  {
    customIdPrefix: "premium:ai_admin",
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
        .setCustomId("premium_ai_modal:")
        .setTitle("AI Admin Settings");

      const serverLimit = new TextInputBuilder()
        .setCustomId("serverDailyLimit")
        .setLabel("Server daily AI limit (0 = unlimited)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(String(settings.serverDailyLimit));

      const userLimit = new TextInputBuilder()
        .setCustomId("perUserDailyLimit")
        .setLabel("Per-user daily AI limit (0 = unlimited)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(String(settings.perUserDailyLimit));

      const cooldown = new TextInputBuilder()
        .setCustomId("cooldownSeconds")
        .setLabel("Cooldown in seconds (0 = none)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(String(settings.cooldownSeconds));

      const aiEnabled = new TextInputBuilder()
        .setCustomId("aiEnabled")
        .setLabel("AI enabled? (true/false)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(String(settings.aiEnabled));

      modal.addComponents(
        new ActionRowBuilder().addComponents(serverLimit),
        new ActionRowBuilder().addComponents(userLimit),
        new ActionRowBuilder().addComponents(cooldown),
        new ActionRowBuilder().addComponents(aiEnabled),
      );

      return interaction.showModal(modal);
    },
  },

  // ── Contact Developer ───────────────────────────────────────────────────
  {
    customIdPrefix: "premium:contact_dev",
    async execute(interaction) {
      // Simple anti-spam cooldown (in-memory)
      if (!contactDevCooldowns) var contactDevCooldowns = new Map(); // eslint-disable-line no-var
      const key = `${interaction.guildId}_${interaction.user.id}`;
      const last = contactDevCooldowns.get(key);
      if (last && Date.now() - last < 10 * 60 * 1000) {
        return interaction.reply({
          content:
            "⏳ You recently sent a developer report. Please wait before sending another.",
          flags: 64,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId("premium_contact_modal:")
        .setTitle("Contact Discore Developer");

      const issueType = new TextInputBuilder()
        .setCustomId("issueType")
        .setLabel("Issue Type")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80)
        .setPlaceholder("Premium, AI Credits, Billing, Setup, Bug, Other");

      const message = new TextInputBuilder()
        .setCustomId("message")
        .setLabel("Message")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1500)
        .setPlaceholder(
          "Explain what you need help with. Include what command you used and what went wrong.",
        );

      const contactInfo = new TextInputBuilder()
        .setCustomId("contactInfo")
        .setLabel("Contact Info (optional)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(200)
        .setPlaceholder(
          "Optional: Discord username, email, or best way to contact you",
        );

      modal.addComponents(
        new ActionRowBuilder().addComponents(issueType),
        new ActionRowBuilder().addComponents(message),
        new ActionRowBuilder().addComponents(contactInfo),
      );

      return interaction.showModal(modal);
    },
  },

  // ── Contact modal submit ────────────────────────────────────────────────
  {
    customIdPrefix: "premium_contact_modal:",
    async execute(interaction) {
      const issueType = interaction.fields.getTextInputValue("issueType");
      const message = interaction.fields.getTextInputValue("message");
      const contactInfo = interaction.fields.getTextInputValue("contactInfo");

      // Set cooldown
      if (!contactDevCooldowns) var contactDevCooldowns = new Map();
      const key = `${interaction.guildId}_${interaction.user.id}`;
      contactDevCooldowns.set(key, Date.now());

      const reportChannelId = process.env.DEV_REPORT_CHANNEL_ID;
      if (!reportChannelId) {
        return interaction.reply({
          content:
            "⚠️ I could not send the report right now.\n\nFor immediate live support, join:\nhttps://discord.gg/Zu7wntUKUC",
          flags: 64,
        });
      }

      try {
        const [status, aiCredits] = await Promise.all([
          require("../../../modules/premium/service").getPremiumStatus(
            interaction.guildId,
          ),
          require("../../../modules/premium/service").getAiCreditStatus(
            interaction.guildId,
          ),
        ]);

        const guildName = interaction.guild.name;
        const ownerId = interaction.guild.ownerId;

        const reportEmbed = new EmbedBuilder()
          .setTitle("📩 Developer Contact Report")
          .setColor(0xe74c3c)
          .addFields(
            { name: "Issue Type", value: issueType, inline: true },
            { name: "Message", value: message, inline: false },
            {
              name: "Submitted By",
              value: `${interaction.user.tag} / ${interaction.user.id}`,
              inline: false,
            },
            {
              name: "Server",
              value: `${guildName} / ${interaction.guildId}`,
              inline: true,
            },
            {
              name: "Server Owner",
              value: `<@${ownerId}> / ${ownerId}`,
              inline: true,
            },
            {
              name: "Premium Status",
              value: status.isActive
                ? `Premium (${getPremiumSource(status.premium)})`
                : "Free",
              inline: true,
            },
            {
              name: "AI Credits",
              value: `Monthly: ${aiCredits.monthlyRemaining} remaining | Extra: ${aiCredits.extraCredits} | Total: ${aiCredits.totalAvailable}`,
              inline: true,
            },
            {
              name: "Command Context",
              value: "Submitted from /premium dashboard",
              inline: true,
            },
          )
          .setFooter({ text: "Discore Developer Contact" })
          .setTimestamp();

        if (contactInfo) {
          reportEmbed.addFields({
            name: "Contact Info",
            value: contactInfo,
            inline: false,
          });
        }

        const ch = await interaction.client.channels
          .fetch(reportChannelId)
          .catch(() => null);
        if (ch && ch.isTextBased()) {
          await ch.send({ embeds: [reportEmbed] }).catch(() => {});
        }

        return interaction.reply({
          content:
            "✅ Report sent to the developer.\n\nFor immediate live support, join:\nhttps://discord.gg/Zu7wntUKUC",
          flags: 64,
        });
      } catch {
        return interaction.reply({
          content:
            "⚠️ I could not send the report right now.\n\nFor immediate live support, join:\nhttps://discord.gg/Zu7wntUKUC",
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
        prisma.aiUsage.aggregate({
          where: {
            guildId: interaction.guildId,
            createdAt: { gte: todayStart },
          },
          _sum: { creditsUsed: true },
        }),
        prisma.aiUsage.aggregate({
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
        value: `Server daily limit: ${settings.serverDailyLimit || "Unlimited"}\nPer-user daily limit: ${settings.perUserDailyLimit || "Unlimited"}\nCooldown: ${settings.cooldownSeconds || 0}s\nAI Enabled: ${settings.aiEnabled ? "Yes" : "No"}`,
        inline: false,
      });

      return interaction.editReply({ embeds: [embed] });
    },
  },
];
