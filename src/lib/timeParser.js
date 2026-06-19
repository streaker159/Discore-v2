"use strict";

const chrono = require("chrono-node");
const { DateTime } = require("luxon");

// ── Timezone aliases ─────────────────────────────────────────────────────────
const CITY_TIMEZONES = {
  paris: "Europe/Paris",
  france: "Europe/Paris",
  toulouse: "Europe/Paris",
  london: "Europe/London",
  uk: "Europe/London",
  bst: "Europe/London",
  utc: "UTC",
  gmt: "UTC",
  est: "America/New_York",
  edt: "America/New_York",
  cst: "America/Chicago",
  mst: "America/Denver",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  sydney: "Australia/Sydney",
  melbourne: "Australia/Melbourne",
  perth: "Australia/Perth",
  brisbane: "Australia/Brisbane",
  australia: "Australia/Sydney",
  newyork: "America/New_York",
  "new york": "America/New_York",
  losangeles: "America/Los_Angeles",
  "los angeles": "America/Los_Angeles",
  berlin: "Europe/Berlin",
  germany: "Europe/Berlin",
  cet: "Europe/Paris",
  moscow: "Europe/Moscow",
  dubai: "Asia/Dubai",
  singapore: "Asia/Singapore",
  tokyo: "Asia/Tokyo",
  beijing: "Asia/Shanghai",
};

/**
 * Detect explicit timezone from text.
 * Returns an IANA zone string or null if none detected.
 */
function detectTimezone(text, fallback = null) {
  const lower = String(text || "").toLowerCase();
  for (const [key, zone] of Object.entries(CITY_TIMEZONES)) {
    if (lower.includes(key)) return zone;
  }
  // UTC+offset syntax: UTC+5, GMT-3, UTC+5:30
  const match = lower.match(/\b(?:utc|gmt)\s*([+-]\d{1,2})(?::?(\d{2}))?\b/);
  if (match) {
    const sign = match[1].startsWith("-") ? "-" : "+";
    const hours = Math.abs(parseInt(match[1], 10)).toString().padStart(2, "0");
    const mins = match[2] || "00";
    return `UTC${sign}${hours}:${mins}`;
  }
  return fallback;
}

/**
 * Returns true if the input describes a relative duration from now.
 * Examples: "in 3 hours", "30m", "3hrs", "in 30 minutes", "2 days"
 * These must NOT be repositioned into a timezone — they're always "now + X".
 */
function isRelativeDuration(input) {
  const s = String(input || "")
    .trim()
    .toLowerCase();
  return /^(?:in\s+)?\d+\s*(?:minutes?|mins?|m(?!\w)|hours?|hrs?|h(?!\w)|days?|d(?!\w)|weeks?|w(?!\w))/.test(
    s,
  );
}

/**
 * Returns true if the time is ambiguous (bare hour number without am/pm or 24h format).
 * Examples: "Monday at 3", "at 5 today" — could be 3am or 3pm.
 */
function isAmbiguousTime(input) {
  const s = String(input || "")
    .replace(/\b(?:utc|gmt|[a-z]+ time)\b/gi, "")
    .trim();
  if (/\b(am|pm)\b/i.test(s)) return false; // has am/pm → unambiguous
  if (/\b[01][0-9][0-5][0-9]\b/.test(s)) return false; // 1800-style
  if (/\b([01]?\d|2[0-3]):[0-5]\d\b/.test(s)) return false; // 14:00-style
  // Bare single/double digit after "at" without am/pm
  if (/\bat\s+\d{1,2}\b(?!\s*[:h\d])/.test(s)) return true;
  return false;
}

/** Convert European numeric dates (24/7/26) to chrono-friendly format (24-7-2026). */
function normalizeEuropeanDates(input) {
  return String(input || "").replace(
    /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g,
    (_, d, m, y) => {
      const year = y.length === 2 ? `20${y}` : y;
      return `${d}-${m}-${year}`;
    },
  );
}

/**
 * Parse a human-readable date/time string into a UTC Date.
 *
 * @param {string} input  - raw user input
 * @param {object} opts
 *   opts.timezone       - IANA zone to use for absolute times (falls back to UTC)
 *   opts.referenceDate  - override "now" (for testing)
 *
 * @returns {{
 *   ok: boolean,
 *   date?: Date,          UTC Date
 *   unix?: number,        seconds
 *   timezone?: string,    zone that was used
 *   inputType?: string,   "RELATIVE" | "ABSOLUTE"
 *   discord?: object,     <t:unix:*> strings
 *   ambiguous?: boolean,
 *   reason?: string,      human-readable error
 * }}
 */
function parseDateTime(input, opts = {}) {
  const rawInput = String(input || "").trim();
  if (!rawInput) {
    return { ok: false, reason: "No time provided." };
  }

  const referenceDate = opts.referenceDate || new Date();

  // ── Ambiguity check ──────────────────────────────────────────────────────
  if (isAmbiguousTime(rawInput)) {
    return {
      ok: false,
      ambiguous: true,
      reason:
        "Time is ambiguous — did you mean AM or PM? " +
        "Try: `Monday at 3pm`, `1800 UTC`, or `15:00 Paris time`.",
    };
  }

  // ── Detect timezone from text ────────────────────────────────────────────
  const detectedTz = detectTimezone(rawInput, opts.timezone || "UTC");
  const isRelative = isRelativeDuration(rawInput);
  const inputType = isRelative ? "RELATIVE" : "ABSOLUTE";

  // ── Normalize numeric date separators ────────────────────────────────────
  const cleaned = normalizeEuropeanDates(rawInput);

  // ── Parse with chrono-node ────────────────────────────────────────────────
  const results = chrono.parse(cleaned, referenceDate, { forwardDate: true });
  if (!results.length) {
    return {
      ok: false,
      reason:
        "⚠️ I could not confidently understand that time. " +
        "Please include a date, time, and timezone. Examples: " +
        "`in 3 hours`, `24/7/26 3pm Paris time`, or `1800 UTC`.",
    };
  }

  const parsedDate = results[0].start.date(); // JS Date (always in system UTC)

  let utcDate;

  if (isRelative) {
    // ── Relative time: chrono already computed now+X correctly. ──────────
    // Do NOT reposition into a timezone — the offset is already correct.
    utcDate = DateTime.fromJSDate(parsedDate).toUTC();
  } else {
    // ── Absolute time: re-interpret the parsed wall-clock time in the ─────
    // target timezone so "3pm Paris" really means 3pm in Paris.
    const naive = DateTime.fromJSDate(parsedDate);
    const zoned = DateTime.fromObject(
      {
        year: naive.year,
        month: naive.month,
        day: naive.day,
        hour: naive.hour,
        minute: naive.minute,
        second: 0,
      },
      { zone: detectedTz },
    );
    if (!zoned.isValid) {
      return { ok: false, reason: `Invalid timezone: ${detectedTz}` };
    }
    utcDate = zoned.toUTC();
  }

  // ── Sanity checks ────────────────────────────────────────────────────────
  const unix = Math.floor(utcDate.toSeconds());
  if (unix < Math.floor(referenceDate.getTime() / 1000) - 60) {
    return {
      ok: false,
      reason:
        "⚠️ That event time appears to be in the past. Please choose a future time.",
    };
  }

  return {
    ok: true,
    date: utcDate.toJSDate(),
    unix,
    timezone: detectedTz,
    inputType,
    discord: {
      date: `<t:${unix}:D>`,
      time: `<t:${unix}:t>`,
      full: `<t:${unix}:F>`,
      relative: `<t:${unix}:R>`,
    },
  };
}

module.exports = {
  parseDateTime,
  detectTimezone,
  isAmbiguousTime,
  isRelativeDuration,
};
