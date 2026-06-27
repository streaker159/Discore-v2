"use strict";

const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const {
  getGameChoices,
  getGameData,
} = require("../../../modules/ai/utils/gameResolver");
const {
  getCategoryChoices,
} = require("../../../modules/ai/config/strategyCategories");
const { askDiscoreAI } = require("../../../modules/ai/strategyAdvisor");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");
const { getPremiumStatus } = require("../../../modules/premium/service");
const { getPlanLimits } = require("../../../config/plans");

// Depth choices
const DEPTH_CHOICES = [
  { name: "⚡ Quick - Fast answer", value: "quick" },
  { name: "📝 Standard - Normal answer", value: "standard" },
  { name: "🔍 Deep - Detailed analysis", value: "deep" },
];

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask Discore AI for strategy help")
    .addStringOption((option) =>
      option
        .setName("game")
        .setDescription("Which game are you playing?")
        .setRequired(true)
        .addChoices(...getGameChoices()),
    )
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("Your strategy question")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("scenario")
        .setDescription("Map/scenario you're playing (optional)")
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName("speed")
        .setDescription("Game speed (optional)")
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("Strategy focus area (optional)")
        .addChoices(...getCategoryChoices()),
    )
    .addStringOption((option) =>
      option
        .setName("depth")
        .setDescription("Answer depth (default: standard)")
        .addChoices(...DEPTH_CHOICES),
    )
    .addStringOption((option) =>
      option.setName("nation").setDescription("Your nation/country (optional)"),
    )
    .addIntegerOption((option) =>
      option
        .setName("day")
        .setDescription("Game day (optional)")
        .setMinValue(1)
        .setMaxValue(999),
    )
    .addBooleanOption((option) =>
      option
        .setName("private")
        .setDescription("Reply privately (default: public)"),
    ),

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    const gameKey = interaction.options.getString("game");

    if (focusedOption.name === "scenario") {
      const gameData = gameKey ? getGameData(gameKey) : null;

      if (!gameData) {
        return interaction.respond([
          { name: "Please select a game first", value: "none" },
        ]);
      }

      const scenarios = gameData.scenarios || [];
      const focusedValue = focusedOption.value.toLowerCase();

      const filtered = scenarios
        .filter(
          (s) =>
            s.name.toLowerCase().includes(focusedValue) ||
            s.key.toLowerCase().includes(focusedValue),
        )
        .slice(0, 25)
        .map((s) => ({
          name: `${s.name}${s.players ? ` (${s.players}p)` : ""}`,
          value: s.key,
        }));

      return interaction.respond(
        filtered.length > 0
          ? filtered
          : [{ name: "No scenarios found", value: "custom" }],
      );
    }

    if (focusedOption.name === "speed") {
      const gameData = gameKey ? getGameData(gameKey) : null;

      if (!gameData) {
        return interaction.respond([
          { name: "Please select a game first", value: "custom" },
        ]);
      }

      const speeds = gameData.speeds || [];
      const focusedValue = focusedOption.value.toLowerCase();

      const filtered = speeds
        .filter(
          (s) =>
            s.name.toLowerCase().includes(focusedValue) ||
            s.key.toLowerCase().includes(focusedValue),
        )
        .map((s) => ({
          name: s.name,
          value: s.key,
        }));

      return interaction.respond(
        filtered.length > 0
          ? filtered
          : [{ name: "Standard / 1x", value: "1x" }],
      );
    }
  },

  async execute(interaction) {
    // Defer IMMEDIATELY - Must be absolute first thing to prevent timeout
    try {
      const isPrivate = interaction.options.getBoolean("private") || false;
      await interaction.deferReply({
        flags: [MessageFlags.Ephemeral],
        ephemeral: isPrivate,
      });
    } catch (deferError) {
      console.error(
        "[Ask] Defer failed - interaction expired:",
        deferError.message,
      );
      return;
    }

    try {
      // Gather all context
      const gameKey = interaction.options.getString("game", true);
      const question = interaction.options.getString("question", true);
      const scenarioKey = interaction.options.getString("scenario");
      const speed = interaction.options.getString("speed");
      const category = interaction.options.getString("category");
      const depth = interaction.options.getString("depth") || "standard";
      const nation = interaction.options.getString("nation");
      const day = interaction.options.getInteger("day");

      const gameData = getGameData(gameKey);

      if (!gameData) {
        return interaction.editReply({
          content: "Invalid game selection. Please try again.",
        });
      }

      // Find scenario name if provided
      let scenarioName = null;
      if (scenarioKey && gameData.scenarios) {
        const scenario = gameData.scenarios.find((s) => s.key === scenarioKey);
        scenarioName = scenario ? scenario.name : scenarioKey;
      }

      // ═══════════════════════════════════════════════════════
      // PREMIUM CHECK - AI Credit System
      // ═══════════════════════════════════════════════════════
      const premiumStatus = await getPremiumStatus(interaction.guildId);
      const limits = premiumStatus.limits;

      // Check if AI is available for this tier
      if (limits.aiCreditsMonthly === 0) {
        const lockedEmbed = await createDiscoreEmbed(interaction, {
          title: "🔒 Premium Feature",
          description:
            "**Discore AI** requires premium access.\n\n" +
            "Upgrade to **Pro**, **Elite**, or **Lifetime** to unlock AI strategy assistance.\n\n" +
            "Use `/premium status` to see your options.",
          color: "#e74c3c",
        });
        return interaction.editReply({ embeds: [lockedEmbed] });
      }

      // Credit costs by depth
      const creditCosts = { quick: 1, standard: 2, deep: 5 };
      const cost = creditCosts[depth] || 2;

      // TODO: Implement actual credit tracking from AiUsage table
      // For now, allow premium users through
      // Future: Check monthly usage and deny if exhausted

      // Build strategy context
      const strategyContext = {
        gameKey,
        gameName: gameData.displayName,
        oldNames: gameData.oldNames || [],
        scenarioKey,
        scenarioName,
        speed,
        depth,
        category,
        nation,
        day,
        question,
      };

      // Determine if complex mode based on depth
      const useComplexMode = depth === "deep";

      // Call Discore AI with context
      const result = await askDiscoreAI(
        question,
        gameKey,
        interaction.channelId,
        {
          complexMode: useComplexMode,
          strategyContext,
        },
      );

      if (!result.ok) {
        return interaction.editReply({
          content: result.answer,
        });
      }

      // Build context display
      const contextParts = [];
      contextParts.push(`**Game:** ${gameData.displayName}`);
      if (scenarioName) contextParts.push(`**Scenario:** ${scenarioName}`);
      if (speed) contextParts.push(`**Speed:** ${speed}`);
      if (category) contextParts.push(`**Focus:** ${category}`);
      if (nation) contextParts.push(`**Nation:** ${nation}`);
      if (day) contextParts.push(`**Day:** ${day}`);

      const contextDisplay = contextParts.join(" • ");

      const embed = await createDiscoreEmbed(interaction, {
        title: "🧠 Discore AI Strategy",
        description: result.answer.slice(0, 4000),
        footer: `${contextDisplay}\nModel: ${result.modelUsed}`,
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Ask Command Error]", error);
      return interaction.editReply({
        content:
          "Something went wrong processing your question. Please try again.",
      });
    }
  },
};
