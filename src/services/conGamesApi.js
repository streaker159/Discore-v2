"use strict";

const logger = require("../lib/logger");

const GAMES_LIST_URL =
  "https://www.conflictnations.com/api/v2/games?openSlots=1&scenarioID=5976";

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Fetch the current Conflict of Nations game list.
 * Returns the parsed JSON body or throws on failure.
 */
async function fetchGames() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(GAMES_LIST_URL, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Discore/2.0 (Discord Bot; game match finder)",
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("API request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  // ── Explicit HTTP error handling ──────────────────────────────────
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `HTTP ${response.status}: authentication failed — stopping search`,
    );
  }

  if (response.status === 429) {
    const retryAfter =
      response.headers.get("Retry-After") ||
      response.headers.get("retry-after");
    const waitSec = retryAfter ? parseInt(retryAfter, 10) : 60;
    throw Object.assign(
      new Error(`HTTP 429: rate-limited (retry after ${waitSec}s)`),
      { retryAfter: waitSec * 1000 },
    );
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  // ── Parse JSON ────────────────────────────────────────────────────
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("Failed to parse API response as JSON");
  }

  // ── Validate structure ────────────────────────────────────────────
  if (body == null || typeof body !== "object") {
    throw new Error("API returned a non-object response");
  }

  if (body.resultCode !== 0) {
    throw new Error(
      `API returned resultCode ${body.resultCode}: ${body.resultMessage || "unknown error"}`,
    );
  }

  if (!body.result || !Array.isArray(body.result.games)) {
    throw new Error("API response missing result.games array");
  }

  return body.result.games;
}

module.exports = { fetchGames, GAMES_LIST_URL };
