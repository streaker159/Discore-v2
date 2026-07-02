const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const {
  getPlayerProfileStats,
} = require("../../../modules/player/services/playerProfileService");
const {
  createPlayerProfileEmbed,
} = require("../../../modules/player/embeds/playerProfileEmbed");
const { createProfileXpCard } = require("../../../modules/xp/profileXpCard");
const {
  getUserXpStats,
  getUserXpRank,
} = require("../../../modules/xp/xpService");

const AUTO_DELETE_MS = 10 * 60 * 1000; // 10 minutes

function scheduleAutoDelete(message) {
  if (!message?.deletable) return;
  setTimeout(() => {
    message.delete().catch(() => {});
  }, AUTO_DELETE_MS);
}

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("player")
    .setDescription("Player profile commands.")
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

    if (sub === "profile") {
      await interaction.deferReply();

      try {
        const targetUser =
          interaction.options.getUser("user") ?? interaction.user;

        const member = await interaction.guild.members
          .fetch(targetUser.id)
          .catch(() => null);

        if (!member) {
          return interaction.editReply({
            content: "⚠️ User is not in this server.",
          });
        }

        // Get profile stats (includes XP)
        const profileStats = await getPlayerProfileStats(
          interaction.guildId,
          targetUser.id,
          member,
        );

        // Generate dynamic profile card
        const displayName =
          member.displayName || targetUser.globalName || targetUser.username;

        const avatarUrl = member.displayAvatarURL({
          extension: "png",
          size: 256,
          forceStatic: true,
        });

        // Try to get XP stats for the card
        let profileCardBuffer = null;
        try {
          const xpStats = await getUserXpStats(
            interaction.guildId,
            targetUser.id,
          );
          const rank = await getUserXpRank(interaction.guildId, targetUser.id);
          profileCardBuffer = await createProfileXpCard({
            avatarUrl,
            displayName,
            username: targetUser.username,
            level: xpStats.level,
            currentXp: xpStats.progress?.progressXp || 0,
            nextLevelXp: xpStats.progress?.nextLevelXp || 100,
            rank,
            progressPercent: xpStats.progress?.progressPercent || 0,
            messagesCounted: xpStats.messagesCounted || 0,
            reactionsCounted: xpStats.reactionsCounted || 0,
          });
        } catch {
          // XP card generation failed, still show embed
        }

        // Create detail embed
        const embed = await createPlayerProfileEmbed(member, profileStats);

        // Build response
        const payload = {
          content: `-# This profile auto-deletes in 10 minutes. Run the command again for live stats.`,
          embeds: [embed],
        };

        if (profileCardBuffer) {
          payload.files = [
            {
              attachment: profileCardBuffer,
              name: `profile-${targetUser.id}.png`,
            },
          ];
        }

        const reply = await interaction.editReply(payload);
        scheduleAutoDelete(reply);
      } catch (error) {
        console.error("[Player Profile Error]", error);
        return interaction.editReply({
          content: `⚠️ Error loading profile: ${error.message}`,
        });
      }
    }
  },
};
