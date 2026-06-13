const { vote, getSuggestion, buildSuggestionEmbed, suggestionButtons } = require('../../../modules/suggestions/service');

module.exports = {
  customIdPrefix: 'suggestion:',
  async execute(interaction) {
    const [, voteType, suggestionId] = interaction.customId.split(':');
    await vote(suggestionId, interaction.user.id, voteType === 'up' ? 'UP' : 'DOWN');
    const suggestion = await getSuggestion(suggestionId);
    const embed = await buildSuggestionEmbed(interaction, suggestion);
    await interaction.update({ embeds: [embed], components: suggestionButtons(suggestionId) });
  },
};
