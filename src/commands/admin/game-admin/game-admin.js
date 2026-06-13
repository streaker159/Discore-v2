const { SlashCommandBuilder } = require('discord.js');
const { requireBotAdmin } = require('../../../lib/ownerGuard');
const prisma = require('../../../lib/prisma');
const { createDiscoreEmbed } = require('../../../lib/embedBuilder');
const { ensureGame } = require('../../../modules/gameData/service');

module.exports = {
  scope: 'BOT_OWNER',
  data: new SlashCommandBuilder()
    .setName('game-admin')
    .setDescription('Owner-only game data tools.')
    .addSubcommand((s) => s.setName('add-unit').setDescription('Add a unit.').addStringOption((o) => o.setName('game').setDescription('Game slug').setRequired(true)).addStringOption((o) => o.setName('name').setDescription('Unit name').setRequired(true)).addStringOption((o) => o.setName('description').setDescription('Description')).addStringOption((o) => o.setName('icon').setDescription('Icon URL')).addStringOption((o) => o.setName('aliases').setDescription('Comma-separated aliases')))
    .addSubcommand((s) => s.setName('add-resource').setDescription('Add a resource.').addStringOption((o) => o.setName('game').setDescription('Game slug').setRequired(true)).addStringOption((o) => o.setName('name').setDescription('Resource name').setRequired(true)).addStringOption((o) => o.setName('description').setDescription('Description')).addStringOption((o) => o.setName('icon').setDescription('Icon URL'))),
  async execute(interaction) {
    if (!(await requireBotAdmin(interaction))) return;
    const sub = interaction.options.getSubcommand();
    const game = await ensureGame(interaction.options.getString('game', true));
    const aliases = (interaction.options.getString('aliases') || '').split(',').map((a) => a.trim()).filter(Boolean);
    let record;

    if (sub === 'add-unit') {
      record = await prisma.unit.create({ data: { gameId: game.id, name: interaction.options.getString('name', true), description: interaction.options.getString('description'), iconUrl: interaction.options.getString('icon'), aliases } });
    } else {
      record = await prisma.resource.create({ data: { gameId: game.id, name: interaction.options.getString('name', true), description: interaction.options.getString('description'), iconUrl: interaction.options.getString('icon'), aliases: [] } });
    }

    const embed = await createDiscoreEmbed(interaction, { title: '🎮 Game data added', description: `Added **${record.name}** to **${game.name}**.` });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
