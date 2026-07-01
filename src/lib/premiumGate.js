const prisma = require("./prisma");
const { premiumCache } = require("./cache");
const { hasTier, getPlanLimits } = require("../config/plans");
const FEATURE_REQUIREMENTS = require("../config/features");

async function getGuildTier(guildId) {
  if (!guildId) return "FREE";
  const cacheKey = `tier:${guildId}`;
  const cached = premiumCache.get(cacheKey);
  if (cached) return cached;

  const premium = await prisma.guildPremium.findUnique({ where: { guildId } });
  let tier = premium?.tier || "FREE";

  if (premium?.expiresAt && premium.expiresAt < new Date()) {
    tier = "FREE";
  }

  premiumCache.set(cacheKey, tier);
  return tier;
}

async function getGuildPlan(guildId) {
  const tier = await getGuildTier(guildId);
  return { tier, limits: getPlanLimits(tier) };
}

async function hasFeature(guildId, featureKey) {
  const requiredTier = FEATURE_REQUIREMENTS[featureKey] || "FREE";
  const tier = await getGuildTier(guildId);
  return hasTier(tier, requiredTier);
}

async function requireFeature(interaction, featureKey) {
  const ok = await hasFeature(interaction.guildId, featureKey);
  if (ok) return true;
  await interaction.reply({
    content: `🔒 **Discore Premium required.** This feature is premium locked.`,
    ephemeral: true,
  });
  return false;
}

module.exports = {
  getGuildTier,
  getGuildPlan,
  hasFeature,
  requireFeature,
};
