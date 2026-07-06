const prisma = require("../../../lib/prisma");
const {
  getSignup,
  buildBattleSignupEmbed,
} = require("../../../modules/battleSignup/service");

module.exports = {
  customIdPrefix: "battle:cancel:",
  async execute(interaction) {
    const signupId = interaction.customId.split(":")[2];
    const signup = await getSignup(signupId);
    if (!signup)
      return interaction.reply({
        content: "Battle signup not found.",
        flags: 64,
      });

    if (
      signup.captainId !== interaction.user.id &&
      !interaction.memberPermissions?.has(8n)
    ) {
      return interaction.reply({
        content: "Only the captain or an admin can cancel this signup.",
        flags: 64,
      });
    }

    await prisma.battleSignup.update({
      where: { id: signupId },
      data: { status: "CANCELLED" },
    });
    const updated = await getSignup(signupId);
    const embed = await buildBattleSignupEmbed(interaction, updated);
    await interaction.update({ embeds: [embed], components: [] });
  },
};
