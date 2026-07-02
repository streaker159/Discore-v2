"use strict";

/**
 * Discore XP formula helpers
 * Uses an Arcane-like increasing curve:
 *   Level 1 = 0 XP total
 *   Level 2 = 100 XP total
 *   Level 3 = 300 XP total
 *   Level 4 = 600 XP total
 *   Level n = 100 * (n-1) + getTotalXpForLevel(n-1)
 * Simplified: totalXpForLevel(n) = 100 * n * (n-1) / 2 = 50 * n * (n-1)
 */

/**
 * Calculate current level from total XP
 * @param {number} totalXp
 * @returns {number} level (minimum 1)
 */
function calculateLevel(totalXp) {
  if (typeof totalXp !== "number" || totalXp < 0) return 1;
  // Solve: 50 * level * (level - 1) <= totalXp
  // level^2 - level - (totalXp / 50) <= 0
  // level = floor((1 + sqrt(1 + 4 * totalXp / 50)) / 2)
  const level = Math.floor((1 + Math.sqrt(1 + (8 * totalXp) / 100)) / 2);
  return Math.max(1, level);
}

/**
 * Get total XP required to reach a given level
 * @param {number} level
 * @returns {number} total XP needed to be that level
 */
function getTotalXpForLevel(level) {
  const n = Math.max(1, Math.floor(level));
  return 50 * n * (n - 1);
}

/**
 * Get XP needed to advance from current level to next level
 * @param {number} level - current level
 * @returns {number} XP needed for next level
 */
function getXpForNextLevel(level) {
  return getTotalXpForLevel(level + 1) - getTotalXpForLevel(level);
}

/**
 * Get progress towards next level as a percentage (0-100)
 * @param {number} totalXp
 * @returns {{ currentLevel: number, currentLevelXp: number, nextLevelXp: number, progressXp: number, progressPercent: number }}
 */
function getProgressToNextLevel(totalXp) {
  const currentLevel = calculateLevel(totalXp);
  const currentLevelXp = getTotalXpForLevel(currentLevel);
  const nextLevelXp = getXpForNextLevel(currentLevel);
  const progressXp = totalXp - currentLevelXp;
  const progressPercent = Math.min(
    100,
    Math.floor((progressXp / nextLevelXp) * 100),
  );
  return {
    currentLevel,
    currentLevelXp,
    nextLevelXp,
    progressXp,
    progressPercent,
  };
}

/**
 * Format XP numbers for display (1.3K, 2.2K, etc.)
 * @param {number} xp
 * @returns {string}
 */
function formatXp(xp) {
  if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(1)}M`;
  if (xp >= 1_000) return `${(xp / 1_000).toFixed(1)}K`;
  return String(Math.floor(xp));
}

module.exports = {
  calculateLevel,
  getTotalXpForLevel,
  getXpForNextLevel,
  getProgressToNextLevel,
  formatXp,
};
