"use strict";

const roleTracking = require("../modules/roleTracking/service");
const db = require("../modules/onboarding/onboardingDb");
const logger = require("../lib/logger");

module.exports = {
  name: "guildMemberRemove",

  async execute(member) {
    try {
      await roleTracking.handleGuildMemberRemove(member);
    } catch (error) {
      console.warn("[Role Tracking] guildMemberRemove failed:", error.message);
    }

    // Onboarding: delete drafts for leaving user, mark submitted apps
    try {
      const guildId = member.guild.id;
      const userId = member.id;

      // Delete all draft sessions for this user
      await db.deleteUserSessions(guildId, userId);

      // Find any draft applications and delete them
      const userApps = await db.getApplicationsByUser(guildId, userId);
      for (const app of userApps) {
        if (app.status === "DRAFT") {
          await db.deleteApplication(app.id);
        } else if (app.status === "PENDING") {
          // Mark as user left
          await db.updateApplication(app.id, {
            serverMemberStatus: "LEFT_SERVER",
          });
        }
      }

      logger.info("[Onboarding] Cleaned up data for leaving member", {
        guildId,
        userId,
      });
    } catch (e) {
      logger.error("[Onboarding] guildMemberRemove cleanup failed", {
        error: e.message,
      });
    }
  },
};
