const chrono = require('chrono-node');
const { DateTime } = require('luxon');

const CITY_TIMEZONES = {
  paris: 'Europe/Paris',
  france: 'Europe/Paris',
  toulouse: 'Europe/Paris',
  london: 'Europe/London',
  uk: 'Europe/London',
  utc: 'UTC',
  gmt: 'UTC',
  sydney: 'Australia/Sydney',
  melbourne: 'Australia/Melbourne',
  perth: 'Australia/Perth',
  brisbane: 'Australia/Brisbane',
  newyork: 'America/New_York',
  'new york': 'America/New_York',
  losangeles: 'America/Los_Angeles',
  'los angeles': 'America/Los_Angeles',
};

function detectTimezone(text, fallback = 'UTC') {
  const lower = String(text || '').toLowerCase();
  for (const [key, zone] of Object.entries(CITY_TIMEZONES)) {
    if (lower.includes(key)) return zone;
  }
  const explicitUtc = lower.match(/\b(?:utc|gmt)\s*([+-]\d{1,2})(?::?(\d{2}))?\b/);
  if (explicitUtc) {
    const hours = explicitUtc[1].padStart(3, explicitUtc[1].startsWith('-') ? '-' : '+0');
    const mins = explicitUtc[2] || '00';
    return `UTC${hours}:${mins}`;
  }
  return fallback;
}

function normalizeEuropeanNumericDates(input) {
  // Helps chrono with dates like 24/7/26 at 3pm.
  return String(input || '').replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g, '$1-$2-$3');
}

function parseDateTime(input, options = {}) {
  const fallbackTimezone = options.timezone || 'UTC';
  const timezone = options.explicitTimezone || detectTimezone(input, fallbackTimezone);
  const cleaned = normalizeEuropeanNumericDates(input);
  const referenceDate = options.referenceDate || new Date();
  const results = chrono.parse(cleaned, referenceDate, { forwardDate: true });

  if (!results.length) {
    return { ok: false, reason: 'I could not understand that date/time. Try `24/7/26 at 3pm` or `1800 UTC`.' };
  }

  const first = results[0];
  let naive = DateTime.fromJSDate(first.start.date());

  // Rebuild the parsed date in the requested zone so "3pm Paris" means 3pm in Paris.
  const zoned = DateTime.fromObject({
    year: naive.year,
    month: naive.month,
    day: naive.day,
    hour: naive.hour,
    minute: naive.minute,
    second: 0,
  }, { zone: timezone });

  if (!zoned.isValid) {
    return { ok: false, reason: `Invalid timezone: ${timezone}` };
  }

  const utc = zoned.toUTC();
  const unix = Math.floor(utc.toSeconds());

  return {
    ok: true,
    timezone,
    date: utc.toJSDate(),
    iso: utc.toISO(),
    unix,
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
};
