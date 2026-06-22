"use strict";

require("dotenv").config();
const { addCredits } = require("../src/modules/ai/service");

async function main() {
  const guildId = "1366566263048110125";
  const amount = 5000; // Grant 5000 AI credits

  console.log(`Granting ${amount} AI credits to server ${guildId}...`);

  try {
    const result = await addCredits(guildId, amount);

    console.log("✅ SUCCESS!");
    console.log("New Balance:", result.balance, "credits");

    process.exit(0);
  } catch (error) {
    console.error("❌ ERROR:", error.message);
    process.exit(1);
  }
}

main();
