"use strict";

/**
 * Strategy categories for focused AI answers
 * Each category helps route to relevant wiki pages and narrows AI focus
 */

const STRATEGY_CATEGORIES = [
  { key: "opening", name: "Opening / Early Game", emoji: "🎯" },
  { key: "economy", name: "Economy", emoji: "💰" },
  { key: "resources", name: "Resources", emoji: "⚡" },
  { key: "buildings", name: "Buildings", emoji: "🏭" },
  { key: "units", name: "Units", emoji: "🪖" },
  { key: "research", name: "Research / Technology", emoji: "🔬" },
  { key: "doctrine", name: "Doctrine", emoji: "📜" },
  { key: "offense", name: "Offense / Attacks", emoji: "⚔️" },
  { key: "defense", name: "Defense", emoji: "🛡️" },
  { key: "air", name: "Air Warfare", emoji: "✈️" },
  { key: "navy", name: "Naval Warfare", emoji: "🚢" },
  { key: "artillery", name: "Artillery", emoji: "🎯" },
  { key: "missiles", name: "Missiles / WMD", emoji: "🚀" },
  { key: "espionage", name: "Espionage / Intelligence", emoji: "🕵️" },
  { key: "diplomacy", name: "Diplomacy", emoji: "🤝" },
  { key: "coalition", name: "Coalition / Teamwork", emoji: "👥" },
  { key: "morale", name: "Morale", emoji: "😊" },
  { key: "terrain", name: "Terrain / Geography", emoji: "🗺️" },
  { key: "counters", name: "Unit Counters", emoji: "🔄" },
  { key: "expansion", name: "Expansion", emoji: "📈" },
  { key: "endgame", name: "Endgame / Victory", emoji: "🏆" },
  { key: "team_coordination", name: "Team Coordination", emoji: "📞" },
  { key: "general", name: "General Strategy", emoji: "💡" },
];

/**
 * Get category choices for Discord command
 * @returns {Array<{name: string, value: string}>}
 */
function getCategoryChoices() {
  return STRATEGY_CATEGORIES.map((cat) => ({
    name: `${cat.emoji} ${cat.name}`,
    value: cat.key,
  }));
}

/**
 * Get category data by key
 * @param {string} key
 * @returns {object|null}
 */
function getCategoryData(key) {
  return STRATEGY_CATEGORIES.find((cat) => cat.key === key) || null;
}

/**
 * Get wiki pages to prioritize based on category
 * @param {string} category
 * @param {string} gameKey
 * @returns {string[]}
 */
function getCategoryWikiPages(category, gameKey) {
  const pageMap = {
    opening: ["Strategy", "Guide", "Beginner"],
    economy: ["Economy", "Resources", "Buildings"],
    resources: ["Resources", "Economy", "Production"],
    buildings: ["Buildings", "Infrastructure", "Economy"],
    units: ["Units", "Military", "Army"],
    research: ["Research", "Technology", "Doctrine"],
    doctrine: ["Doctrine", "Research", "Units"],
    offense: ["Strategy", "Units", "Combat"],
    defense: ["Strategy", "Units", "Terrain"],
    air: ["Air Force", "Units", "Strategy"],
    navy: ["Navy", "Naval", "Units"],
    artillery: ["Artillery", "Units", "Strategy"],
    missiles: ["Missiles", "WMD", "Units"],
    espionage: ["Espionage", "Intelligence", "Strategy"],
    diplomacy: ["Diplomacy", "Coalition", "Strategy"],
    coalition: ["Coalition", "Diplomacy", "Strategy"],
    morale: ["Morale", "Provinces", "Buildings"],
    terrain: ["Terrain", "Geography", "Strategy"],
    counters: ["Units", "Strategy", "Combat"],
    expansion: ["Strategy", "Provinces", "Diplomacy"],
    endgame: ["Victory", "Strategy", "Endgame"],
    team_coordination: ["Coalition", "Strategy", "Diplomacy"],
    general: ["Strategy", "Guide", "Main Page"],
  };

  return pageMap[category] || ["Strategy", "Main Page"];
}

module.exports = {
  STRATEGY_CATEGORIES,
  getCategoryChoices,
  getCategoryData,
  getCategoryWikiPages,
};
