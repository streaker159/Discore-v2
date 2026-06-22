const { SlashCommandBuilder } = require("discord.js");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");
const {
  getPremiumStatus,
  redeemPremiumCode,
} = require("../../../modules/premium/service");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("View or manage Discore premium.")
    .addSubcommand((s) =>
      s.setName("status").setDescription("Show this server's premium status."),
    )
    .addSubcommand((s) =>
      s.setName("features").setDescription("Show premium feature tiers."),
    )
    .addSubcommand((s) =>
      s
        .setName("redeem")
        .setDescription("Redeem a premium code.")
        .addStringOption((o) =>
          o.setName("code").setDescription("Premium code").setRequired(true),
        ),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "features") {
      const embed = await createDiscoreEmbed(interaction, {
        title: "💎 Discore Premium Features",
        description:
          "**Free:** 5 live scoreboards, battle signup, game lookups.\n**Pro:** archives, game finder, AI credits, branding.\n**Elite:** advanced AI, global intelligence, analytics, full branding.",
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "redeem") {
      const code = interaction.options.getString("code", true);
      const premium = await redeemPremiumCode({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        code,
      });
      const embed = await createDiscoreEmbed(interaction, {
        title: "✅ Premium code redeemed",
        description: `This server is now on **${premium.tier}**.`,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const status = await getPremiumStatus(interaction.guildId);

    // Build fields based on tier
    const fields = [
      { name: "Tier", value: status.tier, inline: true },
      {
        name: "Live scoreboard limit",
        value: String(status.limits.liveScoreboards),
        inline: true,
      },
      {
        name: "Monthly AI credits",
        value: String(status.limits.aiCreditsMonthly),
        inline: true,
      },
    ];

    // Add expiry info
    if (status.isLifetime) {
      fields.push({ name: "Expires", value: "Never", inline: true });
      fields.push({
        name: "Subscription",
        value: "Lifetime Access",
        inline: true,
      });
    } else if (status.expiresAt) {
      const expiryDate = new Date(status.expiresAt);
      fields.push({
        name: "Expires",
        value: `<t:${Math.floor(expiryDate.getTime() / 1000)}:R>`,
        inline: true,
      });
    } else if (status.tier !== "FREE") {
      fields.push({ name: "Expires", value: "Active", inline: true });
    }

    // Add AI usage if available
    if (status.limits.aiCreditsMonthly > 0) {
      // TODO: Get actual usage from database when AI tracking is implemented
      fields.push({
        name: "AI Credits Used This Month",
        value: "Coming soon",
        inline: true,
      });
    }

    const embed = await createDiscoreEmbed(interaction, {
      title: "💎 Premium Status",
      description: status.isLifetime
        ? "✨ **Thank you for your lifetime support!**"
        : null,
      fields,
    });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
