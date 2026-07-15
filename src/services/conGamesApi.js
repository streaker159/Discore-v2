"use strict";

const logger = require("../lib/logger");

const REQUEST_TIMEOUT_MS = 15_000;

// ── Required environment variables ──────────────────────────────────────────
const REQUIRED_ENV_VARS = [
  "CON_GAMES_HASH",
  "CON_AUTH_TIMESTAMP",
  "CON_AUTH_USER_ID",
  "CON_SESSION_COOKIE",
];

/**
 * Validate required environment variables and return a list of missing ones.
 */
function getMissingEnvVars() {
  return REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
}

/**
 * Build the decoded (plaintext) search payload matching the captured
 * browser request exactly.  Spaces are encoded as %20, not +.
 */
function buildDecodedPayload() {
  const values = [
    ["global", "1"],
    ["withoutMyGames", "1"],
    ["numEntriesPerPage", "9"],
    ["page", "1"],
    ["loadUserLoginData", "1"],
    ["lang", "en"],
    ["isFilterSearch", "true"],
    ["openSlots", "1"],
    ["search", "world war 3 (4X Speed)"],
    ["authTstamp", process.env.CON_AUTH_TIMESTAMP],
    ["authUserID", process.env.CON_AUTH_USER_ID],
    ["source", "browser-desktop"],
  ];

  return values
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
}

/**
 * Build the Base64-encoded payload sent as the raw POST body.
 */
function buildEncodedPayload() {
  return Buffer.from(buildDecodedPayload(), "utf8").toString("base64");
}

/**
 * Build the full request URL with query-string parameters.
 */
function buildEndpoint() {
  const url = new URL("https://www.conflictnations.com/index.php");

  url.search = new URLSearchParams({
    action: "getGames",
    eID: "api",
    key: "ingameCon",
    hash: process.env.CON_GAMES_HASH,
    outputFormat: "json",
    apiVersion: "20141208",
    L: "0",
    source: "browser-desktop",
  }).toString();

  return url;
}

/**
 * Fetch the current Conflict of Nations game list.
 *
 * Sends a POST to the authenticated game-browser endpoint with the
 * Base64-encoded search payload as the raw body.
 *
 * Returns the parsed games array from response.result.games.
 */
async function fetchGames() {
  // ── Validate configuration ───────────────────────────────────────
  const missing = getMissingEnvVars();
  if (missing.length > 0) {
    const msg = `Conflict of Nations game finder is not configured. Missing ${missing.join(", ")}.`;
    throw new Error(msg);
  }

  // ── Build request components ─────────────────────────────────────
  const endpoint = buildEndpoint();
  const encodedPayload = buildEncodedPayload();

  // ── Abort controller for timeout ─────────────────────────────────
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "*/*",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        origin: "https://www.conflictnations.com",
        referer: "https://www.conflictnations.com/",
        "x-requested-with": "XMLHttpRequest",
        cookie: process.env.CON_SESSION_COOKIE,
      },
      body: encodedPayload,
      signal: controller.signal,
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

  // ── Log only safe metadata ──────────────────────────────────────
  logger.debug("Game finder: API response received", {
    status: response.status,
    ok: response.ok,
  });

  // ── Explicit HTTP error handling ─────────────────────────────────
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

  // ── Parse JSON ───────────────────────────────────────────────────
  let bodyData;
  try {
    bodyData = await response.json();
  } catch {
    throw new Error("Failed to parse API response as JSON");
  }

  // ── Validate structure ───────────────────────────────────────────
  if (bodyData == null || typeof bodyData !== "object") {
    throw new Error("API returned a non-object response");
  }

  logger.debug("Game finder: API result code", {
    resultCode: bodyData.resultCode,
  });

  if (bodyData.resultCode !== 0) {
    throw new Error(
      `API returned resultCode ${bodyData.resultCode}: ${bodyData.resultMessage || "unknown error"}`,
    );
  }

  if (!bodyData.result || !Array.isArray(bodyData.result.games)) {
    throw new Error("API response missing result.games array");
  }

  return bodyData.result.games;
}

module.exports = { fetchGames, getMissingEnvVars };
