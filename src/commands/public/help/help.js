const { SlashCommandBuilder } = require("discord.js");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show Discore V2 help and key features."),
  async execute(interaction) {
    const embed = await createDiscoreEmbed(interaction, {
      title: "🧭 Discore V2 Help",
      description:
        "Discore is your strategy-game command network for scoreboards, battle signups, game data, AI strategy, alliances, players, and AvA rankings.",
      fields: [
        {
          name: "Core commands",
          value:
            "`/scoreboard` `/battle` `/event` `/game` `/strategy` `/alliance` `/player` `/ava` `/match` `/suggestion`",
          inline: false,
        },
        {
          name: "Server setup",
          value:
            "`/server setup` `/server branding` `/server timezone` `/server default-game` `/server channels`",
          inline: false,
        },
        {
          name: "Premium",
          value: "`/premium status` `/premium features` `/premium redeem`",
          inline: false,
        },
        {
          name: "Supported games",
          value:
            "Supremacy: WW3 • Conflict of Nations • Call of War • Supremacy 1914",
          inline: false,
        },
      ],
    });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
