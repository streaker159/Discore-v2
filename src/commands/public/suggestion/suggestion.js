const { SlashCommandBuilder } = require('discord.js');
const { createSuggestion, buildSuggestionEmbed, suggestionButtons } = require('../../../modules/suggestions/service');

module.exports = {
  scope: 'PUBLIC',
  data: new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('Create suggestions with voting.')
    .addSubcommand((s) => s.setName('create').setDescription('Create a suggestion.').addStringOption((o) => o.setName('content').setDescription('Suggestion text').setRequired(true)).addStringOption((o) => o.setName('image').setDescription('Image URL'))),
  async execute(interaction) {
    const suggestion = await createSuggestion({
      guildId: interaction.guildId,
      authorId: interaction.user.id,
      content: interaction.options.getString('content', true),
      imageUrl: interaction.options.getString('image'),
      channelId: interaction.channelId,
    });
    const embed = await buildSuggestionEmbed(interaction, suggestion);
    const message = await interaction.channel.send({ embeds: [embed], components: suggestionButtons(suggestion.id) });
    await interaction.reply({ content: `✅ Suggestion posted. Message ID: ${message.id}`, ephemeral: true });
  },
};
