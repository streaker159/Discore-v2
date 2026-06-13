const { SlashCommandBuilder } = require('discord.js');
const { createDiscoreEmbed } = require('../../../lib/embedBuilder');
const { findGameData, searchGameData } = require('../../../modules/gameData/service');
const { updateGuildSettings, ensureGuild } = require('../../../modules/serverSettings/service');

function statsToText(stats) {
  if (!stats) return 'No stats stored yet.';
  if (typeof stats === 'string') return stats;
  return '```json\n' + JSON.stringify(stats, null, 2).slice(0, 800) + '\n```';
}

module.exports = {
  scope: 'PUBLIC',
  data: new SlashCommandBuilder()
    .setName('game')
    .setDescription('Search internal game data.')
    .addSubcommand((s) => s.setName('set-default').setDescription('Set server default game.').addStringOption((o) => o.setName('game').setDescription('Game slug').setRequired(true)))
    .addSubcommand((s) => s.setName('unit').setDescription('Find a unit.').addStringOption((o) => o.setName('name').setDescription('Unit name').setRequired(true)).addStringOption((o) => o.setName('game').setDescription('Game slug')))
    .addSubcommand((s) => s.setName('building').setDescription('Find a building.').addStringOption((o) => o.setName('name').setDescription('Building name').setRequired(true)).addStringOption((o) => o.setName('game').setDescription('Game slug')))
    .addSubcommand((s) => s.setName('resource').setDescription('Find a resource.').addStringOption((o) => o.setName('name').setDescription('Resource name').setRequired(true)).addStringOption((o) => o.setName('game').setDescription('Game slug')))
    .addSubcommand((s) => s.setName('research').setDescription('Find research.').addStringOption((o) => o.setName('name').setDescription('Research name').setRequired(true)).addStringOption((o) => o.setName('game').setDescription('Game slug')))
    .addSubcommand((s) => s.setName('search').setDescription('Search all game data.').addStringOption((o) => o.setName('query').setDescription('Search query').setRequired(true)).addStringOption((o) => o.setName('game').setDescription('Game slug'))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set-default') {
      const game = interaction.options.getString('game', true);
      const updated = await updateGuildSettings(interaction.guildId, { defaultGame: game });
      const embed = await createDiscoreEmbed(interaction, { guildSettings: updated, title: '🎮 Default game set', description: `Default game is now **${game}**.` });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const settings = await ensureGuild(interaction.guildId);
    const gameSlug = interaction.options.getString('game') || settings.defaultGame;
    if (!gameSlug) return interaction.reply({ content: 'No game provided and no default game set. Use `/game set-default` first.', ephemeral: true });

    if (sub === 'search') {
      const results = await searchGameData({ gameSlug, query: interaction.options.getString('query', true) });
      const embed = await createDiscoreEmbed(interaction, {
        title: '🔎 Game Data Search',
        description: results.length ? results.map((r) => `**${r.type}:** ${r.record.name}`).join('\n') : 'No matching records found.',
      });
      return interaction.reply({ embeds: [embed] });
    }

    const found = await findGameData({ gameSlug, type: sub, query: interaction.options.getString('name', true) });
    if (!found) return interaction.reply({ content: 'No matching game data found.', ephemeral: true });

    const { game, record } = found;
    const embed = await createDiscoreEmbed(interaction, {
      title: `${sub[0].toUpperCase() + sub.slice(1)}: ${record.name}`,
      description: record.description || 'No description stored yet.',
      thumbnail: record.iconUrl || undefined,
      image: record.imageUrl || undefined,
      fields: [
        { name: 'Game', value: game.name, inline: true },
        { name: 'Category', value: record.category || record.doctrine || 'Not set', inline: true },
        { name: 'Stats', value: statsToText(record.stats), inline: false },
      ],
    });
    return interaction.reply({ embeds: [embed] });
  },
};
