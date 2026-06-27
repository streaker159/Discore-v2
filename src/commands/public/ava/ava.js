const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { requireFeature } = require("../../../lib/premiumGate");
const {
  createAvaMatch,
  submitResult,
  confirmResult,
  disputeMatch,
  voidMatch,
  cancelMatch,
  getMatch,
} = require("../../../modules/ava/service");
const {
  getAllianceByTag,
} = require("../../../modules/allianceNetwork/service");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");
const { parseDateTime } = require("../../../lib/timeParser");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("ava")
    .setDescription("Alliance vs Alliance tools.")
    .addSubcommand((s) =>
      s
        .setName("create")
        .setDescription("Create an AvA match.")
        .addStringOption((o) =>
          o.setName("game").setDescription("Game slug").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("home_tag")
            .setDescription("Home alliance tag")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("away_tag")
            .setDescription("Away alliance tag")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("time").setDescription("Optional match time"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("submit-result")
        .setDescription("Submit AvA result.")
        .addStringOption((o) =>
          o.setName("match_id").setDescription("Match ID").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("winner_id")
            .setDescription("Winner alliance ID")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("evidence").setDescription("Evidence URL"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("confirm-result")
        .setDescription("Confirm AvA result.")
        .addStringOption((o) =>
          o.setName("match_id").setDescription("Match ID").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("dispute")
        .setDescription("Dispute an AvA result.")
        .addStringOption((o) =>
          o.setName("match_id").setDescription("Match ID").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("reason")
            .setDescription("Reason for dispute")
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("void")
        .setDescription("Void an AvA match (bot admin only).")
        .addStringOption((o) =>
          o.setName("match_id").setDescription("Match ID").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("cancel")
        .setDescription("Cancel an AvA match.")
        .addStringOption((o) =>
          o.setName("match_id").setDescription("Match ID").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("view")
        .setDescription("View an AvA match.")
        .addStringOption((o) =>
          o.setName("match_id").setDescription("Match ID").setRequired(true),
        ),
    ),
  async execute(interaction) {
    const ok = await requireFeature(interaction, "ava.verified");
    if (!ok) return;

    const sub = interaction.options.getSubcommand();

    if (sub === "create") {
      const game = interaction.options.getString("game", true);
      const home = await getAllianceByTag(
        game,
        interaction.options.getString("home_tag", true).toUpperCase(),
      );
      const away = await getAllianceByTag(
        game,
        interaction.options.getString("away_tag", true).toUpperCase(),
      );
      if (!home || !away)
        return interaction.reply({
          content: "Both alliances must be registered first.",
          flags: [MessageFlags.Ephemeral],
        });
      const timeInput = interaction.options.getString("time");
      const parsed = timeInput ? parseDateTime(timeInput) : null;
      if (parsed && !parsed.ok)
        return interaction.reply({
          content: parsed.reason,
          flags: [MessageFlags.Ephemeral],
        });
      const match = await createAvaMatch({
        homeAllianceId: home.id,
        awayAllianceId: away.id,
        game,
        scheduledAt: parsed?.date ?? null,
      });
      const embed = await createDiscoreEmbed(interaction, {
        title: "⚔️ AvA match created",
        description: `**${home.name}** vs **${away.name}**\nMatch ID: \`${match.id}\``,
      });
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "submit-result") {
      const match = await submitResult({
        matchId: interaction.options.getString("match_id", true),
        winnerId: interaction.options.getString("winner_id", true),
        evidenceUrl: interaction.options.getString("evidence"),
        submittedBy: interaction.user.id,
      });
      const embed = await createDiscoreEmbed(interaction, {
        title: "📨 Result submitted",
        description: `Match \`${match.id}\` is awaiting confirmation.`,
      });
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "confirm-result") {
      const match = await confirmResult({
        matchId: interaction.options.getString("match_id", true),
        confirmedBy: interaction.user.id,
      });
      const embed = await createDiscoreEmbed(interaction, {
        title: "✅ AvA verified",
        description: `Match \`${match.id}\` has been verified and Discore rankings updated.`,
      });
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "dispute") {
      const match = await disputeMatch({
        matchId: interaction.options.getString("match_id", true),
        disputedBy: interaction.user.id,
        reason: interaction.options.getString("reason", true),
      });
      const embed = await createDiscoreEmbed(interaction, {
        title: "⚠️ Match disputed",
        description: `Match \`${match.id}\` has been marked as **Disputed** and flagged for bot-owner review.`,
      });
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "void") {
      const { requireBotAdmin } = require("../../../lib/ownerGuard");
      if (!(await requireBotAdmin(interaction))) return;
      const match = await voidMatch(
        interaction.options.getString("match_id", true),
      );
      const embed = await createDiscoreEmbed(interaction, {
        title: "🚫 Match voided",
        description: `Match \`${match.id}\` has been voided and will not count toward rankings.`,
      });
      return interaction.reply({
        embeds: [embed],
        flags: [MessageFlags.Ephemeral],
      });
    }

    if (sub === "cancel") {
      const match = await cancelMatch(
        interaction.options.getString("match_id", true),
      );
      const embed = await createDiscoreEmbed(interaction, {
        title: "❌ Match canceled",
        description: `Match \`${match.id}\` has been canceled.`,
      });
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "view") {
      const match = await getMatch(
        interaction.options.getString("match_id", true),
      );
      if (!match)
        return interaction.reply({
          content: "Match not found.",
          flags: [MessageFlags.Ephemeral],
        });
      const embed = await createDiscoreEmbed(interaction, {
        title: "⚔️ AvA Match",
        fields: [
          {
            name: "Home",
            value: match.homeAlliance?.name || match.homeAllianceId,
            inline: true,
          },
          {
            name: "Away",
            value: match.awayAlliance?.name || match.awayAllianceId,
            inline: true,
          },
          { name: "Game", value: match.game, inline: true },
          { name: "Status", value: match.status, inline: true },
          { name: "Match ID", value: `\`${match.id}\``, inline: false },
        ],
      });
      return interaction.reply({ embeds: [embed] });
    }
  },
};
