"use strict";

require("dotenv").config();
const { grantPremium } = require("../src/modules/premium/service");

async function main() {
  const guildId = "1366566263048110125";

  console.log(`Granting LIFETIME premium to server ${guildId}...`);

  try {
    const result = await grantPremium({
      guildId: guildId,
      tier: "LIFETIME",
      method: "MANUAL",
      grantedBy: null,
      code: null,
      expiresAt: null, // No expiration for LIFETIME
    });

    console.log("✅ SUCCESS!");
    console.log("Premium Record:", result);
    console.log(
      "\nServer now has LIFETIME premium with all features unlocked:",
    );
    console.log("- Live Scoreboards: 999");
    console.log("- Live Events: 9999");
    console.log("- AI Credits Monthly: 5000");

    process.exit(0);
  } catch (error) {
    console.error("❌ ERROR:", error.message);
    process.exit(1);
  }
}

main();
