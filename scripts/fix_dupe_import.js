const fs = require("fs");
const path = require("path");
const fp = path.join(__dirname, "..", "src", "components", "modals", "battle", "createBattle.js");
let content = fs.readFileSync(fp, "utf8");
// Normalize line endings
content = content.replace(/\r\n/g, "\n");
// Remove the second identical discord.js require block
const target = 'const {\n  ModalBuilder,\n  TextInputBuilder,\n  TextInputStyle,\n  ActionRowBuilder,\n  MessageFlags,\n} = require("discord.js");';
const firstIdx = content.indexOf(target);
if (firstIdx === -1) { console.log("ERROR: target not found"); process.exit(1); }
const secondIdx = content.indexOf(target, firstIdx + target.length);
if (secondIdx === -1) { console.log("OK: no duplicate found"); process.exit(0); }
// Remove the second block + trailing newline
content = content.slice(0, secondIdx) + content.slice(secondIdx + target.length);
// Clean up double newlines
content = content.replace(/\n{3,}/g, "\n\n");
fs.writeFileSync(fp, content, "utf8");
console.log("Fixed! Removed duplicate at position " + secondIdx);
