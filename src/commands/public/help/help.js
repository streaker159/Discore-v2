const { SlashCommandBuilder } = require('discord.js');
const { createDiscoreEmbed } = require('../../../lib/embedBuilder');

module.exports = {
  scope: 'PUBLIC',
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show Discore V2 help and key features.'),
  async execute(interaction) {
    const embed = await createDiscoreEmbed(interaction, {
      title: '🧭 Discore V2 Help',
      description: 'Discore is your strategy-game command network for scoreboards, battle signups, game data, AI strategy, alliances, players, and AvA rankings.',
      fields: [
        { name: 'Core commands', value: '`/scoreboard` `/battle` `/game` `/strategy` `/alliance` `/player` `/ava` `/match`', inline: false },
        { name: 'Server setup', value: '`/server setup` `/server branding` `/server timezone` `/server default-game`', inline: false },
        { name: 'Premium', value: '`/premium status` `/premium features` `/premium redeem`', inline: false },
      ],
    });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
