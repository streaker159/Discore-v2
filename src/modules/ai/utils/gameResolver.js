"use strict";

const supportedGames = require("../config/supportedGames");

/**
 * Normalize string for comparison
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve game key from user input or alias
 * @param {string} input - User input or alias
 * @returns {string|null} - Game key or null if not found
 */
function resolveGameKey(input) {
  if (!input) return null;

  const normalized = normalize(input);

  // Check exact game key match first
  if (supportedGames[normalized]) {
    return normalized;
  }

  // Check display names, old names, and aliases
  for (const [gameKey, gameData] of Object.entries(supportedGames)) {
    // Check display name
    if (normalize(gameData.displayName) === normalized) {
      return gameKey;
    }

    // Check old names
    if (gameData.oldNames) {
      for (const oldName of gameData.oldNames) {
        if (normalize(oldName) === normalized) {
          return gameKey;
        }
      }
    }

    // Check aliases
    if (gameData.aliases) {
      for (const alias of gameData.aliases) {
        if (normalize(alias) === normalized) {
          return gameKey;
        }
      }
    }
  }

  return null;
}

/**
 * Get game data by key
 * @param {string} gameKey
 * @returns {object|null}
 */
function getGameData(gameKey) {
  return supportedGames[gameKey] || null;
}

/**
 * Get all supported game keys
 * @returns {string[]}
 */
function getAllGameKeys() {
  return Object.keys(supportedGames);
}

/**
 * Get all games as choice options for Discord
 * @returns {Array<{name: string, value: string}>}
 */
function getGameChoices() {
  return Object.entries(supportedGames).map(([key, data]) => ({
    name: data.displayName,
    value: key,
  }));
}

module.exports = {
  resolveGameKey,
  getGameData,
  getAllGameKeys,
  getGameChoices,
  normalize,
};
