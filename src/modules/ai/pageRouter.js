"use strict";

// Game-specific keyword to page mappings
const PAGE_ROUTING = {
  conflict_of_nations: {
    doctrine: ["Doctrines", "Doctrine"],
    doctrines: ["Doctrines", "Doctrine"],
    units: ["Units", "Unit List"],
    unit: ["Units", "Unit List"],
    infantry: ["Units", "Infantry"],
    tank: ["Units", "Armored Units"],
    armor: ["Units", "Armored Units"],
    artillery: ["Units", "Artillery"],
    aircraft: ["Units", "Aircraft"],
    air: ["Units", "Aircraft"],
    navy: ["Units", "Naval Units"],
    naval: ["Units", "Naval Units"],
    ship: ["Units", "Naval Units"],
    building: ["Buildings"],
    buildings: ["Buildings"],
    industry: ["Buildings", "Economy"],
    resource: ["Resources", "Economy"],
    resources: ["Resources", "Economy"],
    economy: ["Economy", "Resources"],
    research: ["Research", "Technology"],
    tech: ["Research", "Technology"],
    technology: ["Research", "Technology"],
    morale: ["Morale"],
    homeland: ["Homeland Security"],
    insurgency: ["Insurgency", "Morale"],
    mobilization: ["Mobilization"],
    strategy: ["Strategy", "Tactics"],
    beginner: ["Strategy", "Beginner's Guide"],
    start: ["Strategy", "Beginner's Guide"],
  },
  call_of_war: {
    doctrine: ["Doctrines", "Doctrine"],
    doctrines: ["Doctrines", "Doctrine"],
    units: ["Units", "Unit List"],
    unit: ["Units", "Unit List"],
    infantry: ["Units", "Infantry"],
    tank: ["Units", "Tanks"],
    armor: ["Units", "Tanks"],
    artillery: ["Units", "Artillery"],
    aircraft: ["Units", "Aircraft"],
    air: ["Units", "Aircraft"],
    bomber: ["Units", "Bombers"],
    fighter: ["Units", "Fighters"],
    navy: ["Units", "Naval Units"],
    naval: ["Units", "Naval Units"],
    ship: ["Units", "Naval Units"],
    submarine: ["Units", "Submarines"],
    building: ["Buildings"],
    buildings: ["Buildings"],
    barracks: ["Buildings", "Barracks"],
    airbase: ["Buildings", "Air Base"],
    "naval base": ["Buildings", "Naval Base"],
    industry: ["Buildings", "Economy"],
    resource: ["Resources", "Economy"],
    resources: ["Resources", "Economy"],
    economy: ["Economy", "Resources"],
    research: ["Research", "Technology"],
    tech: ["Research", "Technology"],
    technology: ["Research", "Technology"],
    morale: ["Morale", "Province Morale"],
    province: ["Provinces", "Morale"],
    ordnance: ["Ordnance"],
    "secret weapon": ["Secret Weapons"],
    strategy: ["Strategy", "Tactics"],
    beginner: ["Strategy", "Beginner Guide"],
    start: ["Strategy", "Beginner Guide"],
  },
  supremacy_1914_en: {
    units: ["Units", "Unit List"],
    unit: ["Units", "Unit List"],
    infantry: ["Units", "Infantry"],
    artillery: ["Units", "Artillery"],
    cavalry: ["Units", "Cavalry"],
    tank: ["Units", "Tanks"],
    armor: ["Units", "Tanks"],
    aircraft: ["Units", "Aircraft"],
    air: ["Units", "Aircraft"],
    navy: ["Units", "Naval Units"],
    naval: ["Units", "Naval Units"],
    ship: ["Units", "Naval Units"],
    battleship: ["Units", "Battleships"],
    cruiser: ["Units", "Cruisers"],
    submarine: ["Units", "Submarines"],
    building: ["Buildings"],
    buildings: ["Buildings"],
    barracks: ["Buildings", "Barracks"],
    factory: ["Buildings", "Factory"],
    fortress: ["Buildings", "Fortress"],
    railway: ["Buildings", "Railway"],
    harbor: ["Buildings", "Harbor"],
    resource: ["Resources", "Economy"],
    resources: ["Resources", "Economy"],
    economy: ["Economy", "Resources"],
    morale: ["Morale", "Province Morale"],
    province: ["Provinces", "Morale"],
    espionage: ["Espionage", "Spies"],
    spy: ["Espionage", "Spies"],
    diplomacy: ["Diplomacy"],
    coalition: ["Coalition", "Diplomacy"],
    strategy: ["Strategy", "Tactics"],
    beginner: ["Strategy", "Beginner's Guide"],
    start: ["Strategy", "Beginner's Guide"],
  },
  supremacy_1914_fr: {
    // French version - similar structure
    unités: ["Unités"],
    unité: ["Unités"],
    infanterie: ["Unités", "Infanterie"],
    artillerie: ["Unités", "Artillerie"],
    cavalerie: ["Unités", "Cavalerie"],
    bâtiment: ["Bâtiments"],
    bâtiments: ["Bâtiments"],
    ressource: ["Ressources"],
    ressources: ["Ressources"],
    économie: ["Économie"],
    moral: ["Moral"],
    morale: ["Moral"],
    province: ["Provinces"],
    stratégie: ["Stratégie"],
    strategy: ["Strategy", "Tactics"],
    beginner: ["Strategy"],
    start: ["Strategy"],
  },
  iron_order_1919: {
    units: ["Units", "Unit List"],
    unit: ["Units", "Unit List"],
    infantry: ["Units", "Infantry"],
    tank: ["Units", "Tanks"],
    armor: ["Units", "Tanks"],
    mech: ["Units", "Mechs"],
    mechs: ["Units", "Mechs"],
    titan: ["Units", "Titans"],
    titans: ["Units", "Titans"],
    artillery: ["Units", "Artillery"],
    aircraft: ["Units", "Aircraft"],
    air: ["Units", "Aircraft"],
    navy: ["Units", "Naval Units"],
    naval: ["Units", "Naval Units"],
    building: ["Buildings"],
    buildings: ["Buildings"],
    resource: ["Resources", "Economy"],
    resources: ["Resources", "Economy"],
    economy: ["Economy", "Resources"],
    research: ["Research", "Technology"],
    tech: ["Research", "Technology"],
    technology: ["Research", "Technology"],
    morale: ["Morale"],
    province: ["Provinces", "Morale"],
    strategy: ["Strategy", "Tactics"],
    beginner: ["Strategy", "Guide"],
    start: ["Strategy", "Guide"],
  },
};

/**
 * Select relevant wiki pages based on user question
 * @param {string} userPrompt - User's question
 * @param {string} gameKey - Game identifier
 * @param {boolean} complexMode - If true, allow fetching more pages
 * @returns {string[]} - Array of page titles to fetch (max 1-3)
 */
function selectWikiPagesForQuestion(userPrompt, gameKey, complexMode = false) {
  const maxPages = complexMode ? 3 : 1;
  const routing = PAGE_ROUTING[gameKey] || {};

  const lowerPrompt = userPrompt.toLowerCase();
  const selectedPages = new Set();

  // Scan for keywords
  for (const [keyword, pages] of Object.entries(routing)) {
    if (lowerPrompt.includes(keyword)) {
      // Add pages for this keyword
      for (const page of pages) {
        if (selectedPages.size >= maxPages) break;
        selectedPages.add(page);
      }
    }
    if (selectedPages.size >= maxPages) break;
  }

  // If no pages selected, use fallback
  if (selectedPages.size === 0) {
    selectedPages.add("Strategy");
  }

  return Array.from(selectedPages).slice(0, maxPages);
}

/**
 * Get fallback pages if primary pages fail
 * @param {string} gameKey
 * @returns {string[]}
 */
function getFallbackPages(gameKey) {
  return ["Main Page", "Strategy", "Units"];
}

module.exports = {
  selectWikiPagesForQuestion,
  getFallbackPages,
  PAGE_ROUTING,
};
