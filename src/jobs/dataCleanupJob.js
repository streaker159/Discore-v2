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

      await prisma.eventRsvp.deleteMany({ where: { eventId: { in: ids } } });
      await prisma.eventNotificationLog.deleteMany({
        where: { eventId: { in: ids } },
      });
      await prisma.eventReminder.deleteMany({
        where: { eventId: { in: ids } },
      });

      const evtDel = await prisma.event.deleteMany({
        where: { id: { in: ids } },
      });

      totalDeleted += evtDel.count;
      logger.info("dataCleanupJob: deleted events", {
        events: evtDel.count,
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

      await prisma.signupParticipant.deleteMany({
        where: { signupId: { in: ids } },
      });
      const signupDel = await prisma.battleSignup.deleteMany({
        where: { id: { in: ids } },
      });

      totalDeleted += signupDel.count;
      logger.info("dataCleanupJob: deleted battle signups", {
        signups: signupDel.count,
      });
    }

    // ── EXPIRED Moderation Cases (older than 7 days) ──────────────────────
    const sevenDaysAgoMs = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const expiredModCases = await prisma.moderationCase.findMany({
      where: { status: "EXPIRED", updatedAt: { lte: sevenDaysAgoMs } },
      select: { id: true, publicId: true },
    });
    if (expiredModCases.length) {
      const ids = expiredModCases.map((c) => c.id);
      await prisma.appeal.deleteMany({ where: { caseId: { in: ids } } });
      await prisma.userRoleSnapshot.deleteMany({
        where: { caseId: { in: ids } },
      });
      const caseDel = await prisma.moderationCase.deleteMany({
        where: { id: { in: ids } },
      });
      totalDeleted += caseDel.count;
      logger.info("dataCleanupJob: hard-deleted expired mod cases", {
        count: caseDel.count,
        ids: expiredModCases.map((c) => c.publicId),
      });
    }

    // ── REVOKED Moderation Cases (older than 30 days) ─────────────────────
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const revokedCases = await prisma.moderationCase.findMany({
      where: {
        status: "REVOKED",
        updatedAt: { lte: thirtyDaysAgo },
      },
      select: { id: true, publicId: true },
    });

    if (revokedCases.length) {
      const ids = revokedCases.map((c) => c.id);
      await prisma.appeal.deleteMany({ where: { caseId: { in: ids } } });
      await prisma.userRoleSnapshot.deleteMany({
        where: { caseId: { in: ids } },
      });
      const caseDel = await prisma.moderationCase.deleteMany({
        where: { id: { in: ids } },
      });

      totalDeleted += caseDel.count;
      logger.info("dataCleanupJob: hard-deleted revoked mod cases", {
        count: caseDel.count,
        ids: revokedCases.map((c) => c.publicId),
      });
    }

    // ── Automod trigger logs past their cleanupAfter date ─────────────────
    const automodDel = await prisma.autoModCase.deleteMany({
      where: { cleanupAfter: { lte: now } },
    });
    if (automodDel.count) {
      totalDeleted += automodDel.count;
      logger.info("dataCleanupJob: deleted expired automod trigger logs", {
        count: automodDel.count,
      });
    }

    // ── Scoreboard action log cap ─
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

    // ── Orphaned UserRoleScore ────────
    const orphanedScores = await prisma.$queryRaw`
      DELETE FROM "UserRoleScore"
      WHERE "scoreboardId" NOT IN (SELECT id FROM "Scoreboard")
    `;
    if (orphanedScores > 0) {
      totalDeleted += Number(orphanedScores);
      logger.info("dataCleanupJob: removed orphaned UserRoleScore rows", {
        count: Number(orphanedScores),
      });
    }

    // ── Orphaned EventNotificationLog ──────
    const orphanedNotifLogs = await prisma.$queryRaw`
      DELETE FROM "EventNotificationLog"
      WHERE "eventId" NOT IN (SELECT id FROM "Event")
    `;
    if (orphanedNotifLogs > 0) {
      totalDeleted += Number(orphanedNotifLogs);
      logger.info(
        "dataCleanupJob: removed orphaned EventNotificationLog rows",
        {
          count: Number(orphanedNotifLogs),
        },
      );
    }

    // ── Orphaned EventReminder ─────────
    const orphanedReminders = await prisma.$queryRaw`
      DELETE FROM "EventReminder"
      WHERE "eventId" NOT IN (SELECT id FROM "Event")
    `;
    if (orphanedReminders > 0) {
      totalDeleted += Number(orphanedReminders);
      logger.info("dataCleanupJob: removed orphaned EventReminder rows", {
        count: Number(orphanedReminders),
      });
    }

    // ── Expired Suggestions ────────────────────────────────────────────
    const expiredSuggestions = await prisma.suggestion.findMany({
      where: { status: "PENDING", expiresAt: { lte: now } },
      select: { id: true, publicId: true },
    });

    if (expiredSuggestions.length) {
      const ids = expiredSuggestions.map((s) => s.id);
      await prisma.suggestion.updateMany({
        where: { id: { in: ids } },
        data: { status: "EXPIRED" },
      });
      logger.info("dataCleanupJob: marked expired suggestions", {
        count: ids.length,
      });
    }

    // ── Deleted suggestions (hard-delete after 7 days) ─────────────────
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const deletedSuggestions = await prisma.suggestion.findMany({
      where: { status: "DELETED", updatedAt: { lte: sevenDaysAgo } },
      select: { id: true },
    });
    if (deletedSuggestions.length) {
      const ids = deletedSuggestions.map((s) => s.id);
      await prisma.suggestionVote.deleteMany({
        where: { suggestionId: { in: ids } },
      });
      const del = await prisma.suggestion.deleteMany({
        where: { id: { in: ids } },
      });
      totalDeleted += del.count;
      logger.info("dataCleanupJob: hard-deleted old suggestions", {
        count: del.count,
      });
    }

    // ── Sniper Challenge runs (30-day retention for ended runs) ──────────
    try {
      const sniperRunDeleted = await prisma.sniperChallengeRun.deleteMany({
        where: {
          status: { in: ["WON", "EXPIRED", "CANCELLED"] },
          createdAt: { lte: thirtyDaysAgo },
        },
      });
      if (sniperRunDeleted.count) {
        totalDeleted += sniperRunDeleted.count;
        logger.info("dataCleanupJob: pruned old sniper challenge runs", {
          count: sniperRunDeleted.count,
        });
      }
    } catch {
      // SniperChallengeRun table may not exist yet (before migration)
    }

    // ── Assassin games (30-day retention for ended games) ──────────────
    try {
      const assassinPlayersDeleted = await prisma.assassinPlayer.deleteMany({
        where: {
          game: {
            status: { in: ["COMPLETED", "CANCELLED"] },
            createdAt: { lte: thirtyDaysAgo },
          },
        },
      });
      if (assassinPlayersDeleted.count) {
        logger.info("dataCleanupJob: pruned orphaned assassin players", {
          count: assassinPlayersDeleted.count,
        });
      }
    } catch {
      // AssassinPlayer table may not exist yet
    }
    try {
      const assassinDel = await prisma.assassinGame.deleteMany({
        where: {
          status: { in: ["COMPLETED", "CANCELLED"] },
          createdAt: { lte: thirtyDaysAgo },
        },
      });
      if (assassinDel.count) {
        totalDeleted += assassinDel.count;
        logger.info("dataCleanupJob: pruned old assassin games", {
          count: assassinDel.count,
        });
      }
    } catch {
      // AssassinGame table may not exist yet
    }

    // ── Old AI usage logs (90-day retention) ───────────────
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oldLogsDel = await prisma.aiUsage.deleteMany({
      where: { createdAt: { lte: ninetyDaysAgo } },
    });
    if (oldLogsDel.count > 0) {
      totalDeleted += oldLogsDel.count;
      logger.info("dataCleanupJob: pruned old AI usage logs", {
        count: oldLogsDel.count,
      });
    }

    // ── Old XP events (90-day retention) ──────────────────────────
    const xpEventDeleted = await prisma.userXpEvent.deleteMany({
      where: { createdAt: { lte: ninetyDaysAgo } },
    });
    if (xpEventDeleted.count) {
      totalDeleted += xpEventDeleted.count;
      logger.info("dataCleanupJob: pruned old XP events", {
        count: xpEventDeleted.count,
      });
    }

    // ── Orphaned UserXp ───────────────────
    const orphanedXp = await prisma.$queryRaw`
      DELETE FROM "UserXp"
      WHERE "guildId" NOT IN (SELECT id FROM "Guild")
    `;
    if (orphanedXp > 0) {
      totalDeleted += Number(orphanedXp);
      logger.info("dataCleanupJob: removed orphaned UserXp rows", {
        count: Number(orphanedXp),
      });
    }

    // ── Orphaned UserXpEvent ──────────────
    const orphanedXpEvents = await prisma.$queryRaw`
      DELETE FROM "UserXpEvent"
      WHERE "guildId" NOT IN (SELECT id FROM "Guild")
    `;
    if (orphanedXpEvents > 0) {
      totalDeleted += Number(orphanedXpEvents);
      logger.info("dataCleanupJob: removed orphaned UserXpEvent rows", {
        count: Number(orphanedXpEvents),
      });
    }

    if (totalDeleted > 0) {
      logger.info("dataCleanupJob: cleanup complete", { totalDeleted });
    }
  },
};
