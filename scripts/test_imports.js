// Quick syntax/import check for unit data modules
const modules = [
  "../src/modules/gameData/wikiSources",
  "../src/modules/gameData/mediaWikiClient",
  "../src/modules/gameData/unitImportParser",
  "../src/modules/gameData/unitRepository",
  "../src/modules/gameData/unitLookupService",
  "../src/modules/gameData/unitImportService",
];

let ok = 0;
let fail = 0;
for (const mod of modules) {
  try {
    require(mod);
    console.log("OK: " + mod);
    ok++;
  } catch (e) {
    console.log("FAIL: " + mod + " - " + e.message);
    fail++;
  }
}
console.log("\n" + ok + "/" + (ok+fail) + " passed");
