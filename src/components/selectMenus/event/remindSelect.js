"use strict";

const {
  getEvent,
  setEventReminder,
  removeEventReminder,
} = require("../../../modules/events/service");

// customId: event:remind_select:{eventId}
module.exports = {
  customIdPrefix: "event:remind_select:",
  async execute(interaction) {
    const eventId = interaction.customId.split(":")[2];
    const value = interaction.values[0];

    if (value === "cancel") {
      await removeEventReminder(eventId, interaction.user.id).catch(() => {});
      return interaction.update({
        content: "🔕 Reminder cancelled.",
        components: [],
      });
    }

    const event = await getEvent(eventId);
    if (!event)
      return interaction.update({
        content: "⚠️ Event no longer exists.",
        components: [],
      });

    const minsBeforeStart = parseInt(value, 10);
    const remindAt = new Date(
      new Date(event.scheduledAt).getTime() - minsBeforeStart * 60_000,
    );

    if (remindAt <= new Date()) {
      return interaction.update({
        content: "⏱️ That reminder time has already passed.",
        components: [],
      });
    }

    await setEventReminder(eventId, interaction.user.id, remindAt);

    const unix = Math.floor(remindAt.getTime() / 1000);
    const label =
      minsBeforeStart >= 60
        ? `${minsBeforeStart / 60}h`
        : `${minsBeforeStart}m`;
    return interaction.update({
      content: `🔔 Got it! I'll DM you **${label} before** the event starts (<t:${unix}:R>).`,
      components: [],
    });
  },
};
