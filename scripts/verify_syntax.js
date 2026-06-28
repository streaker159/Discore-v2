const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..");
const mods = [
  "src/modules/gameData/wikiSources.js",
  "src/modules/gameData/mediaWikiClient.js",
  "src/modules/gameData/unitImportParser.js",
  "src/modules/gameData/unitRepository.js",
  "src/modules/gameData/unitLookupService.js",
  "src/modules/gameData/unitImportService.js",
  "src/commands/admin/game-admin/unitdata.js",
  "src/commands/public/unit/unit.js",
];
let pass = 0, fail = 0;
for (const m of mods) {
  try {
    new Function(fs.readFileSync(path.join(root, m), "utf8"));
    pass++;
  } catch (e) { fail++; console.log(m + ": " + e.message); }
}
console.log("Pass: " + pass + ", Fail: " + fail);
