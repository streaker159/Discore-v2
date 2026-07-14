"use strict";

const prisma = require("../lib/prisma");
const {
  purgeSuggestion,
  buildSuggestionEmbed,
  buildSuggestionButtons,
  buildAdminButtons,
} = require("../modules/suggestions/service");

const DEBUG = process.env.DEBUG_SUGGESTION_CLEANUP === "true";

function debugLog(...args) {
  if (DEBUG) console.log("[SuggestionCleanupJob]", ...args);
}

async function run(client) {
  const now = new Date();
  let closedExpired = 0;
  let purged = 0;

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

  if (DEBUG && (closedExpired > 0 || purged > 0)) {
    console.log(
      `[SuggestionCleanupJob] Closed: ${closedExpired}, Purged: ${purged}`,
    );
  }
}

let running = false;

/**
 * On bot startup, refresh all existing active suggestion embeds
 * to the new format with admin buttons, vote results, etc.
 */
async function refreshAllEmbedsOnStartup(client) {
  try {
    const suggestions = await prisma.suggestion.findMany({
      where: {
        status: { in: ["OPEN", "PENDING", "UNDER_REVIEW"] },
        messageId: { not: null },
      },
      include: { votes: true },
    });

    if (!suggestions.length) {
      console.log("[SuggestionRefresh] No active suggestions to refresh.");
      return;
    }

    console.log(
      `[SuggestionRefresh] Refreshing ${suggestions.length} active suggestion embeds...`,
    );

    let refreshed = 0;
    for (const s of suggestions) {
      try {
        const ch = await client.channels.fetch(s.channelId).catch(() => null);
        if (!ch) continue;
        const msg = await ch.messages.fetch(s.messageId).catch(() => null);
        if (!msg) continue;

        const embed = await buildSuggestionEmbed(s);
        const components = [
          ...buildSuggestionButtons(s),
          ...buildAdminButtons(s),
        ];
        await msg.edit({ embeds: [embed], components }).catch(() => {});
        refreshed++;
      } catch {
        // skip individual failures
      }
    }

    console.log(
      `[SuggestionRefresh] Refreshed ${refreshed}/${suggestions.length} suggestion embeds.`,
    );
  } catch (err) {
    console.error("[SuggestionRefresh] Error:", err.message);
  }
}

function startSuggestionCleanupJob(client) {
  const intervalMs = 1 * 60 * 60 * 1000; // Every 1 hour

  // Refresh embeds 10s after start — client is already logged in
  // but guild/channel caches need time to populate.
  setTimeout(() => {
    console.log("[SuggestionRefresh] Starting embed refresh...");
    refreshAllEmbedsOnStartup(client).catch((e) =>
      console.error("[SuggestionRefresh] Startup failed:", e.message),
    );
  }, 10000);

  setInterval(
    () =>
      run(client).catch((e) =>
        console.error("[SuggestionCleanupJob]", e.message),
      ),
    intervalMs,
  );
  console.log("[SuggestionCleanupJob] Started — interval:", intervalMs);
}

module.exports = { startSuggestionCleanupJob };
