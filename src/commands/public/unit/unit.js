"use strict";

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { getGameChoices } = require("../../../modules/gameData/wikiSources");
const { searchUnits, viewUnit, compareUnits } = require("../../../modules/gameData/unitLookupService");
const gameChoices = getGameChoices();

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("unit")
    .setDescription("Search and view game unit data from the verified database.")
    .addSubcommand((s) =>
      s.setName("search").setDescription("Search for units.")
        .addStringOption((o) => o.setName("game").setDescription("Game").setRequired(true).addChoices(...gameChoices))
        .addStringOption((o) => o.setName("query").setDescription("Unit name or keyword").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("view").setDescription("View a specific unit.")
        .addStringOption((o) => o.setName("game").setDescription("Game").setRequired(true).addChoices(...gameChoices))
        .addStringOption((o) => o.setName("unit").setDescription("Unit name").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("compare").setDescription("Compare two units.")
        .addStringOption((o) => o.setName("game").setDescription("Game").setRequired(true).addChoices(...gameChoices))
        .addStringOption((o) => o.setName("unit_a").setDescription("First unit").setRequired(true))
        .addStringOption((o) => o.setName("unit_b").setDescription("Second unit").setRequired(true))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gameKey = interaction.options.getString("game", true);

    if (sub === "search") {
      await interaction.deferReply();
      const query = interaction.options.getString("query", true);
      const result = await searchUnits(gameKey, query);
      if (!result.ok) return interaction.editReply({ content: `❌ ${result.error}` });
      if (!result.units || result.units.length === 0) return interaction.editReply({ content: "I don't have verified unit data for that yet, commander." });

      const embed = new EmbedBuilder().setTitle(`🔍 Unit Search: "${query}"`).setColor(0x1a7a9e)
        .setDescription(result.units.slice(0, 15).map((u, i) => {
          let line = `**${i + 1}. ${u.name}** (${u.category || "?"})`;
          const v = u.variants?.[0];
          if (v) {
            const bits = []; if (v.hitPoints != null) bits.push(`HP:${v.hitPoints}`); if (v.speed != null) bits.push(`Spd:${v.speed}`); if (v.range != null) bits.push(`Rng:${v.range}`);
            if (bits.length) line += ` - ${bits.join(", ")}`;
          }
          return line;
        }).join("\n"))
        .setFooter({ text: `Found ${result.units.length} units. Use /unit view for details.` });
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === "view") {
      await interaction.deferReply();
      const unitName = interaction.options.getString("unit", true);
      const result = await viewUnit(gameKey, unitName);
      if (!result.ok) return interaction.editReply({ content: "I don't have verified unit data for that yet, commander." });
      if (result.multiple) {
        const embed = new EmbedBuilder().setTitle(`Multiple matches for "${unitName}"`).setColor(0x1a7a9e)
          .setDescription(result.units.map((u) => `**${u.name}** (${u.category || "?"})`).join("\n"))
          .setFooter({ text: "Use exact unit name with /unit view" });
        return interaction.editReply({ embeds: [embed] });
      }

      const u = result.unit;
      const embed = new EmbedBuilder().setTitle(u.name).setColor(0x1a7a9e)
        .addFields({ name: "Game", value: u.game, inline: true }, { name: "Category", value: u.category || "Unknown", inline: true }, { name: "Verified", value: u.verified ? "✅ Yes" : "⚠️ No", inline: true });
      if (u.description) embed.addFields({ name: "Description", value: u.description.slice(0, 500) });

      const v = u.variants?.[0];
      if (v) {
        const stats = [];
        if (v.hitPoints != null) stats.push(`HP:${v.hitPoints}`); if (v.speed != null) stats.push(`Speed:${v.speed}`); if (v.range != null) stats.push(`Range:${v.range}`);
        if (v.sightRange != null) stats.push(`Sight:${v.sightRange}`); if (v.radarRange != null) stats.push(`Radar:${v.radarRange}`);
        if (stats.length) embed.addFields({ name: "Stats", value: stats.join(" | ") });

        const c = v.costs?.[0];
        if (c) {
          const costs = [];
          if (c.supplies) costs.push(`Supplies:${c.supplies}`); if (c.components) costs.push(`Components:${c.components}`);
          if (c.manpower) costs.push(`Manpower:${c.manpower}`); if (c.electronics) costs.push(`Elec:${c.electronics}`);
          if (c.fuel) costs.push(`Fuel:${c.fuel}`); if (c.cash) costs.push(`Cash:${c.cash}`);
          if (c.rareMaterials) costs.push(`Rare:${c.rareMaterials}`); if (c.rawTimeText) costs.push(`Time:${c.rawTimeText}`);
          if (costs.length) embed.addFields({ name: "Cost", value: costs.join(" | ") });
        }
      }
      if (u.sourceUrl) embed.setFooter({ text: `Source: ${u.sourceName || u.sourceUrl}` });
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === "compare") {
      await interaction.deferReply();
      const ua = interaction.options.getString("unit_a", true);
      const ub = interaction.options.getString("unit_b", true);
      const result = await compareUnits(gameKey, ua, ub);
      if (!result.ok) return interaction.editReply({ content: result.error });

      const a = result.unitA, b = result.unitB, va = a.variants?.[0], vb = b.variants?.[0];
      const embed = new EmbedBuilder().setTitle(`⚔️ ${a.name} vs ${b.name}`).setColor(0x1a7a9e);
      const row = (l, fn) => { const v1 = fn(va), v2 = fn(vb); if (v1 == null && v2 == null) return null; return `**${l}:** ${v1 != null ? v1 : "?"} vs ${v2 != null ? v2 : "?"}`; };
      const lines = [row("HP", (v) => v?.hitPoints), row("Speed", (v) => v?.speed), row("Range", (v) => v?.range), row("Sight", (v) => v?.sightRange), row("Radar", (v) => v?.radarRange)].filter(Boolean);
      embed.addFields({ name: "Stat Comparison", value: lines.length ? lines.join("\n") : "No comparative stats available." });
      return interaction.editReply({ embeds: [embed] });
    }
  },
};