"use strict";

const prisma = require("../lib/prisma");
const { purgeSuggestion } = require("../modules/suggestions/service");

const DEBUG = process.env.DEBUG_SUGGESTION_CLEANUP === "true";

function debugLog(...args) {
  if (DEBUG) console.log("[SuggestionCleanupJob]", ...args);
}

async function run(client) {
  const now = new Date();
  let closedExpired = 0;
  let purged = 0;
  let draftsRemoved = 0;

  try {
    // 1. Close suggestions past closesAt that are still active
    const toClose = await prisma.suggestion.findMany({
      where: {
        closesAt: { lt: now },
        status: { in: ["OPEN", "PENDING", "UNDER_REVIEW"] },
      },
      select: { id: true, publicId: true, status: true },
    });

    for (const s of toClose) {
      await prisma.suggestion
        .update({
          where: { id: s.id },
          data: { status: "CLOSED", updatedAt: new Date() },
        })
        .catch(() => {});
      closedExpired++;
      debugLog("Closed expired", { publicId: s.publicId });
    }

    // 2. Purge suggestions past dataDeleteAt
    const toPurge = await prisma.suggestion.findMany({
      where: { dataDeleteAt: { lt: now } },
      select: { id: true, publicId: true },
    });

    for (const s of toPurge) {
      await purgeSuggestion(s.id).catch(() => {});
      purged++;
      debugLog("Purged", { publicId: s.publicId });
    }

    // 3. Purge DELETED suggestions that are older than 1 hour
    const deleteCutoff = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const deletedToPurge = await prisma.suggestion.findMany({
      where: {
        status: "DELETED",
        updatedAt: { lt: deleteCutoff },
      },
      select: { id: true, publicId: true },
    });

    for (const s of deletedToPurge) {
      await purgeSuggestion(s.id).catch(() => {});
      purged++;
      debugLog("Purged deleted", { publicId: s.publicId });
    }
  } catch (err) {
    console.error("[SuggestionCleanupJob] Error:", err.message);
    if (DEBUG) console.error(err.stack);
  }

  if (DEBUG && (closedExpired > 0 || purged > 0 || draftsRemoved > 0)) {
    console.log(
      `[SuggestionCleanupJob] Closed: ${closedExpired}, Purged: ${purged}, Drafts removed: ${draftsRemoved}`,
    );
  }
}

let running = false;

module.exports = {
  name: "suggestionCleanupJob",
  intervalMs: 1 * 60 * 60 * 1000, // Every 1 hour
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
