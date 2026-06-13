const { getSignup, setParticipant, buildBattleSignupEmbed, battleSignupButtons } = require('../../../modules/battleSignup/service');

module.exports = {
  customIdPrefix: 'battle:join:',
  async execute(interaction) {
    const signupId = interaction.customId.split(':')[2];
    await setParticipant(signupId, interaction.user.id, 'ACCEPTED');
    const signup = await getSignup(signupId);
    const embed = await buildBattleSignupEmbed(interaction, signup);
    await interaction.update({ embeds: [embed], components: battleSignupButtons(signupId) });
  },
};
