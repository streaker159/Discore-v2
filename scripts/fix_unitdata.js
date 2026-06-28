const fs = require("fs");
const path = require("path");

// Fix unitdata.js
let fp1 = path.join(__dirname, "..", "src", "commands", "admin", "game-admin", "unitdata.js");
let c1 = fs.readFileSync(fp1, "utf8");
c1 = c1.replace(/\n\s*\)\s*\n\s*\.addSubcommand[\s\S]*$/, "\n");
c1 = c1.replace(
  /\s*\.addSubcommand\(\(s\)\s*=>\s*\n\s*s\.setName\("reject"\).*?\n\s*\)\s*\n\s*async execute/,
  '    .addSubcommand((s) =>\n      s.setName("reject").setDescription("Reject a draft.")\n        .addStringOption((o) => o.setName("draft_id").setDescription("Draft ID to reject").setRequired(true))\n    )\n    .addSubcommand((s) =>\n      s.setName("init").setDescription("Initialize game data source records.")\n    ),\n  async execute'
);
fs.writeFileSync(fp1, c1, "utf8");

// Fix unit.js
let fp2 = path.join(__dirname, "..", "src", "commands", "public", "unit", "unit.js");
let c2 = fs.readFileSync(fp2, "utf8");
c2 = c2.replace(/\n\s*\.addStringOption[\s\S]*$/, "\n");
c2 = c2.replace(
  /\s*\.addSubcommand\(\(s\)\s*=>\s*\n\s*s\.setName\("compare"\).*?\n\s*\.addStringOption\(\(o\)\s*=>\s*o\.setName\("unit_a"\).*?\n\s*async execute/,
  '    .addSubcommand((s) =>\n      s.setName("compare").setDescription("Compare two units.")\n        .addStringOption((o) => o.setName("game").setDescription("Game").setRequired(true).addChoices(...gameChoices))\n        .addStringOption((o) => o.setName("unit_a").setDescription("First unit").setRequired(true))\n        .addStringOption((o) => o.setName("unit_b").setDescription("Second unit").setRequired(true))\n    ),\n  async execute'
);
fs.writeFileSync(fp2, c2, "utf8");
console.log("Fixed both files");
