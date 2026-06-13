const { SlashCommandBuilder } = require("discord.js");
const {
  createSuggestion,
  vote,
  removeVote,
  getVoters,
  getSuggestion,
  buildSuggestionEmbed,
  suggestionButtons,
} = require("../../../modules/suggestions/service");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("suggestion")
    .setDescription("Create suggestions with voting.")
    .addSubcommand((s) =>
      s
        .setName("create")
        .setDescription("Create a suggestion.")
        .addStringOption((o) =>
          o
            .setName("content")
            .setDescription("Suggestion text")
            .setRequired(true),
        )
        .addStringOption((o) => o.setName("image").setDescription("Image URL")),
    )
    .addSubcommand((s) =>
      s
        .setName("remove-vote")
        .setDescription("Remove your vote from a suggestion.")
        .addStringOption((o) =>
          o.setName("id").setDescription("Suggestion ID").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("see-voters")
        .setDescription("See who voted on a suggestion.")
        .addStringOption((o) =>
          o.setName("id").setDescription("Suggestion ID").setRequired(true),
        ),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "create") {
      const suggestion = await createSuggestion({
        guildId: interaction.guildId,
        authorId: interaction.user.id,
        content: interaction.options.getString("content", true),
        imageUrl: interaction.options.getString("image"),
        channelId: interaction.channelId,
      });
      const embed = await buildSuggestionEmbed(interaction, suggestion);
      const message = await interaction.channel.send({
        embeds: [embed],
        components: suggestionButtons(suggestion.id),
      });
      return interaction.reply({
        content: `✅ Suggestion posted. ID: \`${suggestion.id}\``,
        ephemeral: true,
      });
    }

    if (sub === "remove-vote") {
      const id = interaction.options.getString("id", true);
      const existing = await getSuggestion(id);
      if (!existing)
        return interaction.reply({
          content: "Suggestion not found.",
          ephemeral: true,
        });
      await removeVote(id, interaction.user.id);
      const updated = await getSuggestion(id);
      const embed = await buildSuggestionEmbed(interaction, updated);
      return interaction.reply({
        content: "✅ Vote removed.",
        embeds: [embed],
        ephemeral: true,
      });
    }

    if (sub === "see-voters") {
      const id = interaction.options.getString("id", true);
      const existing = await getSuggestion(id);
      if (!existing)
        return interaction.reply({
          content: "Suggestion not found.",
          ephemeral: true,
        });
      const voters = await getVoters(id);
      const upList = voters.up.length
        ? voters.up.map((u) => `<@${u}>`).join(", ")
        : "None";
      const downList = voters.down.length
        ? voters.down.map((u) => `<@${u}>`).join(", ")
        : "None";
      const embed = await createDiscoreEmbed(interaction, {
        title: "👥 Suggestion Voters",
        description: `**"${existing.content.slice(0, 100)}"**`,
        fields: [
          {
            name: `👍 Upvotes (${voters.up.length})`,
            value: upList,
            inline: false,
          },
          {
            name: `👎 Downvotes (${voters.down.length})`,
            value: downList,
            inline: false,
          },
        ],
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
