const { SlashCommandBuilder } = require('discord.js');
const { requireFeature } = require('../../../lib/premiumGate');
const { createAvaMatch, submitResult, confirmResult } = require('../../../modules/ava/service');
const { getAllianceByTag } = require('../../../modules/allianceNetwork/service');
const { createDiscoreEmbed } = require('../../../lib/embedBuilder');
const { parseDateTime } = require('../../../lib/timeParser');

module.exports = {
  scope: 'PUBLIC',
  data: new SlashCommandBuilder()
    .setName('ava')
    .setDescription('Alliance vs Alliance tools.')
    .addSubcommand((s) => s.setName('create').setDescription('Create an AvA match.')
      .addStringOption((o) => o.setName('game').setDescription('Game slug').setRequired(true))
      .addStringOption((o) => o.setName('home_tag').setDescription('Home alliance tag').setRequired(true))
      .addStringOption((o) => o.setName('away_tag').setDescription('Away alliance tag').setRequired(true))
      .addStringOption((o) => o.setName('time').setDescription('Optional match time')))
    .addSubcommand((s) => s.setName('submit-result').setDescription('Submit AvA result.').addStringOption((o) => o.setName('match_id').setDescription('Match ID').setRequired(true)).addStringOption((o) => o.setName('winner_id').setDescription('Winner alliance ID').setRequired(true)).addStringOption((o) => o.setName('evidence').setDescription('Evidence URL')))
    .addSubcommand((s) => s.setName('confirm-result').setDescription('Confirm AvA result.').addStringOption((o) => o.setName('match_id').setDescription('Match ID').setRequired(true))),
  async execute(interaction) {
    const ok = await requireFeature(interaction, 'ava.verified');
    if (!ok) return;

    const sub = interaction.options.getSubcommand();
    if (sub === 'create') {
      const game = interaction.options.getString('game', true);
      const home = await getAllianceByTag(game, interaction.options.getString('home_tag', true).toUpperCase());
      const away = await getAllianceByTag(game, interaction.options.getString('away_tag', true).toUpperCase());
      if (!home || !away) return interaction.reply({ content: 'Both alliances must be registered first.', ephemeral: true });
      const timeInput = interaction.options.getString('time');
      const parsed = timeInput ? parseDateTime(timeInput) : null;
      const match = await createAvaMatch({ homeAllianceId: home.id, awayAllianceId: away.id, game, scheduledAt: parsed?.ok ? parsed.date : null });
      const embed = await createDiscoreEmbed(interaction, { title: '⚔️ AvA match created', description: `**${home.name}** vs **${away.name}**\nMatch ID: \`${match.id}\`` });
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'submit-result') {
      const match = await submitResult({ matchId: interaction.options.getString('match_id', true), winnerId: interaction.options.getString('winner_id', true), evidenceUrl: interaction.options.getString('evidence'), submittedBy: interaction.user.id });
      const embed = await createDiscoreEmbed(interaction, { title: '📨 Result submitted', description: `Match **${match.id}** is awaiting confirmation.` });
      return interaction.reply({ embeds: [embed] });
    }

    const match = await confirmResult({ matchId: interaction.options.getString('match_id', true), confirmedBy: interaction.user.id });
    const embed = await createDiscoreEmbed(interaction, { title: '✅ AvA verified', description: `Match **${match.id}** has been verified and rankings updated.` });
    return interaction.reply({ embeds: [embed] });
  },
};
