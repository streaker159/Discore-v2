"use strict";

const {
  getEvent,
  buildEventEmbed,
  eventButtons,
} = require("../../../modules/events/service");

// customId: event:refresh:{eventId}
module.exports = {
  customIdPrefix: "event:refresh:",
  async execute(interaction) {
    const eventId = interaction.customId.split(":")[2];
    const event = await getEvent(eventId);
    if (!event)
      return interaction.update({
        content:
          "ℹ️ This event has ended and its Discore data has been cleaned up.",
        embeds: [],
        components: [],
      });

    const isEnded = ["COMPLETED", "CANCELLED", "EXPIRED"].includes(
      event.status,
    );
    const isLive = event.status === "LIVE";
    const embed = await buildEventEmbed(interaction, event);
    return interaction.update({
      embeds: [embed],
      components: eventButtons(
        event.id,
        isEnded,
        event.eventType,
        event.teamSize,
        isLive,
      ),
    });
  },
};
