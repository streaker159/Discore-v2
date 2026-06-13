const { SlashCommandBuilder } = require("discord.js");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");
const {
  registerAlliance,
  getAllianceByTag,
  getAllianceRanking,
} = require("../../../modules/allianceNetwork/service");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("alliance")
    .setDescription("Register and view alliance profiles.")
    .addSubcommand((s) =>
      s
        .setName("register")
        .setDescription("Register an alliance profile.")
        .addStringOption((o) =>
          o.setName("game").setDescription("Game slug").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("name").setDescription("Alliance name").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("tag").setDescription("Alliance tag").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("description").setDescription("Alliance description"),
        )
        .addStringOption((o) => o.setName("logo").setDescription("Logo URL"))
        .addStringOption((o) =>
          o.setName("banner").setDescription("Banner image URL"),
        )
        .addStringOption((o) =>
          o.setName("country").setDescription("Country code, e.g. US, DE, FR"),
        )
        .addStringOption((o) =>
          o.setName("invite").setDescription("Discord invite"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("profile")
        .setDescription("View alliance profile.")
        .addStringOption((o) =>
          o.setName("game").setDescription("Game slug").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("tag").setDescription("Alliance tag").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("ranking")
        .setDescription("View Discore alliance ranking.")
        .addStringOption((o) =>
          o.setName("game").setDescription("Game slug").setRequired(true),
        ),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "register") {
      const alliance = await registerAlliance({
        game: interaction.options.getString("game", true),
        name: interaction.options.getString("name", true),
        tag: interaction.options.getString("tag", true).toUpperCase(),
        description: interaction.options.getString("description"),
        logoUrl: interaction.options.getString("logo"),
        bannerUrl: interaction.options.getString("banner"),
        country:
          interaction.options.getString("country")?.toUpperCase() || null,
        discordInvite: interaction.options.getString("invite"),
      });
      const embed = await createDiscoreEmbed(interaction, {
        title: "🏰 Alliance registered",
        description: `**${alliance.name} [${alliance.tag}]** is now registered.`,
        thumbnail: alliance.logoUrl || undefined,
      });
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "profile") {
      const alliance = await getAllianceByTag(
        interaction.options.getString("game", true),
        interaction.options.getString("tag", true).toUpperCase(),
      );
      if (!alliance)
        return interaction.reply({
          content: "Alliance not found.",
          ephemeral: true,
        });
      const embed = await createDiscoreEmbed(interaction, {
        title: `${alliance.name} [${alliance.tag}]`,
        description: alliance.description || "No alliance description yet.",
        thumbnail: alliance.logoUrl || undefined,
        image: alliance.bannerUrl || undefined,
        fields: [
          {
            name: "Official stats",
            value: `Rank: ${alliance.officialRank || "N/A"}\nElo: ${alliance.officialElo || "N/A"}\nW/L: ${alliance.officialWins || 0}/${alliance.officialLosses || 0}`,
            inline: true,
          },
          {
            name: "Discore stats",
            value: `Elo: ${alliance.discoreElo}\nW/L: ${alliance.discoreWins}/${alliance.discoreLosses}`,
            inline: true,
          },
          {
            name: "Invite",
            value: alliance.discordInvite || "Not set",
            inline: false,
          },
        ],
      });
      return interaction.reply({ embeds: [embed] });
    }

    const ranking = await getAllianceRanking(
      interaction.options.getString("game", true),
    );
    const lines = ranking.map(
      (a, i) =>
        `${i + 1}. **${a.name} [${a.tag}]** — ${a.discoreElo} Elo • ${a.discoreWins}W/${a.discoreLosses}L`,
    );
    const embed = await createDiscoreEmbed(interaction, {
      title: "🌍 Global Alliance Ranking",
      description: lines.length
        ? lines.join("\n")
        : "No alliances registered yet.",
    });
    return interaction.reply({ embeds: [embed] });
  },
};
