const prisma = require('../../lib/prisma');
const { premiumCache } = require('../../lib/cache');
const { getPlanLimits } = require('../../config/plans');

async function getPremiumStatus(guildId) {
  const premium = await prisma.guildPremium.findUnique({ where: { guildId } });
  const tier = premium?.expiresAt && premium.expiresAt < new Date() ? 'FREE' : (premium?.tier || 'FREE');
  return { tier, premium, limits: getPlanLimits(tier) };
}

async function grantPremium({ guildId, tier, method = 'MANUAL', grantedBy, code, expiresAt }) {
  const record = await prisma.guildPremium.upsert({
    where: { guildId },
    update: { tier, method, grantedBy, code, expiresAt },
    create: { guildId, tier, method, grantedBy, code, expiresAt },
  });
  premiumCache.delete(`tier:${guildId}`);
  return record;
}

async function revokePremium(guildId) {
  const record = await prisma.guildPremium.upsert({
    where: { guildId },
    update: { tier: 'FREE', method: 'MANUAL', expiresAt: null },
    create: { guildId, tier: 'FREE', method: 'MANUAL' },
  });
  premiumCache.delete(`tier:${guildId}`);
  return record;
}

async function createPremiumCode(data) {
  return prisma.premiumCode.create({ data });
}

async function redeemPremiumCode({ guildId, userId, code }) {
  const normalised = String(code || '').trim().toUpperCase();
  const premiumCode = await prisma.premiumCode.findUnique({ where: { code: normalised } });
  if (!premiumCode) throw new Error('Invalid premium code.');
  if (premiumCode.expiresAt && premiumCode.expiresAt < new Date()) throw new Error('This code has expired.');
  if (premiumCode.uses >= premiumCode.maxUses) throw new Error('This code has already been used the maximum number of times.');

  let expiresAt = null;
  if (premiumCode.type === 'TRIAL' && premiumCode.trialDays) {
    expiresAt = new Date(Date.now() + premiumCode.trialDays * 24 * 60 * 60 * 1000);
  }

  await prisma.premiumCode.update({ where: { id: premiumCode.id }, data: { uses: { increment: 1 } } });
  return grantPremium({ guildId, tier: premiumCode.tier, method: 'CODE', grantedBy: userId, code: normalised, expiresAt });
}

module.exports = {
  getPremiumStatus,
  grantPremium,
  revokePremium,
  createPremiumCode,
  redeemPremiumCode,
};
