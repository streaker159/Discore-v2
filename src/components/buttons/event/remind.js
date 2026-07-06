"use strict";

const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const {
  getEvent,
  setEventReminder,
  removeEventReminder,
} = require("../../../modules/events/service");

// customId: event:remind:{eventId}
module.exports = {
  customIdPrefix: "event:remind:",
  async execute(interaction) {
    const eventId = interaction.customId.split(":")[2];
    const event = await getEvent(eventId);
    if (!event)
      return interaction.reply({
        content: "⚠️ Event not found.",
        flags: 64,
      });
    if (["COMPLETED", "CANCELLED", "EXPIRED"].includes(event.status))
      return interaction.reply({
        content: "⚠️ This event has already ended.",
        flags: 64,
      });

    const now = Date.now();
    const startMs = new Date(event.scheduledAt).getTime();
    const diffMs = startMs - now;
    if (diffMs <= 0)
      return interaction.reply({
        content: "⏱️ This event has already started.",
        flags: 64,
      });

    // Build reminder options filtered to what's still in the future
    const options = [
      { label: "10 minutes before", value: "10" },
      { label: "30 minutes before", value: "30" },
      { label: "1 hour before", value: "60" },
      { label: "3 hours before", value: "180" },
      { label: "6 hours before", value: "360" },
      { label: "24 hours before", value: "1440" },
      { label: "❌ Cancel my reminder", value: "cancel" },
    ].filter(
      (o) => o.value === "cancel" || diffMs > parseInt(o.value, 10) * 60_000,
    );

    if (options.filter((o) => o.value !== "cancel").length === 0)
      return interaction.reply({
        content: "⏱️ Not enough time left to set a reminder.",
        flags: 64,
      });

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`event:remind_select:${eventId}`)
        .setPlaceholder("When should I remind you?")
        .addOptions(options),
    );

    return interaction.reply({
      content: "🔔 When would you like to be reminded?",
      components: [row],
      flags: 64,
    });
  },
};
