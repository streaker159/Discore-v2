const {
  getSignup,
  setParticipant,
  buildBattleSignupEmbed,
  buildSignupDmEmbed,
  battleSignupButtons,
  remindMeRow,
} = require("../../../modules/battleSignup/service");

module.exports = {
  customIdPrefix: "battle:reserve:",
  async execute(interaction) {
    const signupId = interaction.customId.split(":")[2];
    await setParticipant(signupId, interaction.user.id, "RESERVE");
    const signup = await getSignup(signupId);
    const embed = await buildBattleSignupEmbed(interaction, signup);
    await interaction.update({
      embeds: [embed],
      components: battleSignupButtons(signupId),
    });

    // DM the user with signup details + Remind Me button
    const dmEmbed = await buildSignupDmEmbed(
      interaction.client,
      signup,
      "in as a reserve",
    );
    await interaction.user
      .send({ embeds: [dmEmbed], components: [remindMeRow(signupId)] })
      .catch(() => {
        // User has DMs disabled — silently skip
      });
  },
};
