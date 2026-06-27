"use strict";

const roleTracking = require("../modules/roleTracking/service");

module.exports = {
  name: "guildMemberRemove",

  async execute(member) {
    try {
      await roleTracking.handleGuildMemberRemove(member);
    } catch (error) {
      console.warn("[Role Tracking] guildMemberRemove failed:", error.message);
    }
  },
};
