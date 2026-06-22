const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const {
  getPlayerProfileStats,
  getModerationStats,
} = require("../../../modules/player/services/playerProfileService");
const {
  createPlayerProfileEmbed,
} = require("../../../modules/player/embeds/playerProfileEmbed");
const {
  hasModPermissions,
} = require("../../../modules/moderation/utils/permissions");
const prisma = require("../../../lib/prisma");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("player")
    .setDescription("Player profile commands.")
    // ── profile ─────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("profile")
        .setDescription("View a player profile (server stats and activity)")
        .addUserOption((o) =>
          o
            .setName("user")
            .setDescription("User to view (leave blank for yourself)"),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /player profile ──────────────────────────────────────
    if (sub === "profile") {
      await interaction.deferReply();

      try {
        const targetUser =
          interaction.options.getUser("user") ?? interaction.user;

        // Get member object
        const member = await interaction.guild.members
          .fetch(targetUser.id)
          .catch(() => null);

        if (!member) {
          return interaction.editReply({
            content: "⚠️ User is not in this server.",
          });
        }

        // Get profile stats
        const profileStats = await getPlayerProfileStats(
          interaction.guildId,
          targetUser.id,
        );

        // Check if viewer is admin
        const dbGuild = await prisma.guild.findUnique({
          where: { id: interaction.guildId },
        });

        const isAdmin = hasModPermissions(interaction.member, dbGuild);

        // Get moderation stats if admin
        if (isAdmin) {
          profileStats.moderationStats = await getModerationStats(
            interaction.guildId,
            targetUser.id,
          );
        }

        // Create embed
        const embed = await createPlayerProfileEmbed(
          member,
          profileStats,
          isAdmin,
        );

        return interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error("[Player Profile Error]", error);
        return interaction.editReply({
          content: `⚠️ Error loading profile: ${error.message}`,
        });
      }
    }
  },
};
