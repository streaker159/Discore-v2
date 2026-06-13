const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const prisma = require('../../../lib/prisma');
const { createScoreboard, getScoreboard, addResult, archiveScoreboard, buildScoreboardEmbed } = require('../../../modules/scoreboards/service');
const { requireFeature } = require('../../../lib/premiumGate');
const { createDiscoreEmbed } = require('../../../lib/embedBuilder');

module.exports = {
  scope: 'PUBLIC',
  data: new SlashCommandBuilder()
    .setName('scoreboard')
    .setDescription('Create and manage Discore scoreboards.')
    .addSubcommand((s) => s.setName('start').setDescription('Create a live scoreboard.')
      .addStringOption((o) => o.setName('name').setDescription('Scoreboard name').setRequired(true))
      .addStringOption((o) => o.setName('metric').setDescription('Ranking metric').setRequired(true).addChoices(
        { name: 'Wins', value: 'WINS' }, { name: 'Points', value: 'POINTS' }, { name: 'Ratio', value: 'RATIO' }, { name: 'Win streak', value: 'WIN_STREAK' }
      ))
      .addStringOption((o) => o.setName('type').setDescription('Target type').addChoices({ name: 'Users', value: 'USER' }, { name: 'Roles', value: 'ROLE' }))
      .addChannelOption((o) => o.setName('channel').setDescription('Live scoreboard channel').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s.setName('show').setDescription('Show a scoreboard.').addStringOption((o) => o.setName('name').setDescription('Scoreboard name').setRequired(true)))
    .addSubcommand((s) => s.setName('addwin').setDescription('Add a win.').addStringOption((o) => o.setName('name').setDescription('Scoreboard name').setRequired(true)).addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)).addStringOption((o) => o.setName('reason').setDescription('Reason')))
    .addSubcommand((s) => s.setName('addloss').setDescription('Add a loss.').addStringOption((o) => o.setName('name').setDescription('Scoreboard name').setRequired(true)).addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)).addStringOption((o) => o.setName('reason').setDescription('Reason')))
    .addSubcommand((s) => s.setName('addpoints').setDescription('Add points.').addStringOption((o) => o.setName('name').setDescription('Scoreboard name').setRequired(true)).addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)).addIntegerOption((o) => o.setName('points').setDescription('Points').setRequired(true)))
    .addSubcommand((s) => s.setName('archive').setDescription('Archive a scoreboard.').addStringOption((o) => o.setName('name').setDescription('Scoreboard name').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (['start', 'addwin', 'addloss', 'addpoints', 'archive'].includes(sub) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'You need Manage Server permission for scoreboard edits.', ephemeral: true });
    }

    if (sub === 'start') {
      const name = interaction.options.getString('name', true);
      const metric = interaction.options.getString('metric', true);
      const type = interaction.options.getString('type') || 'USER';
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const board = await createScoreboard({ guildId: interaction.guildId, name, metric, type, channelId: channel.id, createdBy: interaction.user.id });
      const embed = await buildScoreboardEmbed(interaction, { ...board, entries: [] });
      const message = await channel.send({ embeds: [embed] });
      await prisma.scoreboard.update({ where: { id: board.id }, data: { messageId: message.id } }).catch(() => {});
      return interaction.reply({ content: `✅ Scoreboard **${name}** created in ${channel}.`, ephemeral: true });
    }

    if (sub === 'show') {
      const board = await getScoreboard(interaction.guildId, interaction.options.getString('name', true));
      if (!board) return interaction.reply({ content: 'Scoreboard not found.', ephemeral: true });
      const embed = await buildScoreboardEmbed(interaction, board);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'archive') {
      const ok = await requireFeature(interaction, 'scoreboards.archive');
      if (!ok) return;
      const board = await archiveScoreboard({ guildId: interaction.guildId, name: interaction.options.getString('name', true) });
      const embed = await createDiscoreEmbed(interaction, { title: '📦 Scoreboard archived', description: `Archived **${board.name}**.` });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const action = sub === 'addwin' ? 'WIN' : sub === 'addloss' ? 'LOSS' : 'POINT';
    const user = interaction.options.getUser('user', true);
    const delta = sub === 'addpoints' ? interaction.options.getInteger('points', true) : 1;
    const result = await addResult({ guildId: interaction.guildId, scoreboardName: interaction.options.getString('name', true), targetId: user.id, action, delta, adminId: interaction.user.id, reason: interaction.options.getString('reason') });
    const embed = await buildScoreboardEmbed(interaction, result.board);
    return interaction.reply({ embeds: [embed] });
  },
};
