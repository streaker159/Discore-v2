/**
 * Modal submit handler for player profile combat stats editing.
 */
const { pendingProfileCache } = require("../../../lib/cache");
const {
  updatePlayerFromParsed,
} = require("../../../modules/profiles/playerService");
const {
  buildPlayerEmbed,
  buildPlayerButtons,
  buildParsePreviewEmbed,
  buildParsePreviewButtons,
} = require("../../../modules/profiles/playerEmbed");

module.exports = {
  customIdPrefix: "profile:player:combatmodal:",

  async execute(interaction, client) {
    const parts = interaction.customId.split(":");
    const token = parts[3] ?? null;
    const isDirect = token === "direct";

    let pending = token && !isDirect ? pendingProfileCache.get(token) : null;
    if (!pending) {
      pending = {
        discordId: interaction.user.id,
        parsed: {},
        screenshotUrls: [],
      };
    }

    if (pending.discordId !== interaction.user.id) {
      return interaction.reply({
        content: "⚠️ This edit session belongs to a different user.",
        ephemeral: true,
      });
    }

    const intFields = [
      "unitsKilled",
      "provincesTaken",
      "gamesJoined",
      "coalitionVictories",
      "overallRank",
    ];
    for (const f of intFields) {
      const val = interaction.fields.getTextInputValue(f).trim();
      if (val !== "") {
        pending.parsed[f] = parseInt(val.replace(/,/g, ""), 10) || null;
      }
    }

    if (token && !isDirect) pendingProfileCache.set(token, pending);

    await interaction.deferReply({ ephemeral: true });

    if (isDirect) {
      const result = await updatePlayerFromParsed(
        interaction.user.id,
        pending.parsed,
        pending.screenshotUrls,
        false,
      );
      if (result.rateLimited) {
        return interaction.editReply({
          content: `⏳ Rate limited. Try again in **${result.hoursLeft}h**.`,
        });
      }
      const targetUser = await client.users
        .fetch(interaction.user.id)
        .catch(() => null);
      const embed = buildPlayerEmbed(result.profile, targetUser);
      const rows = buildPlayerButtons(interaction.user.id, interaction.user.id);
      return interaction.editReply({
        content: "✅ Combat stats updated!",
        embeds: [embed],
        components: rows,
      });
    }

    const previewEmbed = buildParsePreviewEmbed(
      pending.parsed,
      pending.screenshotUrls?.length ?? 0,
    );
    const rows = buildParsePreviewButtons(token);
    return interaction.editReply({ embeds: [previewEmbed], components: rows });
  },
};
