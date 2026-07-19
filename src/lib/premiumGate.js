const prisma = require("./prisma");
const { hasTier, getPlanLimits } = require("../config/plans");
const FEATURE_REQUIREMENTS = require("../config/features");

async function getGuildTier(guildId) {
  if (!guildId) return "FREE";

  const premium = await prisma.guildPremium.findUnique({ where: { guildId } });
  let tier = premium?.tier || "FREE";

  if (premium?.expiresAt && premium.expiresAt < new Date()) {
    tier = "FREE";
  }

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
  const payload = {
    content: `🔒 **Discore Premium required.** This feature is premium locked.`,
    flags: 64,
  };

  if (interaction.deferred) {
    await interaction.editReply({ content: payload.content });
  } else if (interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
  return false;
}

module.exports = {
  getGuildTier,
  getGuildPlan,
  hasFeature,
  requireFeature,
};
