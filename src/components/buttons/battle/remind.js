const prisma = require("../../../lib/prisma");
const { getSignup } = require("../../../modules/battleSignup/service");

module.exports = {
  customIdPrefix: "battle:remind:",
  async execute(interaction) {
    const signupId = interaction.customId.split(":")[2];
    const signup = await getSignup(signupId);
    if (!signup)
      return interaction.reply({
        content: "Battle signup not found.",
        flags: 64,
      });

    // Remind 30 minutes before the battle
    const remindAt = new Date(signup.scheduledAt.getTime() - 30 * 60 * 1000);
    if (remindAt <= new Date()) {
      return interaction.reply({
        content:
          "⏱️ This battle is starting in less than 30 minutes — too late for a reminder.",
        flags: 64,
      });
    }

    await prisma.battleReminder.upsert({
      where: { signupId_userId: { signupId, userId: interaction.user.id } },
      update: { remindAt, sent: false },
      create: { signupId, userId: interaction.user.id, remindAt },
    });

    const unix = Math.floor(remindAt.getTime() / 1000);
    await interaction.reply({
      content: `🔔 Reminder set! I'll DM you at <t:${unix}:F> (30 minutes before).`,
      flags: 64,
    });
  },
};
