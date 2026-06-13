const prisma = require("../../lib/prisma");
const { gameFinderCache } = require("../../lib/cache");

async function createMatchWatcher(criteria) {
  const watcher = await prisma.matchWatcher.create({
    data: {
      guildId: criteria.guildId,
      channelId: criteria.channelId,
      createdBy: criteria.createdBy,
      game: criteria.game,
      mode: criteria.mode || null,
      maxPlayers: criteria.maxPlayers || null,
    },
  });
  // Also cache it for fast in-memory matching during the global scan cycle
  gameFinderCache.set(`watcher:${watcher.id}`, watcher, 60 * 60 * 1000);
  return watcher;
}

async function deactivateWatcher(watcherId) {
  return prisma.matchWatcher.update({
    where: { id: watcherId },
    data: { isActive: false },
  });
}

async function getActiveWatchers(game) {
  return prisma.matchWatcher.findMany({ where: { game, isActive: true } });
}

module.exports = { createMatchWatcher, deactivateWatcher, getActiveWatchers };
