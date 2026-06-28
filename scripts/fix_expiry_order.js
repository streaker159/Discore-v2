const fs = require("fs");
const path = require("path");
const fp = path.join(__dirname, "..", "src", "jobs", "moderationExpiryJob.js");
let c = fs.readFileSync(fp, "utf8");

// Find the current order
const expireIdx = c.indexOf("await caseService.expireCase(moderationCase.id)");
const punishIdx = c.indexOf("await removeActivePunishment(client, moderationCase)");

if (expireIdx !== -1 && punishIdx !== -1 && expireIdx < punishIdx) {
  // expireCase comes first — swap so punishment is removed first
  // Swap: put removeActivePunishment before expireCase
  const before = c.substring(punishIdx - 200, expireIdx + 200);
  const lineA = "        await caseService.expireCase(moderationCase.id);\n";
  const lineB = "        await removeActivePunishment(client, moderationCase);\n";
  const result = c.replace(lineA + lineB, lineB + lineA);
  if (result !== c) {
    fs.writeFileSync(fp, result, "utf8");
    console.log("Swapped: removeActivePunishment now runs first");
  } else {
    console.log("Swap failed — strings may differ");
    console.log("lineA: " + JSON.stringify(lineA));
    console.log("lineB: " + JSON.stringify(lineB));
    // Fallback: manual line swap
    const lines = result.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("caseService.expireCase") && lines[i+1] && lines[i+1].includes("removeActivePunishment")) {
        [lines[i], lines[i+1]] = [lines[i+1], lines[i]];
        fs.writeFileSync(fp, lines.join("\n"), "utf8");
        console.log("Manual swap applied at line " + (i+1));
        break;
      }
    }
  }
} else {
  console.log("Order is already correct (punishment first)");
}

