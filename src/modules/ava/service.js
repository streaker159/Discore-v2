const prisma = require("../../lib/prisma");

async function createAvaMatch({
  homeAllianceId,
  awayAllianceId,
  game,
  scheduledAt,
}) {
  return prisma.avaMatch.create({
    data: { homeAllianceId, awayAllianceId, game, scheduledAt },
  });
}

async function submitResult({ matchId, winnerId, evidenceUrl, submittedBy }) {
  return prisma.avaMatch.update({
    where: { id: matchId },
    data: {
      winnerId,
      evidenceUrl,
      submittedBy,
      status: "AWAITING_CONFIRMATION",
    },
  });
}

async function confirmResult({ matchId, confirmedBy }) {
  const match = await prisma.avaMatch.update({
    where: { id: matchId },
    data: { confirmedBy, status: "VERIFIED" },
  });

  if (match.winnerId) {
    const loserId =
      match.winnerId === match.homeAllianceId
        ? match.awayAllianceId
        : match.homeAllianceId;
    await prisma.allianceProfile.update({
      where: { id: match.winnerId },
      data: { discoreWins: { increment: 1 }, discoreElo: { increment: 15 } },
    });
    await prisma.allianceProfile.update({
      where: { id: loserId },
      data: { discoreLosses: { increment: 1 }, discoreElo: { decrement: 10 } },
    });
  }
  return match;
}

async function disputeMatch({ matchId, disputedBy, reason }) {
  return prisma.avaMatch.update({
    where: { id: matchId },
    data: { status: "DISPUTED", meta: { disputedBy, reason } },
  });
}

async function voidMatch(matchId) {
  return prisma.avaMatch.update({
    where: { id: matchId },
    data: { status: "VOIDED" },
  });
}

async function cancelMatch(matchId) {
  return prisma.avaMatch.update({
    where: { id: matchId },
    data: { status: "CANCELED" },
  });
}

async function getMatch(matchId) {
  return prisma.avaMatch.findUnique({
    where: { id: matchId },
    include: { homeAlliance: true, awayAlliance: true },
  });
}

module.exports = {
  createAvaMatch,
  submitResult,
  confirmResult,
  disputeMatch,
  voidMatch,
  cancelMatch,
  getMatch,
};
