"use strict";

/**
 * eventCleanupJob — runs every 3 hours, processes in small batches.
 *
 * Deletes database rows for events past their cleanupAfter date.
 * The Discord embed is NOT touched — it stays in the server.
 * Buttons on cleaned events show a graceful "event ended" message
 * (handled in the button components via getEvent returning null).
 *
 * Cleanup order:
 *   1. EventReminder rows
 *   2. EventNotificationLog rows
 *   3. EventRsvp rows
 *   4. Event row
 */

const prisma = require("../lib/prisma");
const logger = require("../lib/logger");

const BATCH_SIZE = 25;

module.exports = {
  name: "eventCleanupJob",
  intervalMs: 3 * 60 * 60_000, // every 3 hours
  enabled: true,

  async run(_client) {
    const now = new Date();

    try {
      const events = await prisma.event.findMany({
        where: {
          cleanupAfter: { lte: now },
          status: { in: ["COMPLETED", "CANCELLED", "EXPIRED", "LIVE"] },
        },
        select: { id: true, title: true, guildId: true, status: true },
        take: BATCH_SIZE,
        orderBy: { cleanupAfter: "asc" },
      });

      if (!events.length) return;

      let cleaned = 0;
      for (const ev of events) {
        try {
          await prisma.$transaction([
            prisma.eventReminder.deleteMany({ where: { eventId: ev.id } }),
            prisma.eventNotificationLog.deleteMany({
              where: { eventId: ev.id },
            }),
            prisma.eventRsvp.deleteMany({ where: { eventId: ev.id } }),
            prisma.event.delete({ where: { id: ev.id } }),
          ]);
          cleaned++;
        } catch (err) {
          logger.error("eventCleanupJob: failed to delete event", {
            id: ev.id,
            title: ev.title,
            error: err.message,
          });
        }
      }

      if (cleaned > 0) {
        logger.info("eventCleanupJob: cleaned DB rows", {
          cleaned,
          total: events.length,
        });
      }
    } catch (err) {
      logger.error("eventCleanupJob: run failed", { error: err.message });
    }
  },
};
