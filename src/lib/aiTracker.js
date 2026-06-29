"use strict";

const prisma = require("./prisma");

/**
 * Fire-and-forget AI usage tracker.
 * Records AI request attempts for analytics.
 * Never throws — always catches and logs silently.
 */
function trackAiUsage({ guildId, userId, success = true, creditsUsed = 0 }) {
  setImmediate(async () => {
    try {
      await prisma.botAiUsage.create({
        data: {
          guildId: guildId || null,
          userId: userId || null,
          success,
          creditsUsed,
        },
      });
    } catch {
      // Silently ignore
    }
  });
}

module.exports = { trackAiUsage };
