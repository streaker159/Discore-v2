const prisma = require("../../../lib/prisma");
const {
  getEvent,
  buildEventEmbed,
} = require("../../../modules/events/service");

// customId: event:delete:{eventId}
// customId for confirm: event:delete:confirm:{eventId}
module.exports = {
  customIdPrefix: "event:delete:",
  async execute(interaction) {
    const parts = interaction.customId.split(":");

    // ── confirm step ─────────────────────────────────────────────────────
    if (parts[3] && parts[2] === "confirm") {
      // event:delete:confirm:{eventId}
      const eventId = parts[3];
      const event = await getEvent(eventId);
      if (!event)
        return interaction.reply({
          content: "⚠️ Event not found.",
          ephemeral: true,
        });

      if (
        event.createdBy !== interaction.user.id &&
        !interaction.memberPermissions?.has(8n)
      ) {
        return interaction.reply({
          content:
            "🚫 Only the event creator or an admin can delete this event.",
          ephemeral: true,
        });
      }

      // Edit the original message to a "deleted" state and remove buttons
      const embed = await buildEventEmbed(interaction, {
        ...event,
        status: "CANCELLED",
      });
      await interaction.update({ embeds: [embed], components: [] });

      // Remove from DB
      await prisma.eventRsvp.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } });
      return;
    }

    // ── initial click — ask for confirm ──────────────────────────────────
    const eventId = parts[2];
    const event = await getEvent(eventId);
    if (!event)
      return interaction.reply({
        content: "⚠️ Event not found.",
        ephemeral: true,
      });

    if (
      event.createdBy !== interaction.user.id &&
      !interaction.memberPermissions?.has(8n)
    ) {
      return interaction.reply({
        content: "🚫 Only the event creator or an admin can delete this event.",
        ephemeral: true,
      });
    }

    const {
      ActionRowBuilder,
      ButtonBuilder,
      ButtonStyle,
    } = require("discord.js");
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`event:delete:confirm:${eventId}`)
        .setLabel("Yes, delete it")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger),
    );

    await interaction.reply({
      content: `⚠️ Are you sure you want to delete **${event.title}**? This cannot be undone.`,
      components: [confirmRow],
      ephemeral: true,
    });
  },
};
