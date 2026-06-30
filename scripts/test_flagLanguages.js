"use strict";

/**
 * Flag normalization test suite.
 * Run with: node scripts/test_flagLanguages.js
 */

const {
  normalizeFlagInput,
  getLanguageForFlag,
  unicodeFlagToCountryCode,
} = require("../src/modules/ai/flagLanguages");

let passed = 0;
let failed = 0;

function test(description, expected, actual) {
  // Deep compare for objects
  const isObj = typeof expected === "object" && expected !== null;
  const match = isObj
    ? JSON.stringify(expected) === JSON.stringify(actual)
    : expected === actual;

  if (match) {
    passed++;
    console.log(`  ✅ ${description}`);
  } else {
    failed++;
    console.log(`  ❌ ${description}`);
    console.log(`     Expected: ${JSON.stringify(expected)}`);
    console.log(`     Got:      ${JSON.stringify(actual)}`);
  }
}

// ── Unicode flag emoji → country code ─────────────────────────────────
console.log("\n🧪 Unicode flag emoji conversion");
test("🇪🇸 -> ES", "ES", unicodeFlagToCountryCode("🇪🇸"));
test("🇺🇸 -> US", "US", unicodeFlagToCountryCode("🇺🇸"));
test("🇺🇲 -> UM", "UM", unicodeFlagToCountryCode("🇺🇲"));
test("🇬🇧 -> GB", "GB", unicodeFlagToCountryCode("🇬🇧"));
test("🇧🇷 -> BR", "BR", unicodeFlagToCountryCode("🇧🇷"));
test("🇧🇬 -> BG", "BG", unicodeFlagToCountryCode("🇧🇬"));
test("🇫🇷 -> FR", "FR", unicodeFlagToCountryCode("🇫🇷"));
test("🇩🇪 -> DE", "DE", unicodeFlagToCountryCode("🇩🇪"));
test("🇮🇹 -> IT", "IT", unicodeFlagToCountryCode("🇮🇹"));
test("🇵🇹 -> PT", "PT", unicodeFlagToCountryCode("🇵🇹"));
test("🇯🇵 -> JP", "JP", unicodeFlagToCountryCode("🇯🇵"));
test("🇰🇷 -> KR", "KR", unicodeFlagToCountryCode("🇰🇷"));
test("🇨🇳 -> CN", "CN", unicodeFlagToCountryCode("🇨🇳"));
test("🇷🇺 -> RU", "RU", unicodeFlagToCountryCode("🇷🇺"));

// Non-flags
test("🏳️‍🌈 -> null", null, unicodeFlagToCountryCode("🏳️‍🌈"));
test("🏴‍☠️ -> null", null, unicodeFlagToCountryCode("🏴‍☠️"));
test("🏁 -> null", null, unicodeFlagToCountryCode("🏁"));
test("🚩 -> null", null, unicodeFlagToCountryCode("🚩"));
test("A -> null", null, unicodeFlagToCountryCode("A"));
test("ABC -> null", null, unicodeFlagToCountryCode("ABC"));
test("'' -> null", null, unicodeFlagToCountryCode(""));

// ── normalizeFlagInput ────────────────────────────────────────────────
console.log("\n🧪 normalizeFlagInput");
test("🇪🇸 -> es", "es", normalizeFlagInput("🇪🇸"));
test("flag_es -> es", "es", normalizeFlagInput("flag_es"));
test(":flag_es: -> es", "es", normalizeFlagInput(":flag_es:"));
test("FLAG_ES -> es", "es", normalizeFlagInput("FLAG_ES"));
test("es -> es", "es", normalizeFlagInput("es"));
test("ES -> es", "es", normalizeFlagInput("ES"));

test("🇺🇸 -> us", "us", normalizeFlagInput("🇺🇸"));
test("flag_us -> us", "us", normalizeFlagInput("flag_us"));
test(":flag_us: -> us", "us", normalizeFlagInput(":flag_us:"));

test("🇺🇲 -> um", "um", normalizeFlagInput("🇺🇲"));
test("flag_um -> um", "um", normalizeFlagInput("flag_um"));
test(":flag_um: -> um", "um", normalizeFlagInput(":flag_um:"));

test("🇬🇧 -> gb", "gb", normalizeFlagInput("🇬🇧"));
test("flag_gb -> gb", "gb", normalizeFlagInput("flag_gb"));
test(":flag_gb: -> gb", "gb", normalizeFlagInput(":flag_gb:"));

test("🇧🇷 -> br", "br", normalizeFlagInput("🇧🇷"));
test("flag_br -> br", "br", normalizeFlagInput("flag_br"));
test(":flag_br: -> br", "br", normalizeFlagInput(":flag_br:"));

test("🇧🇬 -> bg", "bg", normalizeFlagInput("🇧🇬"));
test("flag_bg -> bg", "bg", normalizeFlagInput("flag_bg"));
test(":flag_bg: -> bg", "bg", normalizeFlagInput(":flag_bg:"));

test("🇫🇷 -> fr", "fr", normalizeFlagInput("🇫🇷"));
test("🇩🇪 -> de", "de", normalizeFlagInput("🇩🇪"));
test("🇯🇵 -> jp", "jp", normalizeFlagInput("🇯🇵"));
test("🇰🇷 -> kr", "kr", normalizeFlagInput("🇰🇷"));
test("🇨🇳 -> cn", "cn", normalizeFlagInput("🇨🇳"));
test("🇷🇺 -> ru", "ru", normalizeFlagInput("🇷🇺"));

// ── Non-flags → null ──────────────────────────────────────────────────
test("🏳️‍🌈 -> null", null, normalizeFlagInput("🏳️‍🌈"));
test("🏴‍☠️ -> null", null, normalizeFlagInput("🏴‍☠️"));
test("🏁 -> null", null, normalizeFlagInput("🏁"));
test("🚩 -> null", null, normalizeFlagInput("🚩"));
test(":white_flag: -> null", null, normalizeFlagInput(":white_flag:"));
test(":checkered_flag: -> null", null, normalizeFlagInput(":checkered_flag:"));
test(
  ":flag_eu: -> null (not in language map)",
  null,
  normalizeFlagInput(":flag_eu:"),
);
test("🇪🇺 -> null (eu not in language map)", null, normalizeFlagInput("🇪🇺"));
test("random -> null", null, normalizeFlagInput("random"));
test("'' -> null", null, normalizeFlagInput(""));
test("null -> null", null, normalizeFlagInput(null));
test("undefined -> null", null, normalizeFlagInput(undefined));

// ── getLanguageForFlag ────────────────────────────────────────────────
console.log("\n🧪 getLanguageForFlag");

test(
  "🇪🇸 returns Spanish",
  {
    code: "es",
    language: "Spanish",
    emoji: "🇪🇸",
    label: "Spanish",
  },
  getLanguageForFlag("🇪🇸"),
);

test(
  "flag_es returns Spanish",
  {
    code: "es",
    language: "Spanish",
    emoji: "🇪🇸",
    label: "Spanish",
  },
  getLanguageForFlag("flag_es"),
);

test(
  ":flag_es: returns Spanish",
  {
    code: "es",
    language: "Spanish",
    emoji: "🇪🇸",
    label: "Spanish",
  },
  getLanguageForFlag(":flag_es:"),
);

test(
  "🇺🇸 returns English",
  {
    code: "us",
    language: "English",
    emoji: "🇺🇸",
    label: "English",
  },
  getLanguageForFlag("🇺🇸"),
);

test(
  "flag_us returns English",
  {
    code: "us",
    language: "English",
    emoji: "🇺🇸",
    label: "English",
  },
  getLanguageForFlag("flag_us"),
);

test(
  "🇺🇲 returns English",
  {
    code: "um",
    language: "English",
    emoji: "🇺🇲",
    label: "English",
  },
  getLanguageForFlag("🇺🇲"),
);

test(
  "flag_um returns English",
  {
    code: "um",
    language: "English",
    emoji: "🇺🇲",
    label: "English",
  },
  getLanguageForFlag("flag_um"),
);

test(
  "🇬🇧 returns English",
  {
    code: "gb",
    language: "English",
    emoji: "🇬🇧",
    label: "English",
  },
  getLanguageForFlag("🇬🇧"),
);

test(
  "flag_gb returns English",
  {
    code: "gb",
    language: "English",
    emoji: "🇬🇧",
    label: "English",
  },
  getLanguageForFlag("flag_gb"),
);

test(
  "🇧🇷 returns Portuguese",
  {
    code: "br",
    language: "Portuguese",
    emoji: "🇧🇷",
    label: "Portuguese",
  },
  getLanguageForFlag("🇧🇷"),
);

test(
  "flag_br returns Portuguese",
  {
    code: "br",
    language: "Portuguese",
    emoji: "🇧🇷",
    label: "Portuguese",
  },
  getLanguageForFlag("flag_br"),
);

test(
  "🇧🇬 returns Bulgarian",
  {
    code: "bg",
    language: "Bulgarian",
    emoji: "🇧🇬",
    label: "Bulgarian",
  },
  getLanguageForFlag("🇧🇬"),
);

test(
  "flag_bg returns Bulgarian",
  {
    code: "bg",
    language: "Bulgarian",
    emoji: "🇧🇬",
    label: "Bulgarian",
  },
  getLanguageForFlag("flag_bg"),
);

test("🏁 returns null", null, getLanguageForFlag("🏁"));
test("pirate flag returns null", null, getLanguageForFlag("🏴‍☠️"));
test("pride flag returns null", null, getLanguageForFlag("🏳️‍🌈"));
test("EU flag returns null", null, getLanguageForFlag("🇪🇺"));

// ── Specific required tests from spec ─────────────────────────────────
console.log("\n🧪 Spec-mandated tests");
test(
  "flag_us and flag_um both map to English",
  getLanguageForFlag("flag_us")?.language === "English" &&
    getLanguageForFlag("flag_um")?.language === "English",
  true,
);

test(
  "flag_gb maps to English",
  getLanguageForFlag("flag_gb")?.language === "English",
  true,
);

test(
  "flag_br maps to Portuguese",
  getLanguageForFlag("flag_br")?.language === "Portuguese",
  true,
);

test(
  "flag_bg maps to Bulgarian",
  getLanguageForFlag("flag_bg")?.language === "Bulgarian",
  true,
);

// ── Summary ───────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(50)}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
  console.log(`\n❌ ${failed} test(s) FAILED!`);
  process.exit(1);
} else {
  console.log("\n✅ All tests passed!");
  process.exit(0);
}
