const { setRsvp, getEvent, buildEventEmbed, eventButtons } = require('../../../modules/events/service');

const STATUS = {
  going: 'GOING',
  maybe: 'MAYBE',
  not: 'NOT_GOING',
};

module.exports = {
  customIdPrefix: 'event:rsvp:',
  async execute(interaction) {
    const [, , statusKey, eventId] = interaction.customId.split(':');
    await setRsvp(eventId, interaction.user.id, STATUS[statusKey]);
    const event = await getEvent(eventId);
    const embed = await buildEventEmbed(interaction, event);
    await interaction.update({ embeds: [embed], components: eventButtons(eventId) });
  },
};
