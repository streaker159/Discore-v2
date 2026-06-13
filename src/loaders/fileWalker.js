const fs = require('fs');
const path = require('path');

function walkFiles(dir, ext = '.js') {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, ext));
    if (entry.isFile() && entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

module.exports = { walkFiles };
