/**
 * Player profile button handler.
 * Handles: update prompt, edit sections, privacy toggle, confirm/cancel parse.
 */
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const { pendingProfileCache } = require("../../../lib/cache");
const {
  updatePlayerFromParsed,
  getPlayerProfile,
  setPlayerPrivacy,
} = require("../../../modules/profiles/playerService");
const {
  buildPlayerEmbed,
  buildPlayerButtons,
  buildParsePreviewEmbed,
  buildParsePreviewButtons,
} = require("../../../modules/profiles/playerEmbed");

module.exports = {
  customIdPrefix: "profile:player:",

  async execute(interaction, client) {
    const parts = interaction.customId.split(":");
    // parts: ['profile','player', action, ...rest]
    const action = parts[2];
    const param = parts[3] ?? null;

    // ── View / Refresh profile ─────────────────────────────
    if (action === "view") {
      const targetId = param ?? interaction.user.id;
      const targetUser = await client.users.fetch(targetId).catch(() => null);
      const profile = await getPlayerProfile(targetId);
      if (!profile) {
        return interaction.reply({
          content: "⚠️ Profile not found.",
          flags: 64,
        });
      }
      const embed = buildPlayerEmbed(profile, targetUser);
      const rows = buildPlayerButtons(targetId, interaction.user.id);
      return interaction.update({ embeds: [embed], components: rows });
    }

    // ── Update prompt (shown in own profile) ──────────────
    if (action === "update") {
      return interaction.reply({
        content:
          "📸 **To update your profile:**\nRun `/player update` and attach up to **5** screenshots of your in-game profile page (showing stats, alliance, level, etc.).",
        flags: 64,
      });
    }

    // ── Privacy toggle ─────────────────────────────────────
    if (action === "privacy") {
      const profile = await getPlayerProfile(interaction.user.id);
      const newState = !(profile?.isPublic ?? true);
      await setPlayerPrivacy(interaction.user.id, newState);
      return interaction.reply({
        content: newState
          ? "🌐 Your profile is now **public**."
          : "🔒 Your profile is now **private**.",
        flags: 64,
      });
    }

    // ── Edit Basic Stats modal ─────────────────────────────
    if (action === "editbasic" || action === "edit") {
      const token = param;
      const pending = token ? pendingProfileCache.get(token) : null;
      const p = pending?.parsed ?? {};

      const modal = new ModalBuilder()
        .setCustomId(`profile:player:basicmodal:${token ?? "direct"}`)
        .setTitle("Edit Basic Stats");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("gameUsername")
            .setLabel("In-Game Username")
            .setStyle(TextInputStyle.Short)
            .setValue(p.gameUsername ?? "")
            .setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("inGameRank")
            .setLabel("In-Game Rank (e.g. Commander)")
            .setStyle(TextInputStyle.Short)
            .setValue(p.inGameRank ?? "")
            .setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("allianceName")
            .setLabel("Current Alliance Name")
            .setStyle(TextInputStyle.Short)
            .setValue(p.allianceName ?? "")
            .setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("level")
            .setLabel("Level")
            .setStyle(TextInputStyle.Short)
            .setValue(p.level != null ? String(p.level) : "")
            .setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("kdRatio")
            .setLabel("K/D Ratio")
            .setStyle(TextInputStyle.Short)
            .setValue(p.kdRatio != null ? String(p.kdRatio) : "")
            .setRequired(false),
        ),
      );

      return interaction.showModal(modal);
    }

    // ── Edit Combat Stats modal ────────────────────────────
    if (action === "editcombat") {
      const token = param;
      const pending = token ? pendingProfileCache.get(token) : null;
      const p = pending?.parsed ?? {};

      const modal = new ModalBuilder()
        .setCustomId(`profile:player:combatmodal:${token ?? "direct"}`)
        .setTitle("Edit Combat Stats");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("unitsKilled")
            .setLabel("Units Killed")
            .setStyle(TextInputStyle.Short)
            .setValue(p.unitsKilled != null ? String(p.unitsKilled) : "")
            .setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("provincesTaken")
            .setLabel("Provinces Taken")
            .setStyle(TextInputStyle.Short)
            .setValue(p.provincesTaken != null ? String(p.provincesTaken) : "")
            .setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("gamesJoined")
            .setLabel("Games Joined")
            .setStyle(TextInputStyle.Short)
            .setValue(p.gamesJoined != null ? String(p.gamesJoined) : "")
            .setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("coalitionVictories")
            .setLabel("Coalition Victories")
            .setStyle(TextInputStyle.Short)
            .setValue(
              p.coalitionVictories != null ? String(p.coalitionVictories) : "",
            )
            .setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("overallRank")
            .setLabel("Overall Rank")
            .setStyle(TextInputStyle.Short)
            .setValue(p.overallRank != null ? String(p.overallRank) : "")
            .setRequired(false),
        ),
      );

      return interaction.showModal(modal);
    }

    // ── Confirm & Save ─────────────────────────────────────
    if (action === "confirm") {
      const token = param;
      const pending = pendingProfileCache.get(token);

      if (!pending || pending.discordId !== interaction.user.id) {
        return interaction.reply({
          content:
            "⚠️ This confirmation has expired or is invalid. Please run `/player update` again.",
          flags: 64,
        });
      }

      await interaction.deferUpdate();

      const result = await updatePlayerFromParsed(
        interaction.user.id,
        pending.parsed,
        pending.screenshotUrls,
      );

      pendingProfileCache.delete(token);

      if (result.rateLimited) {
        return interaction.editReply({
          content: `⏳ You can only update once per 24 hours. Try again in **${result.hoursLeft}h**.`,
          components: [],
          embeds: [],
        });
      }

      const targetUser = await client.users
        .fetch(interaction.user.id)
        .catch(() => null);
      const embed = buildPlayerEmbed(result.profile, targetUser);
      const rows = buildPlayerButtons(interaction.user.id, interaction.user.id);

      return interaction.editReply({
        content: "✅ **Profile saved!**",
        embeds: [embed],
        components: rows,
      });
    }

    // ── Cancel ─────────────────────────────────────────────
    if (action === "cancel") {
      const token = param;
      if (token) pendingProfileCache.delete(token);
      return interaction.update({
        content: "✖ Profile update cancelled.",
        embeds: [],
        components: [],
      });
    }
  },
};
