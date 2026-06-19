const {
  setRsvp,
  removeRsvp,
  getEvent,
  buildEventEmbed,
  eventButtons,
} = require("../../../modules/events/service");

const STATUS = {
  going: "GOING",
  maybe: "MAYBE",
  not: "NOT_GOING",
};

module.exports = {
  customIdPrefix: "event:rsvp:",
  async execute(interaction) {
    const [, , statusKey, eventId] = interaction.customId.split(":");
    const newStatus = STATUS[statusKey];
    if (!newStatus)
      return interaction.reply({
        content: "Unknown RSVP option.",
        ephemeral: true,
      });

    const event = await getEvent(eventId);
    if (!event)
      return interaction.reply({
        content: "Event not found.",
        ephemeral: true,
      });
    if (["COMPLETED", "CANCELLED"].includes(event.status)) {
      return interaction.reply({
        content: "⚠️ This event has ended.",
        ephemeral: true,
      });
    }

    // Toggle: clicking same status removes the RSVP
    const existing = event.rsvps.find((r) => r.userId === interaction.user.id);
    if (existing?.status === newStatus) {
      await removeRsvp(eventId, interaction.user.id);
    } else {
      await setRsvp(eventId, interaction.user.id, newStatus);
    }

    const updated = await getEvent(eventId);
    const isLive = updated.status === "LIVE";
    const embed = await buildEventEmbed(interaction, updated);
    await interaction.update({
      embeds: [embed],
      components: eventButtons(
        eventId,
        false,
        updated.eventType,
        updated.teamSize,
        isLive,
      ),
    });
  },
};
