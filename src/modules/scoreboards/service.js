const prisma = require("../../lib/prisma");
const { createDiscoreEmbed } = require("../../lib/embedBuilder");
const { getGuildPlan } = require("../../lib/premiumGate");

function ratio(wins, losses) {
  if (!losses) return wins ? wins.toFixed(2) : "0.00";
  return (wins / losses).toFixed(2);
}

async function createScoreboard({
  guildId,
  name,
  metric,
  type,
  channelId,
  createdBy,
}) {
  const plan = await getGuildPlan(guildId);
  const activeCount = await prisma.scoreboard.count({
    where: { guildId, isArchived: false },
  });
  if (activeCount >= plan.limits.liveScoreboards) {
    throw new Error(
      `This server has reached its live scoreboard limit for ${plan.tier}: ${plan.limits.liveScoreboards}.`,
    );
  }

  return prisma.scoreboard.create({
    data: {
      guildId,
      name,
      metric,
      type,
      channelId,
      liveTitle: name,
      actions: {
        create: {
          targetId: guildId,
          action: "CREATE",
          delta: 0,
          adminId: createdBy,
        },
      },
    },
  });
}

async function getScoreboard(guildId, name) {
  return prisma.scoreboard.findFirst({
    where: {
      guildId,
      name: { equals: name, mode: "insensitive" },
      isArchived: false,
    },
    include: { entries: true },
  });
}

async function addResult({
  guildId,
  scoreboardName,
  targetId,
  targetType = "USER",
  action,
  delta = 1,
  adminId,
  reason,
}) {
  const board = await getScoreboard(guildId, scoreboardName);
  if (!board) throw new Error(`Scoreboard not found: ${scoreboardName}`);

  const entry = await prisma.scoreboardEntry.upsert({
    where: { scoreboardId_targetId: { scoreboardId: board.id, targetId } },
    update:
      action === "WIN"
        ? {
            wins: { increment: delta },
            winStreak: { increment: delta },
            lossStreak: 0,
          }
        : action === "LOSS"
          ? {
              losses: { increment: delta },
              lossStreak: { increment: delta },
              winStreak: 0,
            }
          : { points: { increment: delta } },
    create: {
      scoreboardId: board.id,
      targetId,
      targetType,
      wins: action === "WIN" ? delta : 0,
      losses: action === "LOSS" ? delta : 0,
      points: action === "POINT" ? delta : 0,
      winStreak: action === "WIN" ? delta : 0,
      lossStreak: action === "LOSS" ? delta : 0,
    },
  });

  await prisma.scoreboardAction.create({
    data: { scoreboardId: board.id, targetId, action, delta, adminId, reason },
  });

  return { board: await getScoreboard(guildId, scoreboardName), entry };
}

async function archiveScoreboard({ guildId, name }) {
  const board = await getScoreboard(guildId, name);
  if (!board) throw new Error(`Scoreboard not found: ${name}`);
  return prisma.scoreboard.update({
    where: { id: board.id },
    data: { isArchived: true },
  });
}

async function restoreScoreboard({ guildId, name }) {
  const board = await prisma.scoreboard.findFirst({
    where: {
      guildId,
      name: { equals: name, mode: "insensitive" },
      isArchived: true,
    },
    include: { entries: true },
  });
  if (!board) throw new Error(`No archived scoreboard found: ${name}`);
  return prisma.scoreboard.update({
    where: { id: board.id },
    data: { isArchived: false },
  });
}

async function mergeScoreboards({ guildId, sourceName, targetName, adminId }) {
  const source = await getScoreboard(guildId, sourceName);
  const target = await getScoreboard(guildId, targetName);
  if (!source) throw new Error(`Source scoreboard not found: ${sourceName}`);
  if (!target) throw new Error(`Target scoreboard not found: ${targetName}`);

  for (const entry of source.entries) {
    await prisma.scoreboardEntry.upsert({
      where: {
        scoreboardId_targetId: {
          scoreboardId: target.id,
          targetId: entry.targetId,
        },
      },
      update: {
        wins: { increment: entry.wins },
        losses: { increment: entry.losses },
        points: { increment: entry.points },
      },
      create: {
        scoreboardId: target.id,
        targetId: entry.targetId,
        targetType: entry.targetType,
        wins: entry.wins,
        losses: entry.losses,
        points: entry.points,
        winStreak: entry.winStreak,
        lossStreak: entry.lossStreak,
      },
    });
  }

  await prisma.scoreboardAction.create({
    data: {
      scoreboardId: target.id,
      targetId: guildId,
      action: "MERGE",
      delta: 0,
      adminId,
      reason: `Merged from ${sourceName}`,
    },
  });

  await prisma.scoreboard.update({
    where: { id: source.id },
    data: { isArchived: true },
  });
  return getScoreboard(guildId, targetName);
}

function sortEntries(board) {
  const metric = board.metric;
  return [...board.entries].sort((a, b) => {
    if (metric === "POINTS") return b.points - a.points;
    if (metric === "LOSSES") return b.losses - a.losses;
    if (metric === "RATIO")
      return b.wins / Math.max(1, b.losses) - a.wins / Math.max(1, a.losses);
    if (metric === "WIN_STREAK") return b.winStreak - a.winStreak;
    if (metric === "LOSS_STREAK") return b.lossStreak - a.lossStreak;
    return b.wins - a.wins;
  });
}

async function buildScoreboardEmbed(interaction, board) {
  const entries = sortEntries(board).slice(0, 15);
  const lines = entries.map((entry, index) => {
    const medal =
      index === 0
        ? "🥇"
        : index === 1
          ? "🥈"
          : index === 2
            ? "🥉"
            : `#${index + 1}`;
    const mention =
      entry.targetType === "ROLE"
        ? `<@&${entry.targetId}>`
        : `<@${entry.targetId}>`;
    return `${medal} ${mention} — **${entry.wins}W / ${entry.losses}L** • Ratio ${ratio(entry.wins, entry.losses)} • ${entry.points} pts`;
  });

  return createDiscoreEmbed(interaction, {
    title: `🏆 ${board.liveTitle || board.name}`,
    description: lines.length
      ? lines.join("\n")
      : "No entries yet. Add a win or points to start the board.",
    fields: [
      { name: "Metric", value: board.metric, inline: true },
      { name: "Type", value: board.type, inline: true },
      {
        name: "Archived",
        value: board.isArchived ? "Yes" : "No",
        inline: true,
      },
    ],
  });
}

module.exports = {
  createScoreboard,
  getScoreboard,
  addResult,
  archiveScoreboard,
  restoreScoreboard,
  mergeScoreboards,
  buildScoreboardEmbed,
};
