const { SlashCommandBuilder, MessageFlags } = require("discord.js");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot response time"),
  async execute(interaction) {
    const start = Date.now();

    try {
      await interaction.reply({
        content: "Pong!",
        flags: [MessageFlags.Ephemeral],
      });
      const latency = Date.now() - start;
      await interaction.editReply(`🏓 Pong! Latency: ${latency}ms`, {
        flags: [MessageFlags.Ephemeral],
      });
    } catch (err) {
      console.error("[Ping] Failed:", err.message);
    }
  },
};
