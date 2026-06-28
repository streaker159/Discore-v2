"use strict";

require("dotenv").config();
const prisma = require("../src/lib/prisma");

async function main() {
  const guildId = "1516157766132039852";
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 3 months

  console.log(`Granting 3 months PREMIUM to server ${guildId}...`);
  console.log(`Expires: ${expiresAt.toISOString()}`);

  const result = await prisma.guildPremium.upsert({
    where: { guildId },
    update: {
      tier: "PRO",
      method: "MANUAL",
      grantedBy: "462858253252952065",
      code: null,
      expiresAt,
      purchasedAt: now,
      lastRenewalAt: now,
      renewalCount: 1,
      monthlyAiAllowance: 2000,
      monthlyAiUsed: 0,
      monthlyAiPeriodStart: now,
      monthlyAiPeriodEnd: expiresAt,
    },
    create: {
      guildId,
      tier: "PRO",
      method: "MANUAL",
      grantedBy: "462858253252952065",
      code: null,
      expiresAt,
      purchasedAt: now,
      lastRenewalAt: now,
      renewalCount: 1,
      monthlyAiAllowance: 2000,
      monthlyAiUsed: 0,
      monthlyAiPeriodStart: now,
      monthlyAiPeriodEnd: expiresAt,
    },
  });

  console.log("✅ Done!");
  console.log("Tier:", result.tier);
  console.log("Expires:", result.expiresAt);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
