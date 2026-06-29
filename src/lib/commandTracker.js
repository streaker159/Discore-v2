"use strict";

const prisma = require("./prisma");

/**
 * Fire-and-forget command usage tracker.
 * Records every slash command execution for analytics.
 * Never throws — always catches and logs silently.
 */
function trackCommand({
  guildId,
  userId,
  commandName,
  subcommand,
  success = true,
  durationMs,
}) {
  setImmediate(async () => {
    try {
      await prisma.botCommandUsage.create({
        data: {
          guildId: guildId || null,
          userId,
          commandName,
          subcommand: subcommand || null,
          success,
          durationMs:
            typeof durationMs === "number" ? Math.round(durationMs) : null,
        },
      });
    } catch {
      // Silently ignore — tracking failures must not break commands
    }
  });
}

module.exports = { trackCommand };
