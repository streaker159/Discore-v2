"use strict";

/**
 * Shared in-memory session store for the Auto Post creation flow.
 * Used by both select menus and modals to pass state between steps.
 */
const sessions = new Map(); // userId -> { triggerType, channelId, messageMode, ... }

function getSession(userId) {
  return sessions.get(userId) || {};
}

function setSession(userId, data) {
  const existing = sessions.get(userId) || {};
  sessions.set(userId, { ...existing, ...data });
}

function clearSession(userId) {
  sessions.delete(userId);
}

module.exports = { getSession, setSession, clearSession };
