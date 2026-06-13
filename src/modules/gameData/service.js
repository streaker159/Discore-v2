const prisma = require('../../lib/prisma');
const { normalise } = require('../../lib/normalise');

async function ensureGame(slug, name = null) {
  const safeSlug = normalise(slug);
  return prisma.game.upsert({
    where: { slug: safeSlug },
    update: {},
    create: { slug: safeSlug, name: name || safeSlug.replace(/-/g, ' ') },
  });
}

function matchesQuery(record, query) {
  const q = String(query || '').toLowerCase();
  return record.name.toLowerCase().includes(q) || (record.aliases || []).some((a) => a.toLowerCase().includes(q));
}

async function findGameData({ gameSlug, type, query }) {
  const game = await prisma.game.findUnique({ where: { slug: normalise(gameSlug) } });
  if (!game) return null;

  const model = { unit: prisma.unit, building: prisma.building, resource: prisma.resource, research: prisma.research }[type];
  if (!model) throw new Error(`Unsupported game data type: ${type}`);

  const records = await model.findMany({ where: { gameId: game.id, isActive: true }, take: 100 });
  const found = records.find((record) => matchesQuery(record, query));
  return found ? { game, record: found } : null;
}

async function searchGameData({ gameSlug, query }) {
  const game = await prisma.game.findUnique({ where: { slug: normalise(gameSlug) } });
  if (!game) return [];
  const [units, buildings, resources, research] = await Promise.all([
    prisma.unit.findMany({ where: { gameId: game.id, isActive: true }, take: 100 }),
    prisma.building.findMany({ where: { gameId: game.id, isActive: true }, take: 100 }),
    prisma.resource.findMany({ where: { gameId: game.id, isActive: true }, take: 100 }),
    prisma.research.findMany({ where: { gameId: game.id, isActive: true }, take: 100 }),
  ]);
  return [
    ...units.map((r) => ({ type: 'Unit', record: r })),
    ...buildings.map((r) => ({ type: 'Building', record: r })),
    ...resources.map((r) => ({ type: 'Resource', record: r })),
    ...research.map((r) => ({ type: 'Research', record: r })),
  ].filter((item) => matchesQuery(item.record, query)).slice(0, 10);
}

module.exports = {
  ensureGame,
  findGameData,
  searchGameData,
};
