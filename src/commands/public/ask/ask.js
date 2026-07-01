"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { answerStrategy } = require("../../../modules/ai/service");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("ask")
    .setDescription(
      "Ask Discore AI for strategy advice, game help, or general assistance.",
    )
    .addStringOption((o) =>
      o.setName("question").setDescription("Your question").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("game")
        .setDescription("Which game? (optional)")
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("nation")
        .setDescription("Your nation/country (optional)")
        .setRequired(false),
    )
    .addIntegerOption((o) =>
      o
        .setName("day")
        .setDescription("Game day (optional)")
        .setMinValue(1)
        .setMaxValue(999)
        .setRequired(false),
    )
    .addBooleanOption((o) =>
      o
        .setName("private")
        .setDescription("Reply privately?")
        .setRequired(false),
    ),

  async execute(interaction) {
    const isPrivate = interaction.options.getBoolean("private") ?? false;
    await interaction.deferReply({
      flags: isPrivate ? [MessageFlags.Ephemeral] : undefined,
    });

    try {
      const question = interaction.options.getString("question", true);
      const game = interaction.options.getString("game");
      const nation = interaction.options.getString("nation");
      const day = interaction.options.getInteger("day");

      // Build game context
      const ctxParts = [];
      if (game) ctxParts.push(game);
      if (nation) ctxParts.push(`as ${nation}`);
      if (day) ctxParts.push(`day ${day}`);
      const gameContext = ctxParts.join(", ");

      const result = await answerStrategy({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        question,
        gameContext,
      });

      if (!result.ok) {
        return interaction.editReply({ content: result.answer });
      }

      const embed = new EmbedBuilder()
        .setTitle("🧠 Discore AI")
        .setDescription(result.answer.slice(0, 4000))
        .setColor(0x1a7a9e)
        .setFooter({
          text: `Model: ${result.modelUsed || "DeepSeek"} • 1 credit used`,
        })
        .setTimestamp();

      if (gameContext) {
        embed.addFields({
          name: "Game Context",
          value: gameContext,
          inline: false,
        });
      }

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Ask Command Error]", error);

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: `⚠️ **Error:** ${error.message}`,
        });
      }

      return interaction.reply({
        content: `⚠️ **Error:** ${error.message}`,
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};
