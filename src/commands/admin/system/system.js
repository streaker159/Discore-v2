const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { requireBotOwner } = require("../../../lib/ownerGuard");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");

module.exports = {
  scope: "BOT_OWNER",
  data: new SlashCommandBuilder()
    .setName("system")
    .setDescription("Bot-owner system tools.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s.setName("info").setDescription("Show system info."),
    ),
  async execute(interaction) {
    if (!(await requireBotOwner(interaction))) return;
    const embed = await createDiscoreEmbed(interaction, {
      title: "🛠️ Discore System",
      fields: [
        {
          name: "Guilds",
          value: String(interaction.client.guilds.cache.size),
          inline: true,
        },
        {
          name: "Ping",
          value: `${interaction.client.ws.ping}ms`,
          inline: true,
        },
        { name: "Node", value: process.version, inline: true },
      ],
    });
    return interaction.reply({
      embeds: [embed],
      flags: [MessageFlags.Ephemeral],
    });
  },
};
