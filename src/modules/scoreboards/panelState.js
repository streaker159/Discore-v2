"use strict";

/**
 * Lightweight TTL-based in-memory state store for scoreboard panel sessions.
 *
 * Stores only primitive IDs — no Discord objects, no circular references.
 * Entries auto-expire after TTL_MS (10 minutes by default).
 * Garbage-collected every CLEANUP_INTERVAL_MS.
 */

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 5000;

const store = new Map();

let cleanupTimer = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.expiresAt) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

// Start cleanup immediately
startCleanup();

/**
 * Store session data for a user+guild combination.
 * @param {string} userId
 * @param {string} guildId
 * @param {object} data - Must be JSON-serializable (only primitives).
 * @param {number} [ttlMs] - Custom TTL in ms.
 */
function set(userId, guildId, data, ttlMs = TTL_MS) {
  const key = `${guildId}:${userId}`;

  // Evict oldest entry if over capacity
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }

  store.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
    createdAt: Date.now(),
  });
}

/**
 * Retrieve session data for a user+guild combination.
 * Returns null if expired or not found.
 * @param {string} userId
 * @param {string} guildId
 * @returns {object|null}
 */
function get(userId, guildId) {
  const key = `${guildId}:${userId}`;
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Remove specific session.
 */
function del(userId, guildId) {
  const key = `${guildId}:${userId}`;
  store.delete(key);
}

/**
 * Check if session exists and is valid.
 */
function has(userId, guildId) {
  return get(userId, guildId) !== null;
}

/**
 * Update specific fields on an existing session.
 */
function patch(userId, guildId, updates) {
  const existing = get(userId, guildId);
  if (!existing) return false;
  set(userId, guildId, { ...existing, ...updates });
  return true;
}

module.exports = { set, get, del, has, patch };
