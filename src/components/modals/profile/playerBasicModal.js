/**
 * Modal submit handler for player profile basic stats editing.
 * Fired when user submits the "Edit Basic Stats" or "Edit Combat Stats" modal.
 */
const { pendingProfileCache } = require("../../../lib/cache");
const {
  updatePlayerFromParsed,
  getPlayerProfile,
} = require("../../../modules/profiles/playerService");
const {
  buildPlayerEmbed,
  buildPlayerButtons,
  buildParsePreviewEmbed,
  buildParsePreviewButtons,
} = require("../../../modules/profiles/playerEmbed");

module.exports = {
  // Matches both 'profile:player:basicmodal:TOKEN' and 'profile:player:combatmodal:TOKEN'
  customIdPrefix: "profile:player:basicmodal:",

  async execute(interaction, client) {
    const parts = interaction.customId.split(":");
    const token = parts[3] ?? null;
    const isDirect = token === "direct";

    // Retrieve or create pending object
    let pending = token && !isDirect ? pendingProfileCache.get(token) : null;

    if (!pending) {
      // Direct edit (no pending parse) — treat as a fresh manual update
      pending = {
        discordId: interaction.user.id,
        parsed: {},
        screenshotUrls: [],
      };
    }

    if (pending.discordId !== interaction.user.id) {
      return interaction.reply({
        content: "⚠️ This edit session belongs to a different user.",
        flags: 64,
      });
    }

    // Merge submitted values into pending.parsed
    const fields = [
      "gameUsername",
      "inGameRank",
      "allianceName",
      "level",
      "kdRatio",
    ];
    for (const f of fields) {
      const val = interaction.fields.getTextInputValue(f).trim();
      if (val !== "") {
        if (f === "level") pending.parsed[f] = parseInt(val, 10) || null;
        else if (f === "kdRatio") pending.parsed[f] = parseFloat(val) || null;
        else pending.parsed[f] = val;
      }
    }

    if (token && !isDirect) {
      pendingProfileCache.set(token, pending);
    }

    await interaction.deferReply({ flags: 64 });

    // If direct (no token), save immediately
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
        content: "✅ Profile updated!",
        embeds: [embed],
        components: rows,
      });
    }

    // Show updated preview
    const previewEmbed = buildParsePreviewEmbed(
      pending.parsed,
      pending.screenshotUrls?.length ?? 0,
    );
    const rows = buildParsePreviewButtons(token);
    return interaction.editReply({ embeds: [previewEmbed], components: rows });
  },
};
