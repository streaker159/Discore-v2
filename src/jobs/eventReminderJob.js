"use strict";

const prisma = require("../lib/prisma");
const { reminderQueue, notificationQueue } = require("../lib/queue");
const {
  buildEventEmbed,
  buildEventReminderEmbed,
  eventButtons,
  claimNotification,
  getTypeInfo,
} = require("../modules/events/service");
const logger = require("../lib/logger");

/** Format tagRoleIds array into a ping string */
function rolePing(roleIds) {
  if (!Array.isArray(roleIds) || !roleIds.length) return null;
  return roleIds.map((id) => `<@&${id}>`).join(" ");
}

module.exports = {
  name: "eventReminderJob",
  intervalMs: 60_000,
  enabled: true,

  async run(client) {
    const now = new Date();

    // -- Pass 1: Global channel reminders (X minutes before start) ---------
    const pendingReminders = await prisma.event.findMany({
      where: {
        status: "UPCOMING",
        reminderBeforeMinutes: { not: null },
        scheduledAt: { gt: now },
      },
      include: { rsvps: true, guild: true },
    });

    for (const event of pendingReminders) {
      const reminderAt = new Date(
        new Date(event.scheduledAt).getTime() -
          event.reminderBeforeMinutes * 60_000,
      );
      if (reminderAt > now) continue;

      reminderQueue.add(async () => {
        const claimed = await claimNotification(
          event.id,
          event.guildId,
          "REMINDER",
          {
            channelId: event.channelId,
            roleId: (event.tagRoleIds ?? [])[0] ?? null,
          },
        );
        if (!claimed) return;

        try {
          const minsLeft = Math.max(
            1,
            Math.round(
              (new Date(event.scheduledAt).getTime() - Date.now()) / 60_000,
            ),
          );
          const remEmbed = buildEventReminderEmbed(event, minsLeft);
          const ch = await client.channels
            .fetch(event.channelId)
            .catch(() => null);
          if (!ch) return;

          const ping = rolePing(event.tagRoleIds);
          await ch.send({
            content: ping ?? undefined,
            embeds: [remEmbed],
            allowedMentions: event.tagRoleIds?.length
              ? { roles: event.tagRoleIds }
              : { parse: [] },
          });
          logger.info("eventReminderJob: sent channel reminder", {
            id: event.id,
          });
        } catch (err) {
          logger.error("eventReminderJob: reminder failed", {
            id: event.id,
            error: err.message,
          });
        }
      });
    }

    // -- Pass 2: Transition UPCOMING ? LIVE --------------------------------
    const starting = await prisma.event.findMany({
      where: { status: "UPCOMING", scheduledAt: { lte: now } },
      include: { rsvps: true, guild: true },
    });

    for (const event of starting) {
      reminderQueue.add(async () => {
        const claimed = await claimNotification(
          event.id,
          event.guildId,
          "START",
          {
            channelId: event.channelId,
            roleId: (event.tagRoleIds ?? [])[0] ?? null,
          },
        );
        if (!claimed) return;

        try {
          const liveEvent = await prisma.event.update({
            where: { id: event.id },
            data: {
              status: "LIVE",
              cleanupAfter: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
            include: { rsvps: true, guild: true },
          });

          const ch = await client.channels
            .fetch(event.channelId)
            .catch(() => null);
          if (ch) {
            if (event.messageId) {
              const msg = await ch.messages
                .fetch(event.messageId)
                .catch(() => null);
              if (msg) {
                const updatedEmbed = await buildEventEmbed(
                  event.guildId,
                  liveEvent,
                );
                await msg
                  .edit({
                    embeds: [updatedEmbed],
                    components: eventButtons(
                      event.id,
                      false,
                      event.eventType,
                      event.teamSize,
                      true, // isLive
                    ),
                  })
                  .catch(() => {});
              }
            }

            if (event.tagRoleIds?.length && event.tagOnStart) {
              const { icon, label } = getTypeInfo(event);
              notificationQueue.add(() =>
                ch
                  .send({
                    content: `${event.tagRoleIds.map((id) => `<@&${id}>`).join(" ")} — ${icon} **${label}: ${event.title}** is starting now!`,
                    allowedMentions: { roles: event.tagRoleIds },
                  })
                  .catch(() => {}),
              );
            }
          }

          // DM going/maybe users — each gets its own queue slot (600ms apart)
          const goingUsers = liveEvent.rsvps
            .filter((r) => r.status === "GOING" || r.status === "MAYBE")
            .map((r) => r.userId);
          const dmEmbed = buildEventReminderEmbed(event, 0);
          for (const userId of goingUsers) {
            notificationQueue.add(async () => {
              const user = await client.users.fetch(userId).catch(() => null);
              if (user) await user.send({ embeds: [dmEmbed] }).catch(() => {});
            });
          }

          logger.info("eventReminderJob: transitioned to LIVE", {
            id: event.id,
          });
        } catch (err) {
          logger.error("eventReminderJob: start transition failed", {
            id: event.id,
            error: err.message,
          });
        }
      });
    }

    // -- Pass 3: Personal user reminders -----------------------------------
    const personalDue = await prisma.eventReminder.findMany({
      where: { sentAt: null, remindAt: { lte: now } },
      include: { event: true },
    });

    for (const reminder of personalDue) {
      reminderQueue.add(async () => {
        try {
          const user = await client.users
            .fetch(reminder.userId)
            .catch(() => null);
          if (user && reminder.event) {
            const minsUntil = Math.max(
              0,
              Math.round(
                (new Date(reminder.event.scheduledAt).getTime() - Date.now()) /
                  60_000,
              ),
            );
            const embed = buildEventReminderEmbed(reminder.event, minsUntil);
            embed.setTitle("\u23F0 Your Event Reminder");
            await user.send({ embeds: [embed] }).catch(() => {});
          }
          await prisma.eventReminder.update({
            where: { id: reminder.id },
            data: { sentAt: now },
          });
        } catch (err) {
          logger.error("eventReminderJob: personal reminder failed", {
            id: reminder.id,
            error: err.message,
          });
        }
      });
    }
  },
};
