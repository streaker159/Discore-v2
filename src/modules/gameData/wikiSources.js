"use strict";

/**
 * Wiki Source Registry
 *
 * Maps game keys to MediaWiki API endpoints and settings.
 * Used by the unit import system and AI context fetching.
 */

const WIKI_SOURCES = {
  supremacy_ww3: {
    game: "Conflict of Nations",
    gameKey: "supremacy_ww3",
    displayName: "Conflict of Nations (Supremacy: World War 3)",
    sourceName: "Conflict of Nations Wiki",
    apiUrl: "https://conflictnations.fandom.com/api.php",
    alternateApiUrl: null, // wiki.conflictnations.com has no usable API
    targetPage: "Units",
    sourceType: "MEDIAWIKI_API",
    enabled: true,
    // Category hierarchy for discovering unit pages
    unitCategories: [
      "Category:Units",
      "Category:Unit",
      "Category:Infantry",
      "Category:Armored",
      "Category:Support",
      "Category:Naval",
      "Category:Aircraft",
      "Category:Helicopters",
      "Category:Missiles",
      "Category:Officers",
      "Category:Deployables",
    ],
    // Known unit page prefixes to discover via links
    unitLinkPatterns: [
      /^Infantry$/i,
      /^Armored/i,
      /^Support/i,
      /^Naval/i,
      /^Air/i,
      /^Helicopter/i,
      /^Fighter/i,
      /^Heavy/i,
      /^Bomber/i,
      /^Submarine/i,
      /^Missile/i,
      /^Officer/i,
      /^Deployable/i,
    ],
    requestDelayMs: 800,
    timeoutMs: 15000,
    maxPagesPerSync: 100,
    maxDepth: 2,
  },

  call_of_war_1942: {
    game: "Call of War 1942",
    gameKey: "call_of_war_1942",
    displayName: "Call of War 1942 (Supremacy: Call of War 1942)",
    sourceName: "Call of War Wiki",
    apiUrl: "https://call-of-war-by-bytro.fandom.com/api.php",
    alternateApiUrl: null,
    targetPage: "Units",
    sourceType: "MEDIAWIKI_API",
    enabled: true,
    unitCategories: [
      "Category:Units",
      "Category:Unit",
      "Category:Infantry",
      "Category:Armored",
      "Category:Artillery",
      "Category:Air",
      "Category:Naval",
      "Category:Secret Weapons",
      "Category:Ordnance",
    ],
    unitLinkPatterns: [
      /^Infantry/i,
      /^Armored/i,
      /^Artillery/i,
      /^Air/i,
      /^Naval/i,
      /^Submarine/i,
      /^Fighter/i,
      /^Bomber/i,
      /^Tank/i,
      /^Rocket/i,
      /^Secret/i,
      /^Ordnance/i,
    ],
    requestDelayMs: 800,
    timeoutMs: 15000,
    maxPagesPerSync: 100,
    maxDepth: 2,
  },

  supremacy_1914: {
    game: "Supremacy 1914",
    gameKey: "supremacy_1914",
    displayName: "Supremacy 1914",
    sourceName: "Supremacy 1914 Wiki",
    apiUrl: "https://supremacy1914.fandom.com/api.php",
    alternateApiUrl: null,
    targetPage: "Units",
    sourceType: "MEDIAWIKI_API",
    enabled: true,
    unitCategories: [
      "Category:Units",
      "Category:Unit",
      "Category:Infantry",
      "Category:Cavalry",
      "Category:Armored",
      "Category:Artillery",
      "Category:Air",
      "Category:Naval",
    ],
    unitLinkPatterns: [
      /^Infantry/i,
      /^Cavalry/i,
      /^Armored/i,
      /^Artillery/i,
      /^Naval/i,
      /^Air/i,
      /^Fighter/i,
      /^Bomber/i,
      /^Submarine/i,
      /^Battleship/i,
      /^Cruiser/i,
    ],
    requestDelayMs: 800,
    timeoutMs: 15000,
    maxPagesPerSync: 100,
    maxDepth: 2,
  },

  iron_order_1919: {
    game: "Iron Order 1919",
    gameKey: "iron_order_1919",
    displayName: "Iron Order 1919",
    sourceName: "Iron Order 1919 Wiki",
    apiUrl: "https://ironorder1919.fandom.com/api.php",
    alternateApiUrl: null,
    targetPage: "Units",
    sourceType: "MEDIAWIKI_API",
    enabled: true,
    unitCategories: [
      "Category:Units",
      "Category:Unit",
      "Category:Infantry",
      "Category:Armored",
      "Category:Artillery",
      "Category:Air",
      "Category:Naval",
    ],
    unitLinkPatterns: [
      /^Infantry/i,
      /^Armored/i,
      /^Tank/i,
      /^Artillery/i,
      /^Naval/i,
      /^Air/i,
      /^Mech/i,
      /^Titan/i,
    ],
    requestDelayMs: 800,
    timeoutMs: 15000,
    maxPagesPerSync: 100,
    maxDepth: 2,
  },
};

// Game key aliases
const GAME_KEY_ALIASES = {
  conflict_of_nations: "supremacy_ww3",
  con: "supremacy_ww3",
  ww3: "supremacy_ww3",
  call_of_war: "call_of_war_1942",
  cow: "call_of_war_1942",
  s1914: "supremacy_1914",
  supremacy1914: "supremacy_1914",
  io1919: "iron_order_1919",
  ironorder: "iron_order_1919",
};

/**
 * Resolve a game key or alias to the canonical game key
 */
function resolveGameKey(input) {
  if (!input) return null;
  const raw = input.toLowerCase().trim();
  const lower = raw.replace(/[\s_-]+/g, "_");

  // Direct match on key
  if (WIKI_SOURCES[lower]) return lower;

  // Alias match
  for (const [alias, key] of Object.entries(GAME_KEY_ALIASES)) {
    if (lower === alias || raw === alias) return key;
  }

  // Partial alias match (e.g. "conflict of nations ww3" contains "conflict_of_nations")
  for (const [alias, key] of Object.entries(GAME_KEY_ALIASES)) {
    if (lower.includes(alias) || raw.includes(alias)) return key;
  }

  // Check if input contains any game display name or old name
  for (const [key, config] of Object.entries(WIKI_SOURCES)) {
    const names = [
      config.game.toLowerCase(),
      config.displayName.toLowerCase(),
      ...(config.aliases || []),
      ...(config.oldNames || []).map((n) => n.toLowerCase()),
    ];
    for (const name of names) {
      if (raw.includes(name.replace(/[\s_-]+/g, " ")) || raw.includes(name)) return key;
    }
  }

  // Reverse: does any game name contain the input?
  for (const [key, config] of Object.entries(WIKI_SOURCES)) {
    const nameLower = config.game.toLowerCase();
    if (nameLower.includes(raw.replace(/_/g, " "))) return key;
  }

  return null;
}

/**
 * Get wiki source config for a game key
 */
function getWikiSource(gameKey) {
  const resolved = resolveGameKey(gameKey);
  return resolved ? WIKI_SOURCES[resolved] : null;
}

/**
 * Get all enabled source configs
 */
function getAllSources() {
  return Object.entries(WIKI_SOURCES)
    .filter(([, cfg]) => cfg.enabled)
    .map(([key, cfg]) => ({ key, ...cfg }));
}

/**
 * Get game name choices for Discord
 */
function getGameChoices() {
  return Object.values(WIKI_SOURCES)
    .filter((s) => s.enabled)
    .map((s) => ({ name: s.displayName, value: s.gameKey }));
}

module.exports = {
  WIKI_SOURCES,
  GAME_KEY_ALIASES,
  resolveGameKey,
  getWikiSource,
  getAllSources,
  getGameChoices,
};
