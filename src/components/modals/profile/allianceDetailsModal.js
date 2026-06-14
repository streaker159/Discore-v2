/**
 * Modal submit handler for alliance profile details editing.
 */
const { pendingProfileCache } = require("../../../lib/cache");
const {
  updateAllianceFromParsed,
} = require("../../../modules/profiles/allianceProfileService");
const {
  buildAllianceEmbed,
  buildAllianceButtons,
  buildAllianceParsePreviewEmbed,
  buildAllianceParsePreviewButtons,
} = require("../../../modules/profiles/allianceEmbed");

module.exports = {
  customIdPrefix: "profile:alliance:detailsmodal:",

  async execute(interaction, client) {
    const parts = interaction.customId.split(":");
    const token = parts[3] ?? null;
    const isDirect = token === "direct";

    let pending = token && !isDirect ? pendingProfileCache.get(token) : null;
    if (!pending) {
      return interaction.reply({
        content: "⚠️ Session expired. Please run `/alliance setup` again.",
        ephemeral: true,
      });
    }

    if (pending.discordId !== interaction.user.id) {
      return interaction.reply({
        content: "⚠️ This session belongs to a different user.",
        ephemeral: true,
      });
    }

    // name, description
    const name = interaction.fields.getTextInputValue("name").trim();
    if (name) pending.parsed.name = name;

    const description = interaction.fields
      .getTextInputValue("description")
      .trim();
    if (description) pending.parsed.description = description;

    // officialStats: "116, 1075, 2, 3, 17/50"
    const statsRaw = interaction.fields
      .getTextInputValue("officialStats")
      .trim();
    if (statsRaw) {
      const parts2 = statsRaw.split(",").map((s) => s.trim());
      if (parts2[0]) pending.parsed.rank = parseInt(parts2[0], 10) || null;
      if (parts2[1]) pending.parsed.elo = parseInt(parts2[1], 10) || null;
      if (parts2[2]) pending.parsed.wins = parseInt(parts2[2], 10) || null;
      if (parts2[3]) pending.parsed.losses = parseInt(parts2[3], 10) || null;
      if (parts2[4]) {
        const memParts = parts2[4].split("/");
        pending.parsed.members = parseInt(memParts[0], 10) || null;
        pending.parsed.maxMembers = parseInt(memParts[1], 10) || null;
      }
    }

    const country = interaction.fields.getTextInputValue("country").trim();
    if (country) pending.parsed.country = country.toUpperCase();

    const tagsRaw = interaction.fields.getTextInputValue("tags").trim();
    if (tagsRaw) {
      pending.tagsArr = tagsRaw
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
    }

    pendingProfileCache.set(token, pending);

    await interaction.deferReply({ ephemeral: true });

    const previewEmbed = buildAllianceParsePreviewEmbed(
      pending.parsed,
      pending.screenshotUrls?.length ?? 0,
    );
    const rows = buildAllianceParsePreviewButtons(token);
    return interaction.editReply({ embeds: [previewEmbed], components: rows });
  },
};
