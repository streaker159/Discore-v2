"use strict";

const repo = require("./unitRepository");
const { resolveGameKey } = require("./wikiSources");

/**
 * Search for units across the verified database
 */
async function searchUnits(gameKey, query) {
  const resolved = resolveGameKey(gameKey);
  if (!resolved) return { ok: false, error: `Unknown game: ${gameKey}` };
  const units = await repo.searchUnits(resolved, query);
  return { ok: true, units, count: units.length };
}

/**
 * View a specific unit by name
 */
async function viewUnit(gameKey, unitName) {
  const resolved = resolveGameKey(gameKey);
  if (!resolved) return { ok: false, error: `Unknown game: ${gameKey}` };

  const slug = unitName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const unit = await repo.getUnitBySlug(resolved, slug);
  if (!unit) {
    // Try search fallback
    const results = await repo.searchUnits(resolved, unitName);
    if (results.length === 1) return { ok: true, unit: results[0], exactMatch: false };
    if (results.length > 1) return { ok: true, multiple: true, units: results, exactMatch: false };
    return { ok: false, error: `No unit found matching "${unitName}"` };
  }
  return { ok: true, unit, exactMatch: true };
}

/**
 * Compare two units
 */
async function compareUnits(gameKey, unitA, unitB) {
  const resolved = resolveGameKey(gameKey);
  if (!resolved) return { ok: false, error: `Unknown game: ${gameKey}` };

  const slugA = unitA.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const slugB = unitB.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const [a, b] = await Promise.all([
    repo.getUnitBySlug(resolved, slugA),
    repo.getUnitBySlug(resolved, slugB),
  ]);

  if (!a && !b) return { ok: false, error: `Neither unit found` };
  if (!a) return { ok: false, error: `Unit "${unitA}" not found` };
  if (!b) return { ok: false, error: `Unit "${unitB}" not found` };

  return { ok: true, unitA: a, unitB: b };
}

/**
 * Build AI context string from verified units
 */
async function buildAiUnitContext(gameKey, query = "") {
  const resolved = resolveGameKey(gameKey);
  if (!resolved) return "";

  let units;
  if (query) {
    units = await repo.searchUnits(resolved, query);
  } else {
    units = await repo.getAllVerifiedUnits(resolved);
  }

  if (!units || units.length === 0) return "";

  let context = "VERIFIED UNIT DATABASE CONTEXT (source of truth):\n\n";
  for (const unit of units.slice(0, 15)) {
    context += `Unit: ${unit.name} (${unit.category || "Unknown"})`;
    if (unit.description) context += `\n  Description: ${unit.description.slice(0, 200)}`;

    if (unit.variants && unit.variants.length > 0) {
      const v = unit.variants[0];
      const stats = [];
      if (v.hitPoints != null) stats.push(`HP: ${v.hitPoints}`);
      if (v.speed != null) stats.push(`Speed: ${v.speed}`);
      if (v.range != null) stats.push(`Range: ${v.range}`);
      if (v.sightRange != null) stats.push(`Sight: ${v.sightRange}`);
      if (v.radarRange != null) stats.push(`Radar: ${v.radarRange}`);
      if (stats.length > 0) context += `\n  Stats: ${stats.join(", ")}`;

      if (v.costs && v.costs.length > 0) {
        const c = v.costs[0];
        const costs = [];
        if (c.supplies) costs.push(`Supplies: ${c.supplies}`);
        if (c.components) costs.push(`Components: ${c.components}`);
        if (c.manpower) costs.push(`Manpower: ${c.manpower}`);
        if (c.electronics) costs.push(`Electronics: ${c.electronics}`);
        if (c.fuel) costs.push(`Fuel: ${c.fuel}`);
        if (c.cash) costs.push(`Cash: ${c.cash}`);
        if (costs.length > 0) context += `\n  Cost: ${costs.join(", ")}`;
      }
    }
    context += "\n";
  }

  if (units.length > 15) {
    context += `\n(Showing 15 of ${units.length} verified units. Ask for more detail on specific units.)\n`;
  }

  context += "\nUse this database as the source of truth for unit stats. Do not guess or invent values.\n";
  return context;
}

module.exports = { searchUnits, viewUnit, compareUnits, buildAiUnitContext };
