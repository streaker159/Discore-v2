const { SlashCommandBuilder } = require('discord.js');
const { createDiscoreEmbed } = require('../../../lib/embedBuilder');
const { getPremiumStatus, redeemPremiumCode } = require('../../../modules/premium/service');

module.exports = {
  scope: 'PUBLIC',
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('View or manage Discore premium.')
    .addSubcommand((s) => s.setName('status').setDescription('Show this server\'s premium status.'))
    .addSubcommand((s) => s.setName('features').setDescription('Show premium feature tiers.'))
    .addSubcommand((s) => s.setName('redeem').setDescription('Redeem a premium code.').addStringOption((o) => o.setName('code').setDescription('Premium code').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'features') {
      const embed = await createDiscoreEmbed(interaction, {
        title: '💎 Discore Premium Features',
        description: '**Free:** 5 live scoreboards, battle signup, game lookups.\n**Pro:** archives, game finder, AI credits, branding.\n**Elite:** advanced AI, global intelligence, analytics, full branding.',
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'redeem') {
      const code = interaction.options.getString('code', true);
      const premium = await redeemPremiumCode({ guildId: interaction.guildId, userId: interaction.user.id, code });
      const embed = await createDiscoreEmbed(interaction, {
        title: '✅ Premium code redeemed',
        description: `This server is now on **${premium.tier}**.`,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const status = await getPremiumStatus(interaction.guildId);
    const embed = await createDiscoreEmbed(interaction, {
      title: '💎 Premium Status',
      fields: [
        { name: 'Tier', value: status.tier, inline: true },
        { name: 'Live scoreboard limit', value: String(status.limits.liveScoreboards), inline: true },
        { name: 'Monthly AI credits', value: String(status.limits.aiCreditsMonthly), inline: true },
      ],
    });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
