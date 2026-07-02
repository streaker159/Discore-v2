"use strict";

/**
 * Parse duration string to seconds
 * Supports: 30m, 2h, 7d, 1w, 5 minutes, 1 hour, etc.
 * @param {string} durationStr
 * @returns {{seconds: number, error: string|null}}
 */
function parseDuration(durationStr, maxSeconds = null) {
  if (!durationStr) {
    return { seconds: null, error: null };
  }

  // Clean up input
  const cleaned = durationStr.toLowerCase().trim();

  // Try short format first: 30m, 2h, 7d, 1w, 1mo
  const shortMatch = cleaned.match(/^(\d+)\s*([mhdw]|mo)$/);
  if (shortMatch) {
    const value = parseInt(shortMatch[1]);
    const unit = shortMatch[2];

    const multipliers = {
      m: 60, // minutes
      h: 3600, // hours
      d: 86400, // days
      w: 604800, // weeks
      mo: 2592000, // months (30 days)
    };

    const seconds = value * multipliers[unit];

    if (maxSeconds && seconds > maxSeconds) {
      const { formatDuration } = require("./durationParser");
      return {
        seconds: null,
        error: `Duration cannot exceed ${formatDuration(maxSeconds)}`,
      };
    }

    return { seconds, error: null };
  }

  // Try natural language format: "5 minutes", "1 hour", "2 days", etc.
  const naturalMatch = cleaned.match(
    /^(\d+)\s*(min|mins|minute|minutes|hr|hrs|hour|hours|day|days|week|weeks|month|months)$/,
  );
  if (naturalMatch) {
    const value = parseInt(naturalMatch[1]);
    const unit = naturalMatch[2];

    let seconds = 0;

    if (["min", "mins", "minute", "minutes"].includes(unit)) {
      seconds = value * 60;
    } else if (["hr", "hrs", "hour", "hours"].includes(unit)) {
      seconds = value * 3600;
    } else if (["day", "days"].includes(unit)) {
      seconds = value * 86400;
    } else if (["week", "weeks"].includes(unit)) {
      seconds = value * 604800;
    } else if (["month", "months"].includes(unit)) {
      seconds = value * 2592000;
    }

    if (maxSeconds && seconds > maxSeconds) {
      const { formatDuration } = require("./durationParser");
      return {
        seconds: null,
        error: `Duration cannot exceed ${formatDuration(maxSeconds)}`,
      };
    }

    return { seconds, error: null };
  }

  return {
    seconds: null,
    error:
      "Invalid duration. Examples: 30m, 2h, 5 minutes, 1 hour, 7 days, 1 month",
  };
}

/**
 * Format seconds to human readable
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  if (!seconds) return "Permanent";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(" ") || "< 1m";
}

module.exports = {
  parseDuration,
  formatDuration,
};
