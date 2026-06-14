const prisma = require("../../lib/prisma");

const RATE_LIMIT_HOURS = 24;
const MAX_SCREENSHOTS = 5;

// ── READ ────────────────────────────────────────────────────────────────────

async function getAllianceProfile(tag, game) {
  return prisma.allianceProfile.findUnique({
    where: { tag_game: { tag: tag.toUpperCase(), game } },
    include: {
      recentMatches: { orderBy: { occurredAt: "desc" }, take: 5 },
    },
  });
}

async function getAllianceProfileById(id) {
  return prisma.allianceProfile.findUnique({
    where: { id },
    include: {
      recentMatches: { orderBy: { occurredAt: "desc" }, take: 5 },
    },
  });
}

async function getUserAlliance(discordId, game) {
  const player = await prisma.playerProfile.findUnique({
    where: { discordId },
  });
  if (!player?.currentAllianceTag || !player?.currentAlliance) return null;
  return getAllianceProfile(
    player.currentAllianceTag,
    game || player.game || "supremacy-ww3",
  );
}

// ── RATE LIMIT ──────────────────────────────────────────────────────────────

async function canUpdateAlliance(tag, game) {
  const alliance = await prisma.allianceProfile.findUnique({
    where: { tag_game: { tag: tag.toUpperCase(), game } },
    select: { lastUpdateAt: true },
  });
  if (!alliance?.lastUpdateAt) return { canUpdate: true, hoursLeft: 0 };
  const hoursSince =
    (Date.now() - alliance.lastUpdateAt.getTime()) / (1000 * 60 * 60);
  if (hoursSince >= RATE_LIMIT_HOURS) return { canUpdate: true, hoursLeft: 0 };
  return {
    canUpdate: false,
    hoursLeft: Math.ceil(RATE_LIMIT_HOURS - hoursSince),
  };
}

// ── UPDATE FROM PARSED SCREENSHOT DATA ──────────────────────────────────────

async function updateAllianceFromParsed(
  tag,
  game,
  parsed,
  screenshotUrls,
  updatedBy,
  bypassRateLimit = false,
) {
  const upperTag = tag.toUpperCase();

  const existing = await prisma.allianceProfile.findUnique({
    where: { tag_game: { tag: upperTag, game } },
  });

  if (!bypassRateLimit && existing) {
    const { canUpdate, hoursLeft } = await canUpdateAlliance(upperTag, game);
    if (!canUpdate) return { rateLimited: true, hoursLeft };
  }

  const data = {
    screenshotUrls: screenshotUrls ?? [],
    lastUpdateAt: new Date(),
  };

  if (parsed.name) data.name = String(parsed.name);
  if (parsed.description) data.description = String(parsed.description);
  if (parsed.rank != null) data.officialRank = Number(parsed.rank);
  if (parsed.elo != null) data.officialElo = Number(parsed.elo);
  if (parsed.wins != null) data.officialWins = Number(parsed.wins);
  if (parsed.losses != null) data.officialLosses = Number(parsed.losses);
  if (parsed.members != null) data.officialMembers = Number(parsed.members);
  if (parsed.maxMembers != null)
    data.officialMaxMembers = Number(parsed.maxMembers);
  if (parsed.country) data.country = String(parsed.country).toUpperCase();
  if (parsed.founded) data.founded = String(parsed.founded);

  // Recalculate win rate from official stats
  const totalWins = data.officialWins ?? existing?.officialWins ?? 0;
  const totalLosses = data.officialLosses ?? existing?.officialLosses ?? 0;
  if (totalWins + totalLosses > 0) {
    data.winRate = parseFloat(
      ((totalWins / (totalWins + totalLosses)) * 100).toFixed(1),
    );
    data.seasonRecord = `${totalWins}W – ${totalLosses}L`;
  }

  const alliance = await prisma.allianceProfile.upsert({
    where: { tag_game: { tag: upperTag, game } },
    update: data,
    create: {
      tag: upperTag,
      game,
      name: parsed.name || upperTag,
      isPublic: true,
      discoreElo: 1000,
      discoreWins: 0,
      discoreLosses: 0,
      tags: [],
      screenshotUrls: [],
      ...data,
    },
    include: {
      recentMatches: { orderBy: { occurredAt: "desc" }, take: 5 },
    },
  });

  await prisma.allianceUpdateLog.create({
    data: { allianceId: alliance.id, updatedBy },
  });

  return { rateLimited: false, alliance };
}

// ── MANUAL UPDATE ────────────────────────────────────────────────────────────

async function updateAllianceManual(tag, game, fields, updatedBy) {
  const upperTag = tag.toUpperCase();
  const alliance = await prisma.allianceProfile.upsert({
    where: { tag_game: { tag: upperTag, game } },
    update: { ...fields, lastUpdateAt: new Date() },
    create: {
      tag: upperTag,
      game,
      name: fields.name || upperTag,
      isPublic: true,
      discoreElo: 1000,
      discoreWins: 0,
      discoreLosses: 0,
      tags: [],
      screenshotUrls: [],
      ...fields,
      lastUpdateAt: new Date(),
    },
    include: {
      recentMatches: { orderBy: { occurredAt: "desc" }, take: 5 },
    },
  });

  await prisma.allianceUpdateLog.create({
    data: { allianceId: alliance.id, updatedBy },
  });

  return alliance;
}

// ── RECENT MATCH ──────────────────────────────────────────────────────────────

async function addRecentMatch(allianceId, opponentName, opponentTag, result) {
  return prisma.allianceRecentMatch.create({
    data: {
      allianceId,
      opponentName,
      opponentTag: opponentTag || null,
      result,
    },
  });
}

// ── PRIVACY ──────────────────────────────────────────────────────────────────

async function setAlliancePrivacy(tag, game, isPublic) {
  return prisma.allianceProfile.update({
    where: { tag_game: { tag: tag.toUpperCase(), game } },
    data: { isPublic },
  });
}

// ── LEADERBOARD ──────────────────────────────────────────────────────────────

async function getTopAlliances(metric = "discoreElo", limit = 10) {
  const validMetrics = {
    discoreElo: { discoreElo: "desc" },
    discoreWins: { discoreWins: "desc" },
    officialRank: { officialRank: "asc" },
    winRate: { winRate: "desc" },
  };
  const orderBy = validMetrics[metric] ?? { discoreElo: "desc" };

  return prisma.allianceProfile.findMany({
    where: { isPublic: true },
    orderBy,
    take: limit,
  });
}

module.exports = {
  getAllianceProfile,
  getAllianceProfileById,
  getUserAlliance,
  canUpdateAlliance,
  updateAllianceFromParsed,
  updateAllianceManual,
  addRecentMatch,
  setAlliancePrivacy,
  getTopAlliances,
  MAX_SCREENSHOTS,
  RATE_LIMIT_HOURS,
};
