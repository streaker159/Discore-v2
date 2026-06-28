const net = require("net");
const fs = require("fs");
const out = [];
let done = 0;

["5432", "6543"].forEach((port) => {
  const s = net.createConnection(
    { host: "aws-1-eu-central-1.pooler.supabase.com", port: parseInt(port), timeout: 8000 },
    () => { out.push("Port " + port + " REACHABLE"); s.end(); done++; if(done===2) finish(); }
  );
  s.on("error", (e) => { out.push("Port " + port + " FAILED: " + e.code); done++; if(done===2) finish(); });
  s.on("timeout", () => { out.push("Port " + port + " TIMEOUT"); s.destroy(); done++; if(done===2) finish(); });
});

function finish() {
  fs.writeFileSync(__dirname + "/db_result.txt", out.join("\n"));
}
setTimeout(finish, 10000);

