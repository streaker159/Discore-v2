"use strict";

const logger = require("../lib/logger");

const REQUEST_TIMEOUT_MS = 15_000;

// ── Required environment variables ──────────────────────────────────────────
const REQUIRED_ENV_VARS = [
  "CON_GAMES_HASH",
  "CON_AUTH_TIMESTAMP",
  "CON_AUTH_USER_ID",
  "CON_SESSION_COOKIE",
  "CON_ENCODED_PAYLOAD_FIELD",
];

/**
 * Validate required environment variables and return a list of missing ones.
 */
function getMissingEnvVars() {
  return REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
}

/**
 * Build the Base64-encoded search payload for World War 3 4×.
 */
function buildEncodedPayload() {
  const decodedPayload = [
    "global=1",
    "withoutMyGames=1",
    "numEntriesPerPage=9",
    "page=1",
    "loadUserLoginData=1",
    "lang=en",
    "isFilterSearch=true",
    "openSlots=1",
    "search=world war 3 (4X Speed)",
    `authTstamp=${process.env.CON_AUTH_TIMESTAMP}`,
    `authUserID=${process.env.CON_AUTH_USER_ID}`,
    "source=browser-desktop",
  ].join("&");

  return Buffer.from(decodedPayload, "utf8").toString("base64");
}

/**
 * Build the full request URL.
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
 * Fetch the current Conflict of Nations game list using the authenticated
 * POST endpoint. Returns the parsed games array from result.games.
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

  const body = new URLSearchParams({
    ingameConaction: "getGames",
    eID: "api",
    key: "ingameCon",
    hash: process.env.CON_GAMES_HASH,
    outputFormat: "json",
    apiVersion: "20141208",
    L: "0",
    source: "browser-desktop",
  });

  body.set(process.env.CON_ENCODED_PAYLOAD_FIELD, encodedPayload);

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
      body: body.toString(),
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
