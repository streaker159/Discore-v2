const { spawnSync } = require('child_process');
const path = require('path');
const { walkFiles } = require('../src/loaders/fileWalker');

const files = [...walkFiles(path.join(__dirname, '..', 'src')), ...walkFiles(path.join(__dirname, '..', 'scripts'))];
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  if (result.status !== 0) {
    failed = true;
    console.error(`❌ Syntax error in ${file}`);
    console.error(result.stderr.toString());
  }
}
if (failed) process.exit(1);
console.log(`✅ Syntax check passed for ${files.length} files.`);
