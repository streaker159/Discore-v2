const fs = require("fs");
const path = require("path");

const files = [
  "src/components/buttons/premium/premiumBtn.js",
];

for (const f of files) {
  const fp = path.join(__dirname, "..", f);
  let c = fs.readFileSync(fp, "utf8");
  c = c.replace(/prisma\.aiUsageLog/g, "prisma.aiUsage");
  c = c.replace(/_sum: \{ cost: true \}/g, "_sum: { creditsUsed: true }");
  c = c.replace(/_sum\.cost/g, "_sum.creditsUsed");
  fs.writeFileSync(fp, c, "utf8");
  console.log("Fixed: " + f);
}
