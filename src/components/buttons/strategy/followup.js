module.exports = {
  customIdPrefix: "strategy:ask:",
  async execute(interaction) {
    await interaction.reply({
      content:
        "💡 Use `/strategy ask` or `/strategy deep` to ask your next question.",
      ephemeral: true,
    });
  },
};
