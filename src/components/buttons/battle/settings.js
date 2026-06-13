const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const { getSignup } = require("../../../modules/battleSignup/service");

// customId format: battle:settings:{signupId}
module.exports = {
  customIdPrefix: "battle:settings:",
  async execute(interaction) {
    const signupId = interaction.customId.split(":")[2];
    const signup = await getSignup(signupId);
    if (!signup)
      return interaction.reply({
        content: "Signup not found.",
        ephemeral: true,
      });

    if (
      signup.captainId !== interaction.user.id &&
      !interaction.memberPermissions?.has(8n)
    ) {
      return interaction.reply({
        content: "⚠️ Only the captain or an admin can edit this signup.",
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`battle:settings:modal:${signupId}`)
      .setTitle("Edit Battle Signup");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Title (blank = keep current)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(signup.title || ""),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("mode")
          .setLabel("Mode (blank = keep current)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(signup.mode || ""),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("datetime")
          .setLabel("New time (blank = keep current)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder("e.g. tomorrow 6pm UTC, in 2 hours"),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("team_size")
          .setLabel("Team Size (blank = keep current)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(String(signup.teamSize)),
      ),
    );

    await interaction.showModal(modal);
  },
};
