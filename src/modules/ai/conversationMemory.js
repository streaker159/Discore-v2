"use strict";

// ── Lightweight in-memory conversation memory ──────────────────────────
// Stores recent turns per user+channel+guild. No database required.
// Auto-expires stale entries. Used for context-aware routing and replies.

const MAX_TURNS = 6;
const MAX_CHARS_PER_TURN = 500;
const MAX_CONTEXT_CHARS = 2500;
const TTL_MS = 20 * 60 * 1000; // 20 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

// Map<`guildId:channelId:userId`, { turns: [], lastUpdated: ts }>
const memory = new Map();

// ── Cleanup ────────────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memory) {
    if (now - entry.lastUpdated > TTL_MS) memory.delete(key);
  }
}, CLEANUP_INTERVAL_MS);

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Add a conversation turn.
 * @param {object} params
 * @param {string} params.guildId
 * @param {string} params.channelId
 * @param {string} params.userId
 * @param {"user"|"assistant"} params.role
 * @param {string} params.content — raw text, will be trimmed
 * @param {string} [params.messageId]
 * @param {string} [params.intent]
 */
function addTurn({
  guildId,
  channelId,
  userId,
  role,
  content,
  messageId,
  intent,
}) {
  if (!guildId || !channelId || !userId) return;
  const key = `${guildId}:${channelId}:${userId}`;
  let entry = memory.get(key);
  if (!entry) {
    entry = { turns: [], lastUpdated: Date.now() };
    memory.set(key, entry);
  }

  const trimmed =
    typeof content === "string"
      ? content.trim().substring(0, MAX_CHARS_PER_TURN)
      : "";

  if (!trimmed) return;

  entry.turns.push({
    role,
    content: trimmed,
    messageId: messageId || null,
    intent: intent || null,
    ts: Date.now(),
  });

  // Trim to max turns
  while (entry.turns.length > MAX_TURNS) entry.turns.shift();

  entry.lastUpdated = Date.now();
}

/**
 * Get compact conversation context string for injection into AI prompts.
 * Returns empty string if no context.
 */
function getContextString({ guildId, channelId, userId }) {
  if (!guildId || !channelId || !userId) return "";
  const key = `${guildId}:${channelId}:${userId}`;
  const entry = memory.get(key);
  if (!entry || entry.turns.length === 0) return "";

  const now = Date.now();
  if (now - entry.lastUpdated > TTL_MS) {
    memory.delete(key);
    return "";
  }

  const lines = entry.turns.map((t) => {
    const label = t.role === "assistant" ? "Discore" : "User";
    return `${label}: ${t.content}`;
  });

  let out = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    const candidate = lines[i] + (i < lines.length - 1 ? "\n" : "");
    if (out.length + candidate.length > MAX_CONTEXT_CHARS) break;
    out = candidate + out;
  }

  if (out.length > MAX_CONTEXT_CHARS) {
    out = out.substring(out.length - MAX_CONTEXT_CHARS);
  }

  return out.trim();
}

/**
 * Check if the current message is likely a continuation of a recent conversation.
 * Checks if the message replies to a stored Discore message, or if the user
 * is in a recent conversation context.
 */
function isConversationContinuation({ guildId, channelId, userId, message }) {
  if (!guildId || !channelId || !userId || !message) return false;

  const key = `${guildId}:${channelId}:${userId}`;
  const entry = memory.get(key);
  if (!entry || entry.turns.length === 0) return false;

  const now = Date.now();
  if (now - entry.lastUpdated > TTL_MS) {
    memory.delete(key);
    return false;
  }

  // Check if this message is a reply to one of our stored assistant messages
  const replyToId = message?.reference?.messageId;
  if (replyToId) {
    return entry.turns.some(
      (t) => t.role === "assistant" && t.messageId === replyToId,
    );
  }

  // Not a reply — only continue if within 2 minutes of last turn
  return now - entry.lastUpdated < 2 * 60 * 1000;
}

/**
 * Check if the user message looks like a correction (e.g. "no, not the game").
 */
function isCorrectionMessage(text) {
  const lower = text.toLowerCase().trim();
  return /^(no|nope|nah|not that|wrong|you misunderstood|i mean|i wasn.t|i was asking about|i was talking about|i wasn.t talking about|not the game|not about|stop|don.t|don.t do that)/i.test(
    lower,
  );
}

/**
 * Check if the user message looks like an answer to the game selector
 * (just a game name abbreviation).
 */
function isGameSelectorAnswer(text) {
  const lower = text.trim().toLowerCase();
  return /^(con|conflict of nations|cow|call of war|s1914|supremacy 1914|iron order|io|ww3)$/i.test(
    lower,
  );
}

module.exports = {
  addTurn,
  getContextString,
  isConversationContinuation,
  isCorrectionMessage,
  isGameSelectorAnswer,
};
