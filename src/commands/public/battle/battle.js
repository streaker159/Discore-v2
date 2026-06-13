const { SlashCommandBuilder } = require('discord.js');
const prisma = require('../../../lib/prisma');
const { parseDateTime } = require('../../../lib/timeParser');
const { getGuildSettings } = require('../../../lib/embedBuilder');
const { createBattleSignup, getSignup, buildBattleSignupEmbed, battleSignupButtons } = require('../../../modules/battleSignup/service');

module.exports = {
  scope: 'PUBLIC',
  data: new SlashCommandBuilder()
    .setName('battle')
    .setDescription('Create and manage battle signups.')
    .addSubcommand((s) => s.setName('create').setDescription('Create a battle signup.')
      .addStringOption((o) => o.setName('game').setDescription('Game name or slug').setRequired(true))
      .addStringOption((o) => o.setName('time').setDescription('Example: 3pm Paris time this Monday / 1800 UTC').setRequired(true))
      .addIntegerOption((o) => o.setName('team_size').setDescription('Team size').setRequired(true))
      .addStringOption((o) => o.setName('mode').setDescription('Mode, e.g. 4x, AvA, training'))
      .addStringOption((o) => o.setName('timezone').setDescription('Optional IANA timezone, e.g. Europe/Paris')))
    .addSubcommand((s) => s.setName('show').setDescription('Show battle signup by ID.').addStringOption((o) => o.setName('id').setDescription('Battle signup ID').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'show') {
      const signup = await getSignup(interaction.options.getString('id', true));
      if (!signup) return interaction.reply({ content: 'Battle signup not found.', ephemeral: true });
      const embed = await buildBattleSignupEmbed(interaction, signup);
      return interaction.reply({ embeds: [embed], components: battleSignupButtons(signup.id) });
    }

    const settings = await getGuildSettings(interaction.guildId);
    const parsed = parseDateTime(interaction.options.getString('time', true), {
      timezone: interaction.options.getString('timezone') || settings?.timezone || 'UTC',
    });
    if (!parsed.ok) return interaction.reply({ content: parsed.reason, ephemeral: true });

    const signup = await createBattleSignup({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      captainId: interaction.user.id,
      game: interaction.options.getString('game', true),
      mode: interaction.options.getString('mode'),
      scheduledAt: parsed.date,
      teamSize: interaction.options.getInteger('team_size', true),
    });

    const full = await getSignup(signup.id);
    const embed = await buildBattleSignupEmbed(interaction, full);
    const message = await interaction.channel.send({ embeds: [embed], components: battleSignupButtons(signup.id) });
    await prisma.battleSignup.update({ where: { id: signup.id }, data: { messageId: message.id } }).catch(() => {});
    await interaction.reply({ content: `✅ Battle signup created. Everyone will see the time in their local Discord timezone. ID: \`${signup.id}\``, ephemeral: true });
  },
};
