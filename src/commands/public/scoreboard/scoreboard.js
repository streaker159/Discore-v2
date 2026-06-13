const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const {
  createScoreboard,
  getScoreboard,
  addResult,
  archiveScoreboard,
  restoreScoreboard,
  mergeScoreboards,
  buildScoreboardEmbed,
} = require("../../../modules/scoreboards/service");
const { requireFeature } = require("../../../lib/premiumGate");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("scoreboard")
    .setDescription("Create and manage Discore scoreboards.")
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("Create a live scoreboard.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("metric")
            .setDescription("Ranking metric")
            .setRequired(true)
            .addChoices(
              { name: "Wins", value: "WINS" },
              { name: "Losses", value: "LOSSES" },
              { name: "Points", value: "POINTS" },
              { name: "Ratio", value: "RATIO" },
              { name: "Win streak", value: "WIN_STREAK" },
              { name: "Loss streak", value: "LOSS_STREAK" },
              { name: "Season", value: "SEASON" },
              { name: "All-time", value: "ALL_TIME" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Target type")
            .addChoices(
              { name: "Users", value: "USER" },
              { name: "Roles", value: "ROLE" },
            ),
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Live scoreboard channel")
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("show")
        .setDescription("Show a scoreboard.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("addwin")
        .setDescription("Add a win.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        )
        .addUserOption((o) =>
          o.setName("user").setDescription("User").setRequired(true),
        )
        .addStringOption((o) => o.setName("reason").setDescription("Reason")),
    )
    .addSubcommand((s) =>
      s
        .setName("addloss")
        .setDescription("Add a loss.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        )
        .addUserOption((o) =>
          o.setName("user").setDescription("User").setRequired(true),
        )
        .addStringOption((o) => o.setName("reason").setDescription("Reason")),
    )
    .addSubcommand((s) =>
      s
        .setName("addpoints")
        .setDescription("Add points.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        )
        .addUserOption((o) =>
          o.setName("user").setDescription("User").setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName("points").setDescription("Points").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("archive")
        .setDescription("Archive a scoreboard (PRO).")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("restore")
        .setDescription("Restore an archived scoreboard (PRO).")
        .addStringOption((o) =>
          o.setName("name").setDescription("Scoreboard name").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("merge")
        .setDescription("Merge one scoreboard into another (PRO).")
        .addStringOption((o) =>
          o
            .setName("source")
            .setDescription("Source scoreboard name")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("target")
            .setDescription("Target scoreboard name")
            .setRequired(true),
        ),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (
      [
        "start",
        "addwin",
        "addloss",
        "addpoints",
        "archive",
        "restore",
        "merge",
      ].includes(sub) &&
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    ) {
      return interaction.reply({
        content: "You need Manage Server permission for scoreboard edits.",
        ephemeral: true,
      });
    }

    if (sub === "start") {
      const name = interaction.options.getString("name", true);
      const metric = interaction.options.getString("metric", true);
      const type = interaction.options.getString("type") || "USER";
      const channel =
        interaction.options.getChannel("channel") || interaction.channel;
      const board = await createScoreboard({
        guildId: interaction.guildId,
        name,
        metric,
        type,
        channelId: channel.id,
        createdBy: interaction.user.id,
      });
      const embed = await buildScoreboardEmbed(interaction, {
        ...board,
        entries: [],
      });
      const message = await channel.send({ embeds: [embed] });
      await prisma.scoreboard
        .update({ where: { id: board.id }, data: { messageId: message.id } })
        .catch(() => {});
      return interaction.reply({
        content: `✅ Scoreboard **${name}** created in ${channel}.`,
        ephemeral: true,
      });
    }

    if (sub === "show") {
      const board = await getScoreboard(
        interaction.guildId,
        interaction.options.getString("name", true),
      );
      if (!board)
        return interaction.reply({
          content: "Scoreboard not found.",
          ephemeral: true,
        });
      const embed = await buildScoreboardEmbed(interaction, board);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "archive") {
      const ok = await requireFeature(interaction, "scoreboards.archive");
      if (!ok) return;
      const board = await archiveScoreboard({
        guildId: interaction.guildId,
        name: interaction.options.getString("name", true),
      });
      const embed = await createDiscoreEmbed(interaction, {
        title: "📦 Scoreboard archived",
        description: `Archived **${board.name}**.`,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "restore") {
      const ok = await requireFeature(interaction, "scoreboards.restore");
      if (!ok) return;
      const board = await restoreScoreboard({
        guildId: interaction.guildId,
        name: interaction.options.getString("name", true),
      });
      const embed = await createDiscoreEmbed(interaction, {
        title: "♻️ Scoreboard restored",
        description: `Restored **${board.name}**. It is now live again.`,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "merge") {
      const ok = await requireFeature(interaction, "scoreboards.merge");
      if (!ok) return;
      const merged = await mergeScoreboards({
        guildId: interaction.guildId,
        sourceName: interaction.options.getString("source", true),
        targetName: interaction.options.getString("target", true),
        adminId: interaction.user.id,
      });
      const embed = await buildScoreboardEmbed(interaction, merged);
      return interaction.reply({
        content: `✅ Merged into **${merged.name}**.`,
        embeds: [embed],
        ephemeral: true,
      });
    }

    const action =
      sub === "addwin" ? "WIN" : sub === "addloss" ? "LOSS" : "POINT";
    const user = interaction.options.getUser("user", true);
    const delta =
      sub === "addpoints" ? interaction.options.getInteger("points", true) : 1;
    const result = await addResult({
      guildId: interaction.guildId,
      scoreboardName: interaction.options.getString("name", true),
      targetId: user.id,
      action,
      delta,
      adminId: interaction.user.id,
      reason: interaction.options.getString("reason"),
    });
    const embed = await buildScoreboardEmbed(interaction, result.board);

    // Live-update the pinned scoreboard message
    if (result.board.messageId && result.board.channelId) {
      const ch = await interaction.client.channels
        .fetch(result.board.channelId)
        .catch(() => null);
      if (ch) {
        const liveMsg = await ch.messages
          .fetch(result.board.messageId)
          .catch(() => null);
        if (liveMsg) await liveMsg.edit({ embeds: [embed] }).catch(() => {});
      }
    }

    return interaction.reply({ embeds: [embed] });
  },
};
