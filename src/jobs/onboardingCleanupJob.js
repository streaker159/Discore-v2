"use strict";

const db = require("../modules/onboarding/onboardingDb");
const logger = require("../lib/logger");

const JOB_NAME = "onboardingCleanup";
const INTERVAL_MS = 15 * 60 * 1000; // Every 15 minutes

module.exports = {
  name: JOB_NAME,
  intervalMs: INTERVAL_MS,
  enabled: true,

  async run(client) {
    try {
      // Clean up expired sessions
      const expiredSessions = await db.getExpiredSessions();

      for (const session of expiredSessions) {
        try {
          // If the session has an applicationId and it's still a DRAFT, delete it
          if (session.applicationId) {
            const app = await db.getApplicationById(session.applicationId);
            if (app && app.status === "DRAFT") {
              await db.deleteApplication(session.applicationId);
            }
          }
          await db.deleteSession(session.id);
        } catch (e) {
          logger.error(`[${JOB_NAME}] Failed to clean session ${session.id}`, {
            error: e.message,
          });
        }
      }

      if (expiredSessions.length > 0) {
        logger.info(
          `[${JOB_NAME}] Cleaned ${expiredSessions.length} expired session(s)`,
        );
      }
    } catch (e) {
      logger.error(`[${JOB_NAME}] Job failed`, { error: e.message });
    }
  },
};
