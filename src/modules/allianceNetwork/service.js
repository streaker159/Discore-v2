const prisma = require('../../lib/prisma');

async function registerAlliance(data) {
  return prisma.allianceProfile.upsert({
    where: { tag_game: { tag: data.tag, game: data.game } },
    update: data,
    create: data,
  });
}

async function getAllianceByTag(game, tag) {
  return prisma.allianceProfile.findUnique({ where: { tag_game: { tag, game } } });
}

async function getAllianceRanking(game) {
  return prisma.allianceProfile.findMany({
    where: { game },
    orderBy: [{ discoreElo: 'desc' }, { discoreWins: 'desc' }],
    take: 25,
  });
}

async function registerPlayer({ discordId, gameUsername, game, allianceName, playstyle, role }) {
  const existing = await prisma.playerProfile.findUnique({ where: { discordId } });
  const profile = await prisma.playerProfile.upsert({
    where: { discordId },
    update: { gameUsername, game, currentAlliance: allianceName, playstyle, role },
    create: { discordId, gameUsername, game, currentAlliance: allianceName, playstyle, role },
  });

  if (!existing || existing.currentAlliance !== allianceName || existing.game !== game) {
    if (existing) {
      await prisma.allianceHistory.updateMany({
        where: { playerId: profile.id, leftAt: null },
        data: { leftAt: new Date() },
      });
    }
    await prisma.allianceHistory.create({
      data: { playerId: profile.id, allianceName, game, joinedAt: new Date() },
    });
  }
  return profile;
}

module.exports = {
  registerAlliance,
  getAllianceByTag,
  getAllianceRanking,
  registerPlayer,
};
