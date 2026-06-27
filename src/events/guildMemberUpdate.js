"use strict";

const roleTracking = require("../modules/roleTracking/service");

module.exports = {
  name: "guildMemberUpdate",

  async execute(oldMember, newMember) {
    try {
      await roleTracking.handleGuildMemberUpdate(oldMember, newMember);
    } catch (error) {
      console.warn("[Role Tracking] guildMemberUpdate failed:", error.message);
    }
  },
};
