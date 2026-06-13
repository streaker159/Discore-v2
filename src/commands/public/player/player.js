const { SlashCommandBuilder } = require('discord.js');
const prisma = require('../../../lib/prisma');
const { createDiscoreEmbed } = require('../../../lib/embedBuilder');
const { registerPlayer } = require('../../../modules/allianceNetwork/service');

module.exports = {
  scope: 'PUBLIC',
  data: new SlashCommandBuilder()
    .setName('player')
    .setDescription('Register and view player profiles.')
    .addSubcommand((s) => s.setName('register').setDescription('Register your player profile.')
      .addStringOption((o) => o.setName('username').setDescription('Game username').setRequired(true))
      .addStringOption((o) => o.setName('game').setDescription('Game slug').setRequired(true))
      .addStringOption((o) => o.setName('alliance').setDescription('Current alliance').setRequired(true))
      .addStringOption((o) => o.setName('role').setDescription('Your role/playstyle')))
    .addSubcommand((s) => s.setName('profile').setDescription('View a player profile.').addUserOption((o) => o.setName('user').setDescription('Discord user'))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'register') {
      const profile = await registerPlayer({
        discordId: interaction.user.id,
        gameUsername: interaction.options.getString('username', true),
        game: interaction.options.getString('game', true),
        allianceName: interaction.options.getString('alliance', true),
        role: interaction.options.getString('role'),
      });
      const embed = await createDiscoreEmbed(interaction, { title: '🎖️ Player registered', description: `Profile updated for **${profile.gameUsername}**. Current alliance: **${profile.currentAlliance}**.` });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const user = interaction.options.getUser('user') || interaction.user;
    const profile = await prisma.playerProfile.findUnique({ where: { discordId: user.id }, include: { allianceHistory: { orderBy: { joinedAt: 'desc' }, take: 10 } } });
    if (!profile) return interaction.reply({ content: 'No player profile found.', ephemeral: true });
    const history = profile.allianceHistory.map((h) => `• ${h.allianceName} (${h.game}) ${h.leftAt ? 'ended' : 'current'}`).join('\n') || 'None';
    const embed = await createDiscoreEmbed(interaction, {
      title: `🎖️ ${profile.gameUsername || user.username}`,
      description: `Discord: ${user}\nCurrent alliance: **${profile.currentAlliance || 'Not set'}**`,
      fields: [
        { name: 'Game', value: profile.game || 'Not set', inline: true },
        { name: 'Role', value: profile.role || 'Not set', inline: true },
        { name: 'Alliance history', value: history, inline: false },
      ],
    });
    return interaction.reply({ embeds: [embed] });
  },
};
