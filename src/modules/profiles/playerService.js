const prisma = require("../../lib/prisma");

const RATE_LIMIT_HOURS = 24;
const MAX_SCREENSHOTS = 5;

// ── READ ────────────────────────────────────────────────────────────────────

async function getPlayerProfile(discordId) {
  return prisma.playerProfile.findUnique({
    where: { discordId },
    include: {
      allianceHistory: { orderBy: { joinedAt: "desc" }, take: 5 },
    },
  });
}

// ── RATE LIMIT CHECK ────────────────────────────────────────────────────────

async function canUpdateProfile(discordId) {
  const profile = await prisma.playerProfile.findUnique({
    where: { discordId },
    select: { lastUpdateAt: true },
  });
  if (!profile?.lastUpdateAt) return { canUpdate: true, hoursLeft: 0 };

  const hoursSince =
    (Date.now() - profile.lastUpdateAt.getTime()) / (1000 * 60 * 60);
  if (hoursSince >= RATE_LIMIT_HOURS) return { canUpdate: true, hoursLeft: 0 };
  return {
    canUpdate: false,
    hoursLeft: Math.ceil(RATE_LIMIT_HOURS - hoursSince),
  };
}

// ── UPDATE FROM PARSED SCREENSHOT DATA ──────────────────────────────────────

async function updatePlayerFromParsed(
  discordId,
  parsed,
  screenshotUrls,
  bypassRateLimit = false,
) {
  const existing = await prisma.playerProfile.findUnique({
    where: { discordId },
    include: { allianceHistory: true },
  });

  // Rate limit unless bypassed by admin
  if (!bypassRateLimit && existing) {
    const { canUpdate, hoursLeft } = await canUpdateProfile(discordId);
    if (!canUpdate) return { rateLimited: true, hoursLeft };
  }

  const data = {
    screenshotUrls: screenshotUrls ?? [],
    lastUpdateAt: new Date(),
  };

  const numericFields = [
    "level",
    "xpCurrent",
    "xpMax",
    "unitsKilled",
    "unitsLost",
    "provincesTaken",
    "provincesLost",
    "gamesJoined",
    "soloVictories",
    "coalitionVictories",
    "overallScore",
    "overallRank",
    "economicRank",
    "militaryRank",
    "playedOnPC",
    "playedOnMobile",
    "performanceScore",
  ];
  const floatFields = ["kdRatio", "winRate"];
  const stringFields = [
    "gameUsername",
    "inGameRank",
    "memberSince",
    "lastOnline",
    "combatStyle",
    "role",
    "playstyle",
  ];

  for (const f of numericFields) {
    if (parsed[f] != null) data[f] = Number(parsed[f]);
  }
  for (const f of floatFields) {
    if (parsed[f] != null) data[f] = parseFloat(parsed[f]);
  }
  for (const f of stringFields) {
    if (parsed[f] != null) data[f] = String(parsed[f]);
  }

  // Alliance tracking – create history entry on alliance change
  if (parsed.allianceName) {
    const newAlliance = String(parsed.allianceName);
    const newTag = parsed.allianceTag ? String(parsed.allianceTag) : null;

    if (existing && existing.currentAlliance !== newAlliance) {
      // Close previous history entry
      await prisma.allianceHistory.updateMany({
        where: { playerId: existing.id, leftAt: null },
        data: { leftAt: new Date() },
      });
    }

    data.currentAlliance = newAlliance;
    data.currentAllianceTag = newTag;

    if (!existing || existing.currentAlliance !== newAlliance) {
      // Will create history after upsert
      data.currentAllianceJoinedAt = new Date();
    }
  }

  const profile = await prisma.playerProfile.upsert({
    where: { discordId },
    update: data,
    create: {
      discordId,
      isPublic: true,
      discoreElo: 1000,
      avaWins: 0,
      avaLosses: 0,
      ...data,
    },
    include: {
      allianceHistory: { orderBy: { joinedAt: "desc" }, take: 5 },
    },
  });

  // Create new alliance history entry if alliance changed
  if (parsed.allianceName) {
    const hasOpen = await prisma.allianceHistory.findFirst({
      where: { playerId: profile.id, leftAt: null },
    });
    if (!hasOpen) {
      await prisma.allianceHistory.create({
        data: {
          playerId: profile.id,
          allianceName: String(parsed.allianceName),
          allianceTag: parsed.allianceTag ? String(parsed.allianceTag) : null,
          game: profile.game || "supremacy-ww3",
          joinedAt: new Date(),
        },
      });
    }
  }

  await prisma.profileUpdateLog.create({ data: { playerId: profile.id } });

  return { rateLimited: false, profile };
}

// ── MANUAL FIELD UPDATE ──────────────────────────────────────────────────────

async function updatePlayerManual(discordId, fields) {
  const existing = await prisma.playerProfile.findUnique({
    where: { discordId },
  });
  const profile = await prisma.playerProfile.upsert({
    where: { discordId },
    update: { ...fields, lastUpdateAt: new Date() },
    create: {
      discordId,
      isPublic: true,
      discoreElo: 1000,
      avaWins: 0,
      avaLosses: 0,
      ...fields,
      lastUpdateAt: new Date(),
    },
    include: {
      allianceHistory: { orderBy: { joinedAt: "desc" }, take: 5 },
    },
  });

  // Track alliance history if alliance was updated
  if (
    fields.currentAlliance &&
    existing &&
    existing.currentAlliance !== fields.currentAlliance
  ) {
    await prisma.allianceHistory.updateMany({
      where: { playerId: profile.id, leftAt: null },
      data: { leftAt: new Date() },
    });
    await prisma.allianceHistory.create({
      data: {
        playerId: profile.id,
        allianceName: fields.currentAlliance,
        allianceTag: fields.currentAllianceTag || null,
        game: profile.game || "supremacy-ww3",
        joinedAt: new Date(),
      },
    });
  }

  await prisma.profileUpdateLog.create({ data: { playerId: profile.id } });
  return profile;
}

// ── PRIVACY ──────────────────────────────────────────────────────────────────

async function setPlayerPrivacy(discordId, isPublic) {
  return prisma.playerProfile.upsert({
    where: { discordId },
    update: { isPublic },
    create: { discordId, isPublic, discoreElo: 1000, avaWins: 0, avaLosses: 0 },
  });
}

// ── LEADERBOARD QUERIES ──────────────────────────────────────────────────────

async function getTopPlayers(metric = "discoreElo", limit = 10) {
  const validMetrics = {
    discoreElo: { discoreElo: "desc" },
    avaWins: { avaWins: "desc" },
    kdRatio: { kdRatio: "desc" },
    performanceScore: { performanceScore: "desc" },
  };
  const orderBy = validMetrics[metric] ?? { discoreElo: "desc" };

  return prisma.playerProfile.findMany({
    where: { isPublic: true },
    orderBy,
    take: limit,
  });
}

module.exports = {
  getPlayerProfile,
  canUpdateProfile,
  updatePlayerFromParsed,
  updatePlayerManual,
  setPlayerPrivacy,
  getTopPlayers,
  MAX_SCREENSHOTS,
  RATE_LIMIT_HOURS,
};
