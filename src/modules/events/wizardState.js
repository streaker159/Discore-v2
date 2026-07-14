"use strict";

/**
 * Lightweight TTL-based in-memory state store for event wizard sessions.
 *
 * Stores only primitive IDs — no Discord objects, no circular references.
 * Entries auto-expire after TTL_MS (30 minutes by default).
 * Garbage-collected every CLEANUP_INTERVAL_MS.
 */

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 2000;

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

startCleanup();

function set(userId, guildId, data, ttlMs = TTL_MS) {
  const key = `${guildId}:${userId}`;
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

function del(userId, guildId) {
  store.delete(`${guildId}:${userId}`);
}

function patch(userId, guildId, updates) {
  const existing = get(userId, guildId);
  if (!existing) return false;
  set(userId, guildId, { ...existing, ...updates });
  return true;
}

module.exports = { set, get, del, patch };
