const { SlashCommandBuilder } = require('discord.js');
const { requireFeature } = require('../../../lib/premiumGate');
const { answerStrategy, getCredits } = require('../../../modules/ai/service');
const { createDiscoreEmbed, getGuildSettings } = require('../../../lib/embedBuilder');

module.exports = {
  scope: 'PUBLIC',
  data: new SlashCommandBuilder()
    .setName('strategy')
    .setDescription('Ask Discore AI for strategy advice.')
    .addSubcommand((s) => s.setName('ask').setDescription('Ask a strategy question.').addStringOption((o) => o.setName('question').setDescription('Your strategy question').setRequired(true)))
    .addSubcommand((s) => s.setName('credits').setDescription('Show AI credit balance.')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'credits') {
      const credits = await getCredits(interaction.guildId);
      const embed = await createDiscoreEmbed(interaction, { title: '🧠 AI Credits', description: `Balance: **${credits.balance}** credits.` });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const ok = await requireFeature(interaction, 'strategy.ai');
    if (!ok) return;

    await interaction.deferReply();
    const settings = await getGuildSettings(interaction.guildId);
    const question = interaction.options.getString('question', true);
    const answer = await answerStrategy({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      prompt: question,
      context: { defaultGame: settings.defaultGame, timezone: settings.timezone, allianceName: settings.allianceName },
    });
    const embed = await createDiscoreEmbed(interaction, { title: '🧠 Discore Strategy', description: answer.slice(0, 4000) });
    return interaction.editReply({ embeds: [embed] });
  },
};
