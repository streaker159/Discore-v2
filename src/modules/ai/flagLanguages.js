"use strict";

// ── Debug logging ──────────────────────────────────────────────────────
const DEBUG = process.env.DEBUG_SCOREBOARDS === "true";
function debugLog(...args) {
  if (DEBUG) console.log("[FlagLanguages]", ...args);
}

// ── Unicode flag emoji → ISO 3166-1 alpha-2 country code ────────────────
// Uses the Regional Indicator codepoint range (U+1F1E6 through U+1F1FF)
// Each letter A-Z maps to U+1F1E6 + (letterIndex).
// See: https://en.wikipedia.org/wiki/Regional_indicator_symbol

const REGIONAL_INDICATOR_A = 0x1f1e6; // 🇦

/**
 * Convert a 2-character unicode regional flag emoji to its ISO 3166-1 alpha-2
 * country code. Returns null if the input is not a valid flag emoji.
 *
 * Example: "🇪🇸" → "ES"
 */
function unicodeFlagToCountryCode(flag) {
  const chars = Array.from(flag);
  if (chars.length !== 2) return null;

  const codePoints = chars.map((char) => char.codePointAt(0));

  // Both codepoints must be in the Regional Indicator range (A–Z)
  if (
    codePoints.every(
      (cp) => cp >= REGIONAL_INDICATOR_A && cp <= REGIONAL_INDICATOR_A + 25,
    )
  ) {
    return String.fromCodePoint(
      ...codePoints.map((cp) => 65 + cp - REGIONAL_INDICATOR_A),
    );
  }

  return null;
}

/**
 * Build a unicode flag emoji from a 2-letter ISO country code.
 * Example: "ES" → "🇪🇸"
 */
function countryCodeToUnicodeFlag(code) {
  const upper = String(code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return null;
  return String.fromCodePoint(
    ...upper
      .split("")
      .map((char) => REGIONAL_INDICATOR_A + char.charCodeAt(0) - 65),
  );
}

// ── Language mapping ────────────────────────────────────────────────────
// Maps ISO 3166-1 alpha-2 country codes to their primary/preferred language.
// Where a country has multiple official languages, we default to the most
// commonly used or the one most relevant for translation purposes.

const FLAG_TO_LANGUAGE = {
  // ── English ────────────────────────────────────────────────────────
  us: "English",
  um: "English", // U.S. Minor Outlying Islands (Discord flag_um)
  gb: "English", // United Kingdom (Discord uses flag_gb, not flag_uk)
  au: "English",
  ca: "English", // Default English for Canada (French also official)
  nz: "English",
  ie: "English",
  jm: "English",
  tt: "English",
  bs: "English",
  bb: "English",
  bz: "English",
  gy: "English",
  za: "English",
  mt: "English",
  gi: "English",
  bm: "English",

  // ── French ──────────────────────────────────────────────────────────
  fr: "French",
  mf: "French", // Saint Martin
  bl: "French", // Saint Barthélemy
  mc: "French", // Monaco
  lu: "French",
  ci: "French",
  sn: "French",
  cm: "French",
  ne: "French",
  bf: "French",
  ml: "French",
  gn: "French",
  td: "French",
  rw: "French",
  bi: "French",
  bj: "French",
  tg: "French",
  ga: "French",
  cg: "French",
  cd: "French",
  cf: "French",
  dj: "French",
  mg: "French",
  vu: "French",
  ht: "French",

  // ── Spanish ─────────────────────────────────────────────────────────
  es: "Spanish",
  mx: "Spanish",
  ar: "Spanish",
  cl: "Spanish",
  co: "Spanish",
  pe: "Spanish",
  ve: "Spanish",
  uy: "Spanish",
  py: "Spanish",
  bo: "Spanish",
  ec: "Spanish",
  cr: "Spanish",
  cu: "Spanish",
  do: "Spanish",
  gt: "Spanish",
  hn: "Spanish",
  ni: "Spanish",
  pa: "Spanish",
  sv: "Spanish",
  pr: "Spanish",
  gq: "Spanish", // Equatorial Guinea

  // ── Portuguese ──────────────────────────────────────────────────────
  pt: "Portuguese",
  br: "Portuguese",
  ao: "Portuguese",
  mz: "Portuguese",
  cv: "Portuguese",
  gw: "Portuguese",
  tl: "Portuguese",
  st: "Portuguese",

  // ── German ──────────────────────────────────────────────────────────
  de: "German",
  at: "German",
  li: "German",

  // ── Italian ─────────────────────────────────────────────────────────
  it: "Italian",
  sm: "Italian", // San Marino
  va: "Italian", // Vatican City

  // ── Dutch ───────────────────────────────────────────────────────────
  nl: "Dutch",
  sr: "Dutch",

  // ── Polish ──────────────────────────────────────────────────────────
  pl: "Polish",

  // ── Ukrainian ───────────────────────────────────────────────────────
  ua: "Ukrainian",

  // ── Russian ─────────────────────────────────────────────────────────
  ru: "Russian",

  // ── Belarusian (separate from Russian) ──────────────────────────────
  by: "Belarusian",

  // ── Turkish ─────────────────────────────────────────────────────────
  tr: "Turkish",

  // ── Arabic ──────────────────────────────────────────────────────────
  sa: "Arabic",
  ae: "Arabic",
  qa: "Arabic",
  kw: "Arabic",
  bh: "Arabic",
  om: "Arabic",
  ye: "Arabic",
  jo: "Arabic",
  lb: "Arabic",
  sy: "Arabic",
  iq: "Arabic",
  eg: "Arabic",
  dz: "Arabic",
  ma: "Arabic",
  tn: "Arabic",
  ly: "Arabic",
  sd: "Arabic",
  ps: "Arabic",
  mr: "Arabic",

  // ── Hebrew ──────────────────────────────────────────────────────────
  il: "Hebrew",

  // ── Persian / Farsi ─────────────────────────────────────────────────
  ir: "Persian",

  // ── Urdu ────────────────────────────────────────────────────────────
  pk: "Urdu",

  // ── Bengali ─────────────────────────────────────────────────────────
  bd: "Bengali",

  // ── Japanese ────────────────────────────────────────────────────────
  jp: "Japanese",

  // ── Korean ──────────────────────────────────────────────────────────
  kr: "Korean",

  // ── Chinese ─────────────────────────────────────────────────────────
  cn: "Chinese",
  tw: "Chinese",
  hk: "Chinese",
  mo: "Chinese",

  // ── Hindi ───────────────────────────────────────────────────────────
  in: "Hindi",

  // ── Indonesian ──────────────────────────────────────────────────────
  id: "Indonesian",

  // ── Filipino / Tagalog ──────────────────────────────────────────────
  ph: "Filipino/Tagalog",

  // ── Thai ────────────────────────────────────────────────────────────
  th: "Thai",

  // ── Vietnamese ──────────────────────────────────────────────────────
  vn: "Vietnamese",

  // ── Greek ───────────────────────────────────────────────────────────
  gr: "Greek",

  // ── Swedish ─────────────────────────────────────────────────────────
  se: "Swedish",

  // ── Norwegian ───────────────────────────────────────────────────────
  no: "Norwegian",

  // ── Danish ──────────────────────────────────────────────────────────
  dk: "Danish",

  // ── Finnish ─────────────────────────────────────────────────────────
  fi: "Finnish",

  // ── Czech ───────────────────────────────────────────────────────────
  cz: "Czech",

  // ── Slovak ──────────────────────────────────────────────────────────
  sk: "Slovak",

  // ── Hungarian ───────────────────────────────────────────────────────
  hu: "Hungarian",

  // ── Romanian ────────────────────────────────────────────────────────
  ro: "Romanian",
  md: "Romanian",

  // ── Bulgarian ───────────────────────────────────────────────────────
  bg: "Bulgarian",

  // ── Serbian ─────────────────────────────────────────────────────────
  rs: "Serbian",

  // ── Croatian ────────────────────────────────────────────────────────
  hr: "Croatian",

  // ── Slovenian ───────────────────────────────────────────────────────
  si: "Slovenian",

  // ── Albanian ────────────────────────────────────────────────────────
  al: "Albanian",

  // ── Lithuanian ──────────────────────────────────────────────────────
  lt: "Lithuanian",

  // ── Latvian ─────────────────────────────────────────────────────────
  lv: "Latvian",

  // ── Estonian ────────────────────────────────────────────────────────
  ee: "Estonian",

  // ── Malay ───────────────────────────────────────────────────────────
  my: "Malay",

  // ── Kazakh (Cyrillic, closer to Russian in common usage) ─────────────
  kz: "Kazakh",

  // ── Armenian ────────────────────────────────────────────────────────
  am: "Armenian",

  // ── Georgian ────────────────────────────────────────────────────────
  ge: "Georgian",

  // ── Azerbaijani ─────────────────────────────────────────────────────
  az: "Azerbaijani",

  // ── Mongolian ───────────────────────────────────────────────────────
  mn: "Mongolian",

  // ── Nepali ──────────────────────────────────────────────────────────
  np: "Nepali",

  // ── Sinhala ─────────────────────────────────────────────────────────
  lk: "Sinhala",

  // ── Burmese ─────────────────────────────────────────────────────────
  mm: "Burmese",

  // ── Khmer ───────────────────────────────────────────────────────────
  kh: "Khmer",

  // ── Lao ─────────────────────────────────────────────────────────────
  la: "Lao",

  // ── Tamil ───────────────────────────────────────────────────────────
  // in → Hindi already; we keep Tamil separate with the special code
  // Tamil users may use the Singapore flag, but sg is mapped to English.

  // ── Catalan ─────────────────────────────────────────────────────────
  // ad (Andorra) → Catalan
  ad: "Catalan",

  // ── Icelandic ───────────────────────────────────────────────────────
  is: "Icelandic",

  // ── Luxembourgish ───────────────────────────────────────────────────
  // lu → French is default above; many Luxembourgish speakers also use German/French

  // ── Bosnian ─────────────────────────────────────────────────────────
  ba: "Bosnian",

  // ── Macedonian ──────────────────────────────────────────────────────
  mk: "Macedonian",

  // ── Afrikaans ───────────────────────────────────────────────────────
  // za → English above is correct; Afrikaans speakers commonly use English too

  // ── Swahili ─────────────────────────────────────────────────────────
  ke: "Swahili",
  tz: "Swahili",
  ug: "Swahili",

  // ── Amharic ─────────────────────────────────────────────────────────
  et: "Amharic",

  // ── Somali ──────────────────────────────────────────────────────────
  so: "Somali",

  // ── Hausa ───────────────────────────────────────────────────────────
  ng: "Hausa",
  gh: "Hausa",

  // ── Igbo ────────────────────────────────────────────────────────────
  // ng → already mapped to Hausa (most spoken in Nigeria); Igbo is secondary

  // ── Yoruba ──────────────────────────────────────────────────────────
  // ng → Hausa mapped above; Yoruba secondary

  // ── Zulu ────────────────────────────────────────────────────────────
  // za → English mapped above

  // ── Welsh ───────────────────────────────────────────────────────────
  // gb-wls → Welsh, but Discord flags are country-based, no subdivision flags
};

// ── Deliberately IGNORED flags ──────────────────────────────────────────
// These are valid ISO codes but represent entities that are NOT languages:
// * eu: European Union (flag_eu / 🇪🇺) — supra-national organization
// Global/wave flags (🏳️, 🏴, 🏁, 🚩, etc.) are not ISO codes and won't pass
// unicodeFlagToCountryCode or flag_ prefix parsing.

// ── Build emoji lookup cache ────────────────────────────────────────────
const CODE_TO_EMOJI = {};
for (const code of Object.keys(FLAG_TO_LANGUAGE)) {
  CODE_TO_EMOJI[code] = countryCodeToUnicodeFlag(code);
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Normalize any flag input to its ISO 3166-1 alpha-2 country code.
 *
 * Handles:
 *   - Unicode flag emoji: "🇪🇸" → "es"
 *   - Discord emoji name: "flag_es" → "es"
 *   - Shortcode format: ":flag_es:" → "es"
 *   - Uppercase variants: "FLAG_ES" → "es"
 *   - Direct 2-letter code: "es" → "es"
 *
 * Returns lowercase 2-letter code, or null if not a valid supported flag.
 */
function normalizeFlagInput(input) {
  if (!input) return null;

  const raw = String(input).trim();
  if (!raw) return null;

  // ── 1. Unicode flag emoji ─────────────────────────────────────────
  const codeFromEmoji = unicodeFlagToCountryCode(raw);
  if (codeFromEmoji) {
    const lower = codeFromEmoji.toLowerCase();
    if (FLAG_TO_LANGUAGE[lower]) {
      debugLog("matched via unicode emoji", { raw, code: lower });
      return lower;
    }
    // Valid ISO code but not in our language map — log and ignore
    debugLog("valid unicode flag but no language mapping", {
      raw,
      code: lower,
    });
    return null;
  }

  // ── 2. Shortcode format :flag_xx: or :flag_xx ────────────────────
  const cleaned = raw.replace(/^:/, "").replace(/:$/, "").toLowerCase();

  // ── 3. flag_xx format ────────────────────────────────────────────
  if (/^flag_[a-z]{2}$/.test(cleaned)) {
    const code = cleaned.slice(5);
    if (FLAG_TO_LANGUAGE[code]) {
      debugLog("matched via flag_ format", { raw, code });
      return code;
    }
    debugLog("flag_ format recognized but code not mapped to language", {
      raw,
      code,
    });
    return null;
  }

  // ── 4. Direct 2-letter country code ───────────────────────────────
  if (/^[a-z]{2}$/.test(cleaned)) {
    if (FLAG_TO_LANGUAGE[cleaned]) {
      debugLog("matched via direct code", { raw, code: cleaned });
      return cleaned;
    }
    debugLog("valid 2-letter code but no language mapping", {
      raw,
      code: cleaned,
    });
    return null;
  }

  debugLog("flag not recognized", { raw, cleaned });
  return null;
}

/**
 * Get language info for a flag input.
 *
 * Returns:
 *   { code: "es", language: "Spanish", emoji: "🇪🇸", label: "Spanish" }
 *   or null if not supported.
 */
function getLanguageForFlag(input) {
  const code = normalizeFlagInput(input);
  if (!code) return null;

  const language = FLAG_TO_LANGUAGE[code];
  if (!language) {
    debugLog("supported flag code not mapped to language", { code, input });
    return null;
  }

  const emoji = CODE_TO_EMOJI[code] || countryCodeToUnicodeFlag(code) || "";

  return {
    code,
    language,
    emoji,
    label: language,
  };
}

/**
 * The full mapping of country codes to their primary language.
 */
const SUPPORTED_FLAG_LANGUAGES = FLAG_TO_LANGUAGE;

module.exports = {
  normalizeFlagInput,
  getLanguageForFlag,
  unicodeFlagToCountryCode,
  countryCodeToUnicodeFlag,
  SUPPORTED_FLAG_LANGUAGES,
};
