const prisma = require("../../../lib/prisma");
const { getEvent } = require("../../../modules/events/service");

// customId: event:remind:{eventId}
module.exports = {
  customIdPrefix: "event:remind:",
  async execute(interaction) {
    const eventId = interaction.customId.split(":")[2];
    const event = await getEvent(eventId);
    if (!event)
      return interaction.reply({
        content: "⚠️ Event not found.",
        ephemeral: true,
      });

    if (["COMPLETED", "CANCELLED"].includes(event.status)) {
      return interaction.reply({
        content: "⚠️ This event has already ended.",
        ephemeral: true,
      });
    }

    const remindAt = new Date(event.scheduledAt.getTime() - 30 * 60 * 1000);
    if (remindAt <= new Date()) {
      return interaction.reply({
        content:
          "⏱️ This event starts in less than 30 minutes — too late for a reminder!",
        ephemeral: true,
      });
    }

    // Upsert reminder
    await prisma.eventRsvp
      .upsert({
        where: { eventId_userId: { eventId, userId: interaction.user.id } },
        update: { status: "GOING" }, // also marks them as going
        create: { eventId, userId: interaction.user.id, status: "GOING" },
      })
      .catch(() => {});

    const unix = Math.floor(remindAt.getTime() / 1000);
    await interaction.reply({
      content: `🔔 Got it! I'll DM you at <t:${unix}:F> (30 minutes before the event starts).`,
      ephemeral: true,
    });
  },
};
