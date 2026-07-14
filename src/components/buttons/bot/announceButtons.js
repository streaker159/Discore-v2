"use strict";

const {
  handleAnnounceSend,
  handleAnnounceEdit,
  handleAnnounceCancel,
} = require("../../../commands/public/bot/index");

module.exports = [
  {
    customId: "bot:announce:send",
    async execute(interaction) {
      return handleAnnounceSend(interaction);
    },
  },
  {
    customId: "bot:announce:edit",
    async execute(interaction) {
      return handleAnnounceEdit(interaction);
    },
  },
  {
    customId: "bot:announce:cancel",
    async execute(interaction) {
      return handleAnnounceCancel(interaction);
    },
  },
];
