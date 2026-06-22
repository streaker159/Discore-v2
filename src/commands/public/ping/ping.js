const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot response time"),
  async execute(interaction) {
    const start = Date.now();

    try {
      await interaction.reply("Pong!");
      const latency = Date.now() - start;
      await interaction.editReply(`🏓 Pong! Latency: ${latency}ms`);
    } catch (err) {
      console.error("[Ping] Failed:", err.message);
    }
  },
};
