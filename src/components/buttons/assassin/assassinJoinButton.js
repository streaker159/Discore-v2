"use strict";

const { joinGame } = require("../../../modules/assassin/assassinService");
const { MessageFlags } = require("discord.js");

module.exports = {
  customId: "assassin:join",

  async execute(interaction) {
    const result = await joinGame(interaction);

    if (!result.success) {
      return interaction.reply({
        content: `❌ ${result.reason}`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    return interaction.reply({
      content: `✅ You've joined the Assassin game! (${result.players} players total)\nYou'll receive your role when the hunt begins.`,
      flags: [MessageFlags.Ephemeral],
    });
  },
};
