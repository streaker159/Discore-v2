const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { requireBotAdmin } = require("../../../lib/ownerGuard");
const prisma = require("../../../lib/prisma");

module.exports = {
  scope: "BOT_OWNER",
  data: new SlashCommandBuilder()
    .setName("debug")
    .setDescription("Owner-only debug tools.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s.setName("db").setDescription("Test database connection."),
    ),
  async execute(interaction) {
    if (!(await requireBotAdmin(interaction))) return;
    await prisma.$queryRaw`SELECT 1`;
    return interaction.reply({
      content: "✅ Database connection OK.",
      ephemeral: true,
    });
  },
};
