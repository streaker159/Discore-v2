"use strict";

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getTargetScores } = require("../../../modules/scoreboards/service");
const {
  createDiscoreEmbed,
  getGuildSettings,
} = require("../../../lib/embedBuilder");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("scores")
    .setDescription("View a user or role's scores across all scoreboards.")
    .addUserOption((o) =>
      o
        .setName("user")
        .setDescription("Discord user to look up")
        .setRequired(false),
    )
    .addRoleOption((o) =>
      o
        .setName("role")
        .setDescription("Discord role to look up")
        .setRequired(false),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const role = interaction.options.getRole("role");

    if (!user && !role) {
      return interaction.reply({
        content: "Please provide a **user** or **role** to look up scores.",
        flags: 64,
      });
    }

    const targetId = (user || role).id;

    await interaction.deferReply({ flags: 64 });

    try {
      const results = await getTargetScores({
        guildId: interaction.guildId,
        targetId,
      });

      if (!results.length) {
        return interaction.editReply({
          content: `No scores found for ${(user || role).toString()}.`,
        });
      }

      const active = results.filter((r) => !r.board.isArchived);
      const archived = results.filter((r) => r.board.isArchived);

      const fmt = ({ board, entry }) => {
        const name = board.liveTitle || board.name;
        if (board.metric === "POINTS")
          return `**${name}**: \`${entry.points}\` pts`;
        const total = entry.wins + entry.losses;
        const pct =
          total > 0 ? `(${((entry.wins / total) * 100).toFixed(0)}% win)` : "";
        return `**${name}**: \`${entry.wins}W / ${entry.losses}L\` ${pct}`;
      };

      const targetLabel = user
        ? (user.displayName ?? user.username)
        : role.name;

      const embed = await createDiscoreEmbed(interaction, {
        title: `📊 Score Summary — ${targetLabel}`,
        description:
          active.length + archived.length
            ? `${active.length} active · ${archived.length} archived`
            : null,
        fields: [
          active.length
            ? {
                name: `🟢 Active (${active.length})`,
                value: active.map(fmt).join("\n") || "No active scores",
                inline: false,
              }
            : null,
          archived.length
            ? {
                name: `📦 Archived (${archived.length})`,
                value: archived.map(fmt).join("\n") || "No archived scores",
                inline: false,
              }
            : null,
        ].filter(Boolean),
        footer: { text: "Use /scoreboard to manage scoreboards" },
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      return interaction.editReply({
        content: `❌ Failed to fetch scores: ${err.message}`,
      });
    }
  },
};
