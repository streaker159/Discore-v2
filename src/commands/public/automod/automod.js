"use strict";

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const {
  addRule,
  removeRule,
  getRules,
} = require("../../../modules/automod/service");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Automated moderation")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("add-rule")
        .setDescription("Add banned word/phrase")
        .addStringOption((opt) =>
          opt
            .setName("phrase")
            .setDescription("Word or phrase to block")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("match")
            .setDescription("Match type")
            .addChoices(
              { name: "Contains (default)", value: "CONTAINS" },
              { name: "Exact match", value: "EXACT" },
              { name: "Starts with", value: "STARTS_WITH" },
              { name: "Regex", value: "REGEX" },
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName("action")
            .setDescription("Action to take")
            .addChoices(
              { name: "Review (default)", value: "REVIEW" },
              { name: "Delete", value: "DELETE" },
              { name: "Timeout", value: "TIMEOUT" },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove-rule")
        .setDescription("Remove a rule")
        .addIntegerOption((opt) =>
          opt
            .setName("rule_id")
            .setDescription("Rule ID from list")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list-rules").setDescription("List all automod rules"),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    try {
      if (sub === "add-rule") {
        const phrase = interaction.options.getString("phrase", true);
        const matchType = interaction.options.getString("match") || "CONTAINS";
        const action = interaction.options.getString("action") || "REVIEW";

        const rule = await addRule({
          guildId,
          phrase,
          matchType,
          action,
          createdBy: interaction.user.id,
        });

        const embed = await createDiscoreEmbed(interaction, {
          title: "✅ Automod Rule Added",
          fields: [
            { name: "Phrase", value: phrase },
            { name: "Match Type", value: matchType },
            { name: "Action", value: action },
            { name: "Rule ID", value: String(rule.id) },
          ],
          color: "#2ecc71",
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (sub === "remove-rule") {
        const ruleId = interaction.options.getInteger("rule_id", true);

        await removeRule(ruleId);

        const embed = await createDiscoreEmbed(interaction, {
          title: "✅ Rule Removed",
          description: `Automod rule #${ruleId} has been deleted`,
          color: "#e74c3c",
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (sub === "list-rules") {
        const rules = await getRules(guildId);

        if (rules.length === 0) {
          return interaction.reply({
            content:
              "No automod rules configured. Use `/automod add-rule` to create one.",
            ephemeral: true,
          });
        }

        const rulesList = rules
          .map(
            (r) =>
              `**ID ${r.id}** • ${r.matchType}\n` +
              `└ Phrase: \`${r.phrase}\` → ${r.action}${r.enabled ? "" : " (disabled)"}`,
          )
          .join("\n\n");

        const embed = await createDiscoreEmbed(interaction, {
          title: "🛡️ Automod Rules",
          description: rulesList,
          footer: `Total: ${rules.length} rule(s)`,
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    } catch (error) {
      console.error("[Automod Command Error]", error);
      return interaction.reply({
        content: `Error: ${error.message}`,
        ephemeral: true,
      });
    }
  },
};
