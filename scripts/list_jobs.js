const fs = require("fs");
const dir = "./src/jobs/";
fs.readdirSync(dir).forEach(f => console.log(f));
// Also check if automodCleanup.js exists
console.log("automodCleanup.js exists: " + fs.existsSync(dir + "automodCleanup.js"));
