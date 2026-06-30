"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { translateMessage } = require("../../../modules/ai/translation");
const { requireBotOwner } = require("../../../lib/ownerGuard");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("ai")
    .setDescription("AI debugging and test utilities.")
    .addSubcommand((s) =>
      s
        .setName("translate-test")
        .setDescription(
          "Directly test AI translation without reactions. (Bot owner only)",
        )
        .addStringOption((o) =>
          o
            .setName("text")
            .setDescription("Text to translate")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("language")
            .setDescription("Target language (e.g. es, fr, de, pt, or flag_es)")
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    // Bot owner only
    if (!(await requireBotOwner(interaction))) return;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const text = interaction.options.getString("text", true);
    const language = interaction.options.getString("language", true);

    try {
      const result = await translateMessage({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        messageContent: text,
        targetEmoji: language,
      });

      if (!result.success) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Translation test failed")
          .setColor(0xe74c3c)
          .addFields(
            { name: "Input", value: text.substring(0, 1024) || "(empty)" },
            { name: "Target", value: language },
            { name: "Error", value: result.error || "unknown" },
          )
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Translation test succeeded")
        .setColor(0x2ecc71)
        .addFields(
          {
            name: "Original",
            value: text.substring(0, 1024) || "(empty)",
          },
          {
            name: `Translation (${result.targetLang})`,
            value: result.translation.substring(0, 1024) || "(empty)",
          },
          {
            name: "Credits consumed",
            value: "1 (if successful)",
            inline: true,
          },
          {
            name: "Status",
            value: result.success ? "Success" : "Failed",
            inline: true,
          },
        )
        .setFooter({ text: "Discore AI Translation Test" })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Translation test crashed")
        .setColor(0xe74c3c)
        .setDescription(`\`\`\`${err.message}\`\`\``)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] }).catch(() => {});
    }
  },
};
