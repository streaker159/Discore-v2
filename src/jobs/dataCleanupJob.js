/**
 * dataCleanupJob — runs every 3 hours.
 *
 * Deletes expired event/battle data after their cleanupAfter date passes.
 * Only removes data where cleanupAfter IS set (explicitly scheduled for removal).
 *
 * What gets deleted:
 *   - EventRsvp rows for expired events
 *   - Event rows where cleanupAfter <= now
 *   - SignupParticipant rows for expired battle signups
 *   - BattleSignup rows where cleanupAfter <= now
 *   - Old ScoreboardAction logs beyond the 200-per-board cap (safety sweep)
 */
const prisma = require("../lib/prisma");
const logger = require("../lib/logger");

module.exports = {
  name: "dataCleanupJob",
  intervalMs: 3 * 60 * 60 * 1000, // 3 hours
  enabled: true,

  async run(_client) {
    const now = new Date();
    let totalDeleted = 0;

    // ── Events ─────────────────────────────────────────────────────────────
    const expiredEvents = await prisma.event.findMany({
      where: { cleanupAfter: { lte: now } },
      select: { id: true, title: true },
    });

    if (expiredEvents.length) {
      const ids = expiredEvents.map((e) => e.id);

      const rsvpDel = await prisma.eventRsvp.deleteMany({
        where: { eventId: { in: ids } },
      });
      const evtDel = await prisma.event.deleteMany({
        where: { id: { in: ids } },
      });

      totalDeleted += rsvpDel.count + evtDel.count;
      logger.info("dataCleanupJob: deleted events", {
        events: evtDel.count,
        rsvps: rsvpDel.count,
        titles: expiredEvents.map((e) => e.title),
      });
    }

    // ── Battle Signups ──────────────────────────────────────────────────────
    const expiredSignups = await prisma.battleSignup.findMany({
      where: { cleanupAfter: { lte: now } },
      select: { id: true, title: true },
    });

    if (expiredSignups.length) {
      const ids = expiredSignups.map((s) => s.id);

      const partDel = await prisma.signupParticipant.deleteMany({
        where: { signupId: { in: ids } },
      });
      const signupDel = await prisma.battleSignup.deleteMany({
        where: { id: { in: ids } },
      });

      totalDeleted += partDel.count + signupDel.count;
      logger.info("dataCleanupJob: deleted battle signups", {
        signups: signupDel.count,
        participants: partDel.count,
      });
    }

    // ── Scoreboard action log cap (safety sweep: keep newest 200 per board) ─
    // Only prune boards with more than 200 actions to avoid hammering the DB
    const heavyBoards = await prisma.scoreboardAction.groupBy({
      by: ["scoreboardId"],
      _count: { id: true },
      having: { id: { _count: { gt: 200 } } },
    });

    for (const { scoreboardId } of heavyBoards) {
      const oldest = await prisma.scoreboardAction.findMany({
        where: { scoreboardId },
        orderBy: { createdAt: "desc" },
        skip: 200,
        select: { id: true },
      });
      if (oldest.length) {
        const del = await prisma.scoreboardAction.deleteMany({
          where: { id: { in: oldest.map((r) => r.id) } },
        });
        totalDeleted += del.count;
      }
    }

    if (totalDeleted > 0) {
      logger.info("dataCleanupJob: cleanup complete", { totalDeleted });
    }
  },
};
