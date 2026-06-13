const { SlashCommandBuilder } = require('discord.js');
const { requireBotOwner } = require('../../../lib/ownerGuard');
const { createDiscoreEmbed } = require('../../../lib/embedBuilder');

module.exports = {
  scope: 'BOT_OWNER',
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Owner-only broadcast placeholders.')
    .addSubcommand((s) => s.setName('preview').setDescription('Preview a broadcast embed.').addStringOption((o) => o.setName('message').setDescription('Broadcast message').setRequired(true))),
  async execute(interaction) {
    if (!(await requireBotOwner(interaction))) return;
    const embed = await createDiscoreEmbed(interaction, {
      title: '📢 Discore Broadcast Preview',
      description: interaction.options.getString('message', true),
    });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
