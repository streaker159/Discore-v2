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
  return REQUIRED_ENV_VARS.filter((key) => !(process.env[key] || "").trim());
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
 * Build the Base64-encoded payload.
 */
function buildEncodedPayload() {
  return Buffer.from(buildDecodedPayload(), "utf8").toString("base64");
}

/**
 * Build the full request URL with only query-string parameters.
 * The POST body ONLY contains the named Base64 field.
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
 * Build the POST body containing only the named Base64 field.
 * The field name is read from CON_ENCODED_PAYLOAD_FIELD (default "data").
 * @param {string} fieldName — the form field name to use
 * @param {string} encodedPayload — Base64-encoded search payload
 */
function buildRequestBody(fieldName, encodedPayload) {
  const body = new URLSearchParams();
  body.set(fieldName, encodedPayload);
  return body.toString();
}

/**
 * Perform a single API request with the given field name.
 * Returns { ok, fieldName, resultCode, resultMessage, actionResult, games }.
 */
async function attemptFetch(fieldName) {
  const endpoint = buildEndpoint();
  const encodedPayload = buildEncodedPayload();
  const body = buildRequestBody(fieldName, encodedPayload);

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
      body,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      return { ok: false, fieldName, error: "API request timed out" };
    }
    return { ok: false, fieldName, error: err.message };
  } finally {
    clearTimeout(timeout);
  }

  // ── HTTP error handling ──────────────────────────────────────────
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      fieldName,
      error: `HTTP ${response.status}: authentication failed`,
      fatal: true,
    };
  }

  if (response.status === 429) {
    const retryAfter =
      response.headers.get("Retry-After") ||
      response.headers.get("retry-after");
    const waitSec = retryAfter ? parseInt(retryAfter, 10) : 60;
    return {
      ok: false,
      fieldName,
      error: `HTTP 429: rate-limited (retry after ${waitSec}s)`,
      retryAfter: waitSec * 1000,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      fieldName,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  }

  // ── Parse JSON ───────────────────────────────────────────────────
  let bodyData;
  try {
    bodyData = await response.json();
  } catch {
    return {
      ok: false,
      fieldName,
      error: "Failed to parse API response as JSON",
    };
  }

  if (bodyData == null || typeof bodyData !== "object") {
    return {
      ok: false,
      fieldName,
      error: "API returned a non-object response",
    };
  }

  // ── Log safe diagnostics ─────────────────────────────────────────
  logger.debug("Game finder: API response", {
    fieldName,
    httpStatus: response.status,
    resultCode: bodyData.resultCode,
    resultMessage: bodyData.resultMessage,
  });

  if (Number(bodyData.resultCode) !== 0) {
    return {
      ok: false,
      fieldName,
      resultCode: bodyData.resultCode,
      resultMessage: bodyData.resultMessage,
      actionResult: bodyData.result,
      error:
        `API returned resultCode ${bodyData.resultCode}: ${bodyData.resultMessage}` +
        (bodyData.result
          ? ` Action result: ${JSON.stringify(bodyData.result)}`
          : ""),
    };
  }

  if (!bodyData.result || !Array.isArray(bodyData.result.games)) {
    return {
      ok: false,
      fieldName,
      error: "API response missing result.games array",
    };
  }

  return {
    ok: true,
    fieldName,
    games: bodyData.result.games,
  };
}

// ── Diagnostic: try candidate field names once each ─────────────────────────

const CANDIDATE_FIELDS = ["data", "params", "request", "payload"];

/**
 * Run a diagnostic to determine which form field name the API expects.
 * Each candidate is tried once with a 5s gap.
 * Returns the first successful field name, or throws.
 */
async function diagnoseFieldName() {
  logger.info("Game finder: running field-name diagnostic", {
    candidates: CANDIDATE_FIELDS,
  });

  for (const fieldName of CANDIDATE_FIELDS) {
    logger.debug("Game finder: diagnostic attempt", { fieldName });

    const result = await attemptFetch(fieldName);

    if (result.ok) {
      logger.info("Game finder: diagnostic succeeded", { fieldName });
      return { fieldName, games: result.games };
    }

    if (result.fatal) {
      logger.error("Game finder: diagnostic fatal error", {
        fieldName,
        error: result.error,
      });
      throw new Error(result.error);
    }

    logger.warn("Game finder: diagnostic candidate failed", {
      fieldName,
      resultCode: result.resultCode,
      resultMessage: result.resultMessage,
    });

    // 5-second gap between candidates
    if (fieldName !== CANDIDATE_FIELDS[CANDIDATE_FIELDS.length - 1]) {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  throw new Error(
    "Game finder: all candidate field names failed. " +
      "Check CON_ENCODED_PAYLOAD_FIELD value and captured browser payload.",
  );
}

/**
 * Fetch the current Conflict of Nations game list.
 *
 * On first call (or after the diagnosed field is not yet cached), runs a
 * one-shot diagnostic across candidate form field names to find the
 * correct one.  Once found, that field name is used for all subsequent calls.
 *
 * Returns the parsed games array from response.result.games.
 */
let confirmedFieldName = null;

async function fetchGames() {
  // ── Validate configuration ───────────────────────────────────────
  const missing = getMissingEnvVars();
  if (missing.length > 0) {
    const msg = `Conflict of Nations game finder is not configured. Missing ${missing.join(", ")}.`;
    throw new Error(msg);
  }

  // ── If we already know the correct field name, use it directly ───
  if (confirmedFieldName) {
    const result = await attemptFetch(confirmedFieldName);

    if (result.ok) {
      return result.games;
    }

    // If the confirmed field suddenly fails, treat as an error
    if (result.fatal) {
      throw new Error(result.error);
    }

    throw new Error(result.error || "API request failed");
  }

  // ── First call: run diagnostic ──────────────────────────────────
  const diagnostic = await diagnoseFieldName();
  confirmedFieldName = diagnostic.fieldName;

  // Persist the confirmed field name so restarting the poller doesn't re-diagnose
  // (we store it in process.env for this process lifetime)
  process.env.CON_ENCODED_PAYLOAD_FIELD = confirmedFieldName;

  return diagnostic.games;
}

module.exports = { fetchGames, getMissingEnvVars };
