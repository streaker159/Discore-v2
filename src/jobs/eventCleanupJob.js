"use strict";

/**
 * eventCleanupJob — runs every 3 hours.
 *
 * For each event past its cleanupAfter time (or older than 7 days with no
 * cleanupAfter set), it:
 *  1. Deletes the Discord embed message from the channel
 *  2. Deletes all DB rows (reminders, RSVP, notification log, event)
 */

const prisma = require("../lib/prisma");
const logger = require("../lib/logger");

const BATCH_SIZE = 25;
// Fallback: treat events with no cleanupAfter as 7 days after their scheduled time
const FALLBACK_DAYS = 7;

module.exports = {
  name: "eventCleanupJob",
  intervalMs: 3 * 60 * 60_000, // every 3 hours
  enabled: true,

  async run(client) {
    const now = new Date();
    const fallbackCutoff = new Date(
      now.getTime() - FALLBACK_DAYS * 24 * 60 * 60 * 1000,
    );

    try {
      const events = await prisma.event.findMany({
        where: {
          status: { in: ["COMPLETED", "CANCELLED", "EXPIRED", "LIVE"] },
          OR: [
            { cleanupAfter: { lte: now } },
            // fallback for old events that never had cleanupAfter set
            { cleanupAfter: null, scheduledAt: { lte: fallbackCutoff } },
          ],
        },
        select: {
          id: true,
          title: true,
          guildId: true,
          channelId: true,
          messageId: true,
          status: true,
        },
        take: BATCH_SIZE,
        orderBy: { scheduledAt: "asc" },
      });

      if (!events.length) return;

      let cleaned = 0;
      for (const ev of events) {
        try {
          // Try to delete the Discord message
          if (ev.channelId && ev.messageId && client) {
            try {
              const guild = client.guilds.cache.get(ev.guildId);
              const ch =
                guild?.channels?.cache.get(ev.channelId) ??
                (await guild?.channels?.fetch(ev.channelId).catch(() => null));
              if (ch) {
                const msg = await ch.messages
                  .fetch(ev.messageId)
                  .catch(() => null);
                if (msg) await msg.delete().catch(() => {});
              }
            } catch {
              // best-effort — channel/message may already be gone
            }
          }

          // Wipe DB rows
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
        logger.info("eventCleanupJob: cleaned events", {
          cleaned,
          total: events.length,
        });
      }
    } catch (err) {
      logger.error("eventCleanupJob: run failed", { error: err.message });
    }
  },
};