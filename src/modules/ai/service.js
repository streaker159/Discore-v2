const prisma = require("../../lib/prisma");
const { askDeepSeek } = require("./deepseekClient");

const CREDIT_COSTS = {
  "strategy.basic": 1,
  "strategy.deep": 5,
  "strategy.allianceWar": 10,
};

async function getCredits(guildId) {
  return prisma.aiCredits.upsert({
    where: { guildId },
    update: {},
    create: { guildId, balance: 0 },
  });
}

async function addCredits(guildId, amount) {
  return prisma.aiCredits.upsert({
    where: { guildId },
    update: { balance: { increment: amount } },
    create: { guildId, balance: amount },
  });
}

async function spendCredits({ guildId, userId, requestType, cost }) {
  const credits = await getCredits(guildId);
  const actualCost = cost ?? CREDIT_COSTS[requestType] ?? 1;
  if (credits.balance < actualCost) {
    throw new Error(
      `Not enough AI credits. Required ${actualCost}, available ${credits.balance}.`,
    );
  }
  await prisma.aiCredits.update({
    where: { guildId },
    data: { balance: { decrement: actualCost } },
  });
  await prisma.aiUsageLog.create({
    data: { guildId, userId, requestType, cost: actualCost },
  });
}

async function answerStrategy({
  guildId,
  userId,
  prompt,
  context,
  requestType = "strategy.basic",
}) {
  const cost = CREDIT_COSTS[requestType] ?? 1;
  await spendCredits({ guildId, userId, requestType, cost });
  const maxTokens =
    requestType === "strategy.deep"
      ? 1500
      : requestType === "strategy.allianceWar"
        ? 2000
        : 700;
  return askDeepSeek({
    system:
      "You are Discore, a concise strategy-game assistant. Use the supplied context and avoid inventing exact unit stats not provided.",
    user: `Context:\n${JSON.stringify(context, null, 2)}\n\nQuestion:\n${prompt}`,
    maxTokens,
  });
}

module.exports = {
  CREDIT_COSTS,
  getCredits,
  addCredits,
  spendCredits,
  answerStrategy,
};
