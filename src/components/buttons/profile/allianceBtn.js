/**
 * Alliance profile button handler.
 */
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require("discord.js");
const { pendingProfileCache } = require("../../../lib/cache");
const {
  updateAllianceFromParsed,
  getAllianceProfileById,
  getAllianceProfile,
} = require("../../../modules/profiles/allianceProfileService");
const {
  buildAllianceEmbed,
  buildAllianceButtons,
  buildAllianceParsePreviewEmbed,
  buildAllianceParsePreviewButtons,
} = require("../../../modules/profiles/allianceEmbed");

module.exports = {
  customIdPrefix: "profile:alliance:",

  async execute(interaction, client) {
    const parts = interaction.customId.split(":");
    const action = parts[2];
    const param = parts[3] ?? null;

    // ── View battle stats ──────────────────────────────────
    if (action === "stats") {
      const alliance = await getAllianceProfileById(param);
      if (!alliance)
        return interaction.reply({
          content: "⚠️ Alliance not found.",
          flags: 64,
        });

      const totalW = alliance.discoreWins ?? 0;
      const totalL = alliance.discoreLosses ?? 0;
      const wr =
        totalW + totalL > 0
          ? `${((totalW / (totalW + totalL)) * 100).toFixed(1)}%`
          : "N/A";

      const embed = new EmbedBuilder()
        .setColor(0x0f3460)
        .setTitle(`⚔️ ${alliance.name} [${alliance.tag}] — Battle Stats`)
        .addFields(
          {
            name: "Discore Elo",
            value: String(alliance.discoreElo ?? 1000),
            inline: true,
          },
          { name: "Verified Wins", value: String(totalW), inline: true },
          { name: "Verified Losses", value: String(totalL), inline: true },
          { name: "Win Rate", value: wr, inline: true },
          {
            name: "Season Record",
            value: alliance.seasonRecord ?? "0W – 0L",
            inline: true,
          },
          {
            name: "Official Rank",
            value: alliance.officialRank
              ? String(alliance.officialRank)
              : "N/A",
            inline: true,
          },
        )
        .setTimestamp()
        .setFooter({ text: "Discore • Alliance Stats" });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // ── View members ───────────────────────────────────────
    if (action === "members") {
      const alliance = await getAllianceProfileById(param);
      if (!alliance)
        return interaction.reply({
          content: "⚠️ Alliance not found.",
          flags: 64,
        });

      // Fetch registered players in this alliance

      const prisma = require("../../../lib/prisma");
      const members = await prisma.playerProfile.findMany({
        where: { currentAlliance: alliance.name, isPublic: true },
        orderBy: { discoreElo: "desc" },
        take: 20,
      });

      const lines = members.length
        ? members.map(
            (m, i) =>
              `${i + 1}. <@${m.discordId}> — **${m.gameUsername || "Unknown"}** | Elo: ${m.discoreElo} | ${m.role || "No role"}`,
          )
        : ["*No registered members yet.*"];

      const embed = new EmbedBuilder()
        .setColor(0x0f3460)
        .setTitle(`👥 ${alliance.name} [${alliance.tag}] — Registered Members`)
        .setDescription(lines.join("\n"))
        .setFooter({
          text: `${members.length} member(s) with Discore profiles`,
        })
        .setTimestamp();

      if (alliance.logoUrl) embed.setThumbnail(alliance.logoUrl);

      return interaction.reply({ embeds: [embed],  });
    }

    // ── Update prompt ──────────────────────────────────────
    if (action === "update") {
      const alliance = await getAllianceProfileById(param);
      if (!alliance)
        return interaction.reply({
          content: "⚠️ Alliance not found.",
          flags: 64,
        });

      return interaction.reply({
        content:
          `📸 **To update **[${alliance.tag}]** profile:**\n` +
          `Run \`/alliance setup tag:${alliance.tag}\` and attach up to **5** screenshots of your in-game alliance profile.`,
        flags: 64,
      });
    }

    // ── Edit Details modal ─────────────────────────────────
    if (action === "editdetails" || action === "edit") {
      const token = param;
      const pending = token ? pendingProfileCache.get(token) : null;
      const p = pending?.parsed ?? {};

      const modal = new ModalBuilder()
        .setCustomId(`profile:alliance:detailsmodal:${token ?? "direct"}`)
        .setTitle("Edit Alliance Details");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("name")
            .setLabel("Alliance Full Name")
            .setStyle(TextInputStyle.Short)
            .setValue(p.name ?? "")
            .setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("description")
            .setLabel("Description")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(p.description ?? "")
            .setRequired(false)
            .setMaxLength(500),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("officialStats")
            .setLabel("Rank | Elo | Wins | Losses | Members (comma-sep)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("116, 1075, 2, 3, 17/50")
            .setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("country")
            .setLabel("Country Code (e.g. US, DE, FR)")
            .setStyle(TextInputStyle.Short)
            .setValue(p.country ?? "")
            .setRequired(false)
            .setMaxLength(3),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("tags")
            .setLabel("Tags (comma-sep, e.g. COMPETITIVE, ACTIVE)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(200),
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
            "⚠️ This confirmation has expired or is invalid. Please run `/alliance setup` again.",
          flags: 64,
        });
      }

      await interaction.deferUpdate();

      const result = await updateAllianceFromParsed(
        pending.tag,
        pending.game,
        pending.parsed,
        pending.screenshotUrls,
        interaction.user.id,
        pending.isNewAlliance, // bypass rate limit for new alliances
      );

      pendingProfileCache.delete(token);

      if (result.rateLimited) {
        return interaction.editReply({
          content: `⏳ Alliance profile can only be updated once per 24 hours. Try again in **${result.hoursLeft}h**.`,
          components: [],
          embeds: [],
        });
      }

      const memberRoles =
        interaction.member?.roles?.cache?.map((r) => r.id) ?? [];
      const a = result.alliance;
      const embed = buildAllianceEmbed(a);
      const rows = buildAllianceButtons(
        a.id,
        interaction.user.id,
        a.ownerId,
        a.managerRoleId,
        memberRoles,
      );

      return interaction.editReply({
        content: "✅ **Alliance profile saved!**",
        embeds: [embed],
        components: rows,
      });
    }

    // ── Cancel ─────────────────────────────────────────────
    if (action === "cancel") {
      if (param) pendingProfileCache.delete(param);
      return interaction.update({
        content: "✖ Alliance update cancelled.",
        embeds: [],
        components: [],
      });
    }
  },
};
