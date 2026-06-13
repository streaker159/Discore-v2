const { SlashCommandBuilder } = require('discord.js');
const { parseDateTime } = require('../../../lib/timeParser');
const { getGuildSettings } = require('../../../lib/embedBuilder');
const { createEvent, getEvent, buildEventEmbed, eventButtons } = require('../../../modules/events/service');

module.exports = {
  scope: 'PUBLIC',
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Create and manage events.')
    .addSubcommand((s) => s.setName('create').setDescription('Create an event.')
      .addStringOption((o) => o.setName('title').setDescription('Event title').setRequired(true))
      .addStringOption((o) => o.setName('time').setDescription('Natural language time').setRequired(true))
      .addStringOption((o) => o.setName('description').setDescription('Description'))
      .addStringOption((o) => o.setName('location').setDescription('Location or link'))
      .addStringOption((o) => o.setName('image').setDescription('Image URL')))
    .addSubcommand((s) => s.setName('show').setDescription('Show event by ID.').addStringOption((o) => o.setName('id').setDescription('Event ID').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'show') {
      const event = await getEvent(interaction.options.getString('id', true));
      if (!event) return interaction.reply({ content: 'Event not found.', ephemeral: true });
      const embed = await buildEventEmbed(interaction, event);
      return interaction.reply({ embeds: [embed], components: eventButtons(event.id) });
    }

    const settings = await getGuildSettings(interaction.guildId);
    const parsed = parseDateTime(interaction.options.getString('time', true), { timezone: settings.timezone || 'UTC' });
    if (!parsed.ok) return interaction.reply({ content: parsed.reason, ephemeral: true });

    const event = await createEvent({
      guildId: interaction.guildId,
      title: interaction.options.getString('title', true),
      description: interaction.options.getString('description'),
      location: interaction.options.getString('location'),
      imageUrl: interaction.options.getString('image'),
      channelId: interaction.channelId,
      scheduledAt: parsed.date,
      createdBy: interaction.user.id,
    });
    const full = await getEvent(event.id);
    const embed = await buildEventEmbed(interaction, full);
    await interaction.channel.send({ embeds: [embed], components: eventButtons(event.id) });
    return interaction.reply({ content: `✅ Event created. ID: \`${event.id}\``, ephemeral: true });
  },
};
