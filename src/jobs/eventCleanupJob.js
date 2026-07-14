"use strict";

const prisma = require("../lib/prisma");

async function run(client) {
  const now = new Date();
  let draftDeleted = 0;

  try {
    const draftCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const drafts = await prisma.event.findMany({
      where: { status: "DRAFT", draftedAt: { lt: draftCutoff } },
      select: { id: true },
    });
    for (const d of drafts) {
      await prisma
        .$transaction([
          prisma.eventReminder.deleteMany({ where: { eventId: d.id } }),
          prisma.eventNotificationLog.deleteMany({ where: { eventId: d.id } }),
          prisma.eventRsvp.deleteMany({ where: { eventId: d.id } }),
          prisma.event.delete({ where: { id: d.id } }),
        ])
        .catch(() => {});
      draftDeleted++;
    }

    const expired = await prisma.event.findMany({
      where: { dataDeleteAt: { lt: now } },
      select: { id: true },
    });
    for (const e of expired) {
      await prisma
        .$transaction([
          prisma.eventReminder.deleteMany({ where: { eventId: e.id } }),
          prisma.eventNotificationLog.deleteMany({ where: { eventId: e.id } }),
          prisma.eventRsvp.deleteMany({ where: { eventId: e.id } }),
          prisma.event.delete({ where: { id: e.id } }),
        ])
        .catch(() => {});
    }
  } catch (err) {
    console.error("[EventCleanupJob] Error:", err.message);
  }

  if (draftDeleted > 0) {
    console.log("[EventCleanupJob] Cleaned " + draftDeleted + " drafts.");
  }
}

let running = false;

module.exports = {
  name: "eventCleanupJob",
  intervalMs: 3 * 60 * 60 * 1000,
  async run(client) {
    if (running) return;
    running = true;
    try {
      await run(client);
    } finally {
      running = false;
    }
  },
};
