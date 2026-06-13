const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { requireFeature } = require("../../../lib/premiumGate");
const {
  answerStrategy,
  getCredits,
  CREDIT_COSTS,
} = require("../../../modules/ai/service");
const {
  createDiscoreEmbed,
  getGuildSettings,
} = require("../../../lib/embedBuilder");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("strategy")
    .setDescription("Ask Discore AI for strategy advice.")
    .addSubcommand((s) =>
      s
        .setName("ask")
        .setDescription("Ask a basic strategy question (1 credit).")
        .addStringOption((o) =>
          o
            .setName("question")
            .setDescription("Your strategy question")
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("deep")
        .setDescription("Get a deep strategy report (5 credits).")
        .addStringOption((o) =>
          o
            .setName("question")
            .setDescription("Your detailed strategy question")
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName("credits").setDescription("Show AI credit balance."),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "credits") {
      const credits = await getCredits(interaction.guildId);
      const embed = await createDiscoreEmbed(interaction, {
        title: "🧠 AI Credits",
        description: `Balance: **${credits.balance}** credits.\n\nCredit costs:\n• Basic question — **${CREDIT_COSTS["strategy.basic"]} credit**\n• Deep report — **${CREDIT_COSTS["strategy.deep"]} credits**`,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const ok = await requireFeature(interaction, "strategy.ai");
    if (!ok) return;

    await interaction.deferReply();
    const settings = await getGuildSettings(interaction.guildId);
    const question = interaction.options.getString("question", true);
    const requestType = sub === "deep" ? "strategy.deep" : "strategy.basic";

    const answer = await answerStrategy({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      prompt: question,
      requestType,
      context: {
        defaultGame: settings.defaultGame,
        timezone: settings.timezone,
        allianceName: settings.allianceName,
      },
    });

    const embed = await createDiscoreEmbed(interaction, {
      title:
        sub === "deep" ? "🧠 Discore Deep Strategy" : "🧠 Discore Strategy",
      description: answer.slice(0, 4000),
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`strategy:ask:${interaction.user.id}`)
        .setLabel("Ask follow-up")
        .setEmoji("❓")
        .setStyle(ButtonStyle.Primary),
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
  },
};
