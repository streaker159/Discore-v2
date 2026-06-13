const prisma = require("../lib/prisma");
const { reminderQueue } = require("../lib/queue");
const {
  buildEventEmbed,
  buildEventReminderEmbed,
} = require("../modules/events/service");
const logger = require("../lib/logger");

module.exports = {
  name: "eventReminderJob",
  intervalMs: 60_000,
  enabled: true,
  async run(client) {
    const now = new Date();
    const in31Min = new Date(now.getTime() + 31 * 60 * 1000);

    // Find UPCOMING events starting within the next 30 minutes, reminder not yet sent
    const upcoming = await prisma.event.findMany({
      where: {
        status: "UPCOMING",
        reminderSent: false,
        scheduledAt: { gte: now, lte: in31Min },
      },
      include: { rsvps: true, guild: true },
    });

    for (const event of upcoming) {
      reminderQueue.add(async () => {
        try {
          const minsUntil = Math.round(
            (new Date(event.scheduledAt).getTime() - Date.now()) / 60_000,
          );
          const dmEmbed = buildEventReminderEmbed(
            event,
            Math.max(minsUntil, 1),
          );

          // DM every RSVP'd user (GOING or MAYBE)
          const userIds = event.rsvps
            .filter((r) => r.status === "GOING" || r.status === "MAYBE")
            .map((r) => r.userId);

          for (const userId of userIds) {
            const user = await client.users.fetch(userId).catch(() => null);
            if (user) await user.send({ embeds: [dmEmbed] }).catch(() => {});
          }

          // Mark event as LIVE
          await prisma.event.update({
            where: { id: event.id },
            data: { status: "LIVE", reminderSent: true },
          });

          // Update the live channel message — remove buttons, add "starting now" banner
          if (event.messageId && event.channelId) {
            const liveEvent = await prisma.event.findUnique({
              where: { id: event.id },
              include: { rsvps: true, guild: true },
            });
            const ch = await client.channels
              .fetch(event.channelId)
              .catch(() => null);
            if (ch && liveEvent) {
              const msg = await ch.messages
                .fetch(event.messageId)
                .catch(() => null);
              if (msg) {
                const updatedEmbed = await buildEventEmbed(
                  event.guildId,
                  liveEvent,
                );
                await msg
                  .edit({ embeds: [updatedEmbed], components: [] })
                  .catch(() => {});
              }

              // Ping tagOnStart role if set
              if (event.tagOnStart) {
                await ch
                  .send(
                    `<@&${event.tagOnStart}> — 🚀 **${event.title}** is starting now!`,
                  )
                  .catch(() => {});
              }
            }
          }

          logger.info("eventReminderJob: sent reminders", {
            id: event.id,
            dmCount: userIds.length,
          });
        } catch (error) {
          logger.error("eventReminderJob failed for event", {
            id: event.id,
            error: error.message,
          });
        }
      });
    }
  },
};
