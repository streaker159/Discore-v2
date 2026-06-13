const prisma = require('../../lib/prisma');
const { askDeepSeek } = require('./deepseekClient');

async function getCredits(guildId) {
  return prisma.aiCredits.upsert({
    where: { guildId },
    update: {},
    create: { guildId, balance: 0 },
  });
}

async function spendCredits({ guildId, userId, requestType, cost }) {
  const credits = await getCredits(guildId);
  if (credits.balance < cost) {
    throw new Error(`Not enough AI credits. Required ${cost}, available ${credits.balance}.`);
  }
  await prisma.aiCredits.update({ where: { guildId }, data: { balance: { decrement: cost } } });
  await prisma.aiUsageLog.create({ data: { guildId, userId, requestType, cost } });
}

async function answerStrategy({ guildId, userId, prompt, context }) {
  await spendCredits({ guildId, userId, requestType: 'strategy.basic', cost: 1 });
  return askDeepSeek({
    system: 'You are Discore, a concise strategy-game assistant. Use the supplied context and avoid inventing exact unit stats not provided.',
    user: `Context:\n${JSON.stringify(context, null, 2)}\n\nQuestion:\n${prompt}`,
  });
}

module.exports = { getCredits, spendCredits, answerStrategy };
