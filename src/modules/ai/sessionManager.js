"use strict";

// Low-memory chat session storage
// Sessions stored in Map with TTL cleanup
const sessions = new Map();

// Configuration
const MAX_SESSIONS = 100; // Limit total sessions in memory
const MAX_HISTORY_PER_SESSION = 3; // Keep only last 3 messages
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Get or create a chat session
 * @param {string} sessionId - Unique session identifier (e.g., channelId, threadId, userId)
 * @returns {object} - Session object with history and metadata
 */
function getSession(sessionId) {
  if (sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    session.lastAccess = Date.now();
    return session;
  }

  // Create new session
  const newSession = {
    id: sessionId,
    history: [], // Array of {role: 'user'|'model', parts: [{text: string}]}
    created: Date.now(),
    lastAccess: Date.now(),
  };

  // Cleanup old sessions if too many
  if (sessions.size >= MAX_SESSIONS) {
    cleanupOldestSessions(10);
  }

  sessions.set(sessionId, newSession);
  return newSession;
}

/**
 * Add message to session history (with capping)
 * @param {string} sessionId
 * @param {string} role - 'user' or 'model'
 * @param {string} text - Message text (will be trimmed if too long)
 */
function addToHistory(sessionId, role, text) {
  const session = getSession(sessionId);

  // Trim text to avoid storing huge responses
  const trimmedText =
    text.length > 1000 ? text.substring(0, 1000) + "..." : text;

  // Add message
  session.history.push({
    role: role,
    parts: [{ text: trimmedText }],
  });

  // Cap history length
  if (session.history.length > MAX_HISTORY_PER_SESSION * 2) {
    // Keep last N messages (N user + N assistant pairs)
    session.history = session.history.slice(-MAX_HISTORY_PER_SESSION * 2);
  }

  session.lastAccess = Date.now();
}

/**
 * Get session history for Gemini
 * @param {string} sessionId
 * @returns {array} - Chat history array
 */
function getHistory(sessionId) {
  const session = sessions.get(sessionId);
  return session ? session.history : [];
}

/**
 * Clear a specific session
 * @param {string} sessionId
 */
function clearSession(sessionId) {
  sessions.delete(sessionId);
}

/**
 * Cleanup expired sessions
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  let deletedCount = 0;

  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastAccess > SESSION_TTL_MS) {
      sessions.delete(sessionId);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    console.log(`[Session Cleanup] Removed ${deletedCount} expired sessions`);
  }
}

/**
 * Cleanup oldest sessions when limit reached
 * @param {number} count - Number of sessions to remove
 */
function cleanupOldestSessions(count) {
  const sorted = Array.from(sessions.entries()).sort(
    (a, b) => a[1].lastAccess - b[1].lastAccess,
  );

  for (let i = 0; i < Math.min(count, sorted.length); i++) {
    sessions.delete(sorted[i][0]);
  }

  console.log(`[Session Cleanup] Removed ${count} oldest sessions`);
}

/**
 * Get session stats
 * @returns {object}
 */
function getSessionStats() {
  return {
    totalSessions: sessions.size,
    maxSessions: MAX_SESSIONS,
    maxHistoryPerSession: MAX_HISTORY_PER_SESSION,
    sessionTTL: SESSION_TTL_MS,
  };
}

// Auto-cleanup expired sessions every 10 minutes
setInterval(cleanupExpiredSessions, 10 * 60 * 1000);

module.exports = {
  getSession,
  addToHistory,
  getHistory,
  clearSession,
  cleanupExpiredSessions,
  getSessionStats,
};
