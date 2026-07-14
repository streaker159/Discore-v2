"use strict";

const {
  handleAnnounceModalSubmit,
} = require("../../../commands/public/bot/index");

module.exports = {
  customIdPrefix: "bot:modal:announce",
  async execute(interaction) {
    return handleAnnounceModalSubmit(interaction);
  },
};
