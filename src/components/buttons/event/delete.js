"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");
const prisma = require("../../../lib/prisma");
const { notificationQueue } = require("../../../lib/queue");
const {
  getEvent,
  buildEventEmbed,
  eventButtons,
  closeEvent,
} = require("../../../modules/events/service");

function canManageEvent(interaction, event) {
  if (event.createdBy === interaction.user.id) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  return false;
}

async function hardDelete(eventId) {
  await prisma
    .$transaction([
      prisma.eventReminder.deleteMany({ where: { eventId } }),
      prisma.eventNotificationLog.deleteMany({ where: { eventId } }),
      prisma.eventRsvp.deleteMany({ where: { eventId } }),
      prisma.event.delete({ where: { id: eventId } }),
    ])
    .catch(() => {});
}

// customId: event:delete:{eventId}
// customId confirm: event:delete:confirm:{eventId}
// customId dismiss: event:delete:cancel:{eventId}
module.exports = {
  customIdPrefix: "event:delete:",

  async execute(interaction) {
    const parts = interaction.customId.split(":");

    // Dismiss — user clicked "No, keep it"
    if (parts[2] === "cancel") {
      return interaction.update({
        content: "OK, the event was kept.",
        components: [],
        embeds: [],
      });
    }

    // Confirm step (event:delete:confirm:{eventId})
    if (parts[2] === "confirm" && parts[3]) {
      const eventId = parts[3];
      const event = await getEvent(eventId);
      if (!event)
        return interaction.update({
          content: "Event not found — it may already have been deleted.",
          components: [],
          embeds: [],
        });

      if (!canManageEvent(interaction, event)) {
        return interaction.reply({
          content: "Only the event creator or a server admin (Manage Server / Administrator) can do that.",
          flags: 64,
        });
      }

      // Mark CANCELLED — keep the embed visible but greyed out, strip buttons to Refresh only
      await closeEvent(eventId, "CANCELLED");
      const cancelled = await getEvent(eventId);
      const embed = await buildEventEmbed(interaction, cancelled);
      const isEnded = true;

      // Update the original event message in the channel
      let originalMsg = null;
      if (event.channelId && event.messageId) {
        try {
          const ch =
            interaction.guild.channels.cache.get(event.channelId) ??
            (await interaction.guild.channels.fetch(event.channelId).catch(() => null));
          if (ch) {
            originalMsg = await ch.messages.fetch(event.messageId).catch(() => null);
            if (originalMsg) {
              await originalMsg
                .edit({
                  embeds: [embed],
                  components: eventButtons(eventId, isEnded, event.eventType, event.teamSize),
                })
                .catch(() => {});
            }

            // Send cancellation ping — queue it so we don't spam the API
            const roles = event.tagRoleIds ?? [];
            const pingStr = roles.length
              ? roles.map((id) => `<@&${id}>`).join(" ") + " "
              : "";
            notificationQueue.add(() =>
              ch
                .send({
                  content: `${pingStr}**${event.title}** has been cancelled.`,
                  allowedMentions: roles.length ? { roles } : { parse: [] },
                })
                .catch(() => {}),
            );
          }
        } catch {
          // channel/message may be gone — no problem
        }
      }

      // Dismiss the ephemeral confirmation prompt
      return interaction.update({
        content: `Event **${event.title}** has been marked as cancelled and all attendees notified.`,
        components: [],
        embeds: [],
      });
    }

    // Initial click — show confirmation dialog
    const eventId = parts[2];
    const event = await getEvent(eventId);
    if (!event)
      return interaction.reply({ content: "Event not found.", flags: 64 });

    if (!canManageEvent(interaction, event)) {
      return interaction.reply({
        content: "Only the event creator or a server admin (Manage Server / Administrator) can cancel this event.",
        flags: 64,
      });
    }

    // LIVE events — no confirmation needed, immediate cancel + notify
    if (event.status === "LIVE") {
      await hardDelete(eventId);
      await interaction.message.delete().catch(() => {});
      return interaction.reply({
        content: "Event embed removed and all data deleted.",
        flags: 64,
      });
    }

    // UPCOMING — confirmation dialog
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`event:delete:confirm:${eventId}`)
        .setLabel("Yes, cancel it")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`event:delete:cancel:${eventId}`)
        .setLabel("No, keep it")
        .setStyle(ButtonStyle.Secondary),
    );

    return interaction.reply({
      content: `Are you sure you want to cancel **${event.title}**?\nThe embed will be updated to Cancelled and all tagged roles will be notified.`,
      components: [confirmRow],
      flags: 64,
    });
  },
};