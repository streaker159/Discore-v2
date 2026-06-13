const { SlashCommandBuilder } = require('discord.js');
const { requireFeature } = require('../../../lib/premiumGate');
const { createMatchWatcher } = require('../../../modules/gameFinder/service');
const { createDiscoreEmbed } = require('../../../lib/embedBuilder');

module.exports = {
  scope: 'PUBLIC',
  data: new SlashCommandBuilder()
    .setName('match')
    .setDescription('Premium game finder tools.')
    .addSubcommand((s) => s.setName('find').setDescription('Create a match/game finder watcher.')
      .addStringOption((o) => o.setName('game').setDescription('Game slug').setRequired(true))
      .addStringOption((o) => o.setName('mode').setDescription('Mode/speed, e.g. 4x'))
      .addIntegerOption((o) => o.setName('max_players').setDescription('Max current players'))),
  async execute(interaction) {
    const ok = await requireFeature(interaction, 'match.finder');
    if (!ok) return;

    const watcher = await createMatchWatcher({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      game: interaction.options.getString('game', true),
      mode: interaction.options.getString('mode'),
      maxPlayers: interaction.options.getInteger('max_players'),
      createdBy: interaction.user.id,
    });
    const embed = await createDiscoreEmbed(interaction, { title: '🔎 Game Finder Started', description: `Watcher created: \`${watcher.id}\`\nThis is a placeholder until an approved data source is connected.` });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
