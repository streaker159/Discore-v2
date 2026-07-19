const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { requireBotOwner } = require("../../../lib/ownerGuard");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");
const {
  buildOwnerReportPanel,
} = require("../../../components/buttons/system/ownerReportPanel");
const {
  sendDatabaseStatusReport,
  buildDatabaseStatusEmbed,
  getDatabaseStatus,
} = require("../../../modules/ownerReports");

module.exports = {
  scope: "BOT_OWNER",
  data: new SlashCommandBuilder()
    .setName("system")
    .setDescription("Bot-owner system tools.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName("info").setDescription("Show system info."))
    .addSubcommand((s) =>
      s
        .setName("owner-panel")
        .setDescription("Configure owner report channels and database checks."),
    )
    .addSubcommand((s) =>
      s
        .setName("database-status")
        .setDescription("Check database status and send the owner report."),
    ),
  async execute(interaction) {
    if (!(await requireBotOwner(interaction))) return;
    const sub = interaction.options.getSubcommand();

    if (sub === "owner-panel") {
      return interaction.reply(await buildOwnerReportPanel(interaction));
    }

    if (sub === "database-status") {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const status = await getDatabaseStatus(interaction.client);
      await sendDatabaseStatusReport(interaction.client).catch(() => null);
      return interaction.editReply({
        embeds: [buildDatabaseStatusEmbed(status)],
      });
    }

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
