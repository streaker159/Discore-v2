"use strict";

const { getGuildTier } = require("../../lib/premiumGate");
const { hasFeature } = require("../../lib/premiumGate");
const prisma = require("../../lib/prisma");

/**
 * Check if onboarding premium is active for a guild.
 * Returns { active: boolean, tier: string }
 */
async function hasOnboardingPremium(guildId) {
  if (!guildId) return { active: false, tier: "FREE" };
  const tier = await getGuildTier(guildId);
  // Onboarding requires PRO or LIFETIME
  const active = tier === "PRO" || tier === "LIFETIME";
  return { active, tier };
}

/**
 * Check if onboarding premium is active (boolean only).
 */
async function isOnboardingPremiumActive(guildId) {
  const { active } = await hasOnboardingPremium(guildId);
  return active;
}

/**
 * Premium gate for onboarding. Returns false and replies ephemerally if premium is expired.
 * If allowExpiredView is true, only blocks write actions (creating/editing/submitting).
 */
async function requireOnboardingPremium(
  interaction,
  { allowExpiredView = false } = {},
) {
  const guildId = interaction.guildId;
  if (!guildId) return false;

  const { active, tier } = await hasOnboardingPremium(guildId);

  if (active) return true;

  // Premium expired
  const content = allowExpiredView
    ? "🔒 **Premium has expired.** You can view existing applications and records, but new submissions and edits are locked until premium is restored."
    : "🔒 **Premium required.** The Onboarding Applications system requires an active Discore premium subscription.";

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, flags: 64 }).catch(() => {});
    } else {
      await interaction.reply({ content, flags: 64 }).catch(() => {});
    }
  } catch {}

  return false;
}

/**
 * Update premium state tracking on the onboarding config.
 */
async function updatePremiumState(guildId) {
  try {
    const { active } = await hasOnboardingPremium(guildId);
    const now = new Date();

    const config = await prisma.$queryRawUnsafe(
      `SELECT "id" FROM "OnboardingConfig" WHERE "guildId" = $1`,
      guildId,
    );

    if (!config || !config.length) return;

    if (active) {
      await prisma.$queryRawUnsafe(
        `UPDATE "OnboardingConfig" SET "lastPremiumActiveAt" = $1, "premiumLockedAt" = NULL, "updatedAt" = $2 WHERE "guildId" = $3`,
        now,
        now,
        guildId,
      );
    } else {
      await prisma.$queryRawUnsafe(
        `UPDATE "OnboardingConfig" SET "premiumLockedAt" = COALESCE("premiumLockedAt", $1), "updatedAt" = $2 WHERE "guildId" = $3`,
        now,
        now,
        guildId,
      );
    }
  } catch (e) {
    // Non-critical
  }
}

module.exports = {
  hasOnboardingPremium,
  isOnboardingPremiumActive,
  requireOnboardingPremium,
  updatePremiumState,
};
