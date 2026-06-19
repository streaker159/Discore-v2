"use strict";

const prisma = require("../../../lib/prisma");
const {
  getEvent,
  buildEventEmbed,
  closeEvent,
  eventButtons,
} = require("../../../modules/events/service");

/**
 * Hard-delete all DB rows for an event and optionally delete the Discord message.
 */
async function hardDelete(eventId, interaction) {
  await prisma.eventReminder.deleteMany({ where: { eventId } }).catch(() => {});
  await prisma.eventNotificationLog
    .deleteMany({ where: { eventId } })
    .catch(() => {});
  await prisma.eventRsvp.deleteMany({ where: { eventId } }).catch(() => {});
  await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
}

// customId: event:delete:{eventId}
// customId for confirm: event:delete:confirm:{eventId}
module.exports = {
  customIdPrefix: "event:delete:",
  async execute(interaction) {
    const parts = interaction.customId.split(":");

    // ── confirm step (for UPCOMING events only) ──────────────────────────
    if (parts[2] === "confirm" && parts[3]) {
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

      // Update embed to CANCELLED then hard-delete DB rows
      const embed = await buildEventEmbed(interaction, {
        ...event,
        status: "CANCELLED",
      });
      await interaction.update({ embeds: [embed], components: [] });
      await hardDelete(eventId, interaction);
      return;
    }

    // ── initial click ─────────────────────────────────────────────────────
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

    // ── LIVE events: no confirmation — just wipe DB and delete message ────
    if (event.status === "LIVE") {
      await hardDelete(eventId, interaction);
      // Delete the Discord message entirely (the embed disappears)
      await interaction.message.delete().catch(() => {});
      return interaction.reply({
        content: "🗑️ Event embed removed and all data deleted.",
        ephemeral: true,
      });
    }

    // ── UPCOMING: ask for confirmation ────────────────────────────────────
    const {
      ActionRowBuilder,
      ButtonBuilder,
      ButtonStyle,
    } = require("discord.js");
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`event:delete:confirm:${eventId}`)
        .setLabel("Yes, cancel it")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger),
    );

    await interaction.reply({
      content: `⚠️ Are you sure you want to cancel **${event.title}**? The embed will be updated to Cancelled and all data removed.`,
      components: [confirmRow],
      ephemeral: true,
    });
  },
};

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

      // Schedule for cleanup instead of hard-deleting immediately
      await closeEvent(eventId, "CANCELLED");
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
