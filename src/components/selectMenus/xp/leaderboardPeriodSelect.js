"use strict";

const {
  buildLeaderboardPayload,
} = require("../../../modules/xp/leaderboardPayload");

/**
 * Handles the period dropdown under `/xp leaderboard`. Re-renders the card
 * in place for whichever period the clicking user picked. Uses the clicking
 * user's own standing (not the original command invoker's).
 */
module.exports = {
  customIdPrefix: "xp:lb:",
  async execute(interaction) {
    await interaction.deferUpdate();

    const period = interaction.values[0];
    const member = interaction.member;

    const payload = await buildLeaderboardPayload({
      guild: interaction.guild,
      period,
      viewer: {
        id: interaction.user.id,
        displayName:
          member?.displayName ||
          interaction.user.globalName ||
          interaction.user.username,
        avatarUrl: (member || interaction.user).displayAvatarURL({
          extension: "png",
          size: 256,
          forceStatic: true,
        }),
      },
    });

    await interaction.editReply(payload);
  },
};
