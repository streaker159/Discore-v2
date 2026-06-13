const prisma = require("../../lib/prisma");
const { createDiscoreEmbed } = require("../../lib/embedBuilder");
const { getGuildPlan } = require("../../lib/premiumGate");

function ratio(wins, losses) {
  if (!losses) return wins ? wins.toFixed(2) : "0.00";
  return (wins / losses).toFixed(2);
}

function entryScore(entry) {
  return entry.wins - entry.losses;
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
    // WINS / SEASON / ALL_TIME / default
    return b.wins - a.wins;
  });
}

function makeBoardColor(board) {
  if (!board.theme || board.theme === "default") return undefined;
  const clean = board.theme.replace("#", "");
  const parsed = parseInt(clean, 16);
  return Number.isFinite(parsed) ? `#${clean}` : undefined;
}

async function createScoreboard({
  guildId,
  name,
  metric,
  type,
  channelId,
  description,
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
      description: description || null,
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

async function getArchivedScoreboards(guildId) {
  return prisma.scoreboard.findMany({
    where: { guildId, isArchived: true },
    include: { entries: true },
    orderBy: { updatedAt: "desc" },
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

  const updatedBoard = await getScoreboard(guildId, scoreboardName);

  // Leader change detection
  const sorted = sortEntries(updatedBoard);
  const newLeaderId = sorted[0]?.targetId || null;
  let leaderChange = null;
  if (newLeaderId && newLeaderId !== board.lastLeaderId) {
    await prisma.scoreboard.update({
      where: { id: board.id },
      data: { lastLeaderId: newLeaderId },
    });
    leaderChange = { newLeaderId, oldLeaderId: board.lastLeaderId };
  }

  return { board: updatedBoard, entry, leaderChange };
}

async function editEntry({
  guildId,
  scoreboardName,
  targetId,
  targetType = "USER",
  wins,
  losses,
  points,
  winStreak,
  lossStreak,
  adminId,
}) {
  const board = await getScoreboard(guildId, scoreboardName);
  if (!board) throw new Error(`Scoreboard not found: ${scoreboardName}`);

  const updateData = {};
  if (wins !== undefined) updateData.wins = wins;
  if (losses !== undefined) updateData.losses = losses;
  if (points !== undefined) updateData.points = points;
  if (winStreak !== undefined) updateData.winStreak = winStreak;
  if (lossStreak !== undefined) updateData.lossStreak = lossStreak;

  const existing = board.entries.find((e) => e.targetId === targetId);
  let entry;
  if (existing) {
    entry = await prisma.scoreboardEntry.update({
      where: { id: existing.id },
      data: updateData,
    });
  } else {
    entry = await prisma.scoreboardEntry.create({
      data: {
        scoreboardId: board.id,
        targetId,
        targetType,
        wins: 0,
        losses: 0,
        points: 0,
        winStreak: 0,
        lossStreak: 0,
        ...updateData,
      },
    });
  }

  await prisma.scoreboardAction.create({
    data: {
      scoreboardId: board.id,
      targetId,
      action: "EDIT",
      delta: 0,
      adminId,
      reason: "Manual edit",
    },
  });

  return { board: await getScoreboard(guildId, scoreboardName), entry };
}

async function deleteEntry({ guildId, scoreboardName, targetId, adminId }) {
  const board = await getScoreboard(guildId, scoreboardName);
  if (!board) throw new Error(`Scoreboard not found: ${scoreboardName}`);
  const existing = board.entries.find((e) => e.targetId === targetId);
  if (!existing)
    throw new Error(`No entry found for that target in ${scoreboardName}.`);
  await prisma.scoreboardEntry.delete({ where: { id: existing.id } });
  await prisma.scoreboardAction.create({
    data: {
      scoreboardId: board.id,
      targetId,
      action: "DELETE_ENTRY",
      delta: 0,
      adminId,
      reason: "Entry removed",
    },
  });
  return getScoreboard(guildId, scoreboardName);
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

async function deleteScoreboard({ guildId, name }) {
  // Finds active or archived
  const board = await prisma.scoreboard.findFirst({
    where: { guildId, name: { equals: name, mode: "insensitive" } },
  });
  if (!board) throw new Error(`Scoreboard not found: ${name}`);
  await prisma.scoreboardEntry.deleteMany({
    where: { scoreboardId: board.id },
  });
  await prisma.scoreboardAction.deleteMany({
    where: { scoreboardId: board.id },
  });
  await prisma.scoreboard.delete({ where: { id: board.id } });
  return board;
}

async function renameScoreboard({ guildId, oldName, newName }) {
  const board = await prisma.scoreboard.findFirst({
    where: { guildId, name: { equals: oldName, mode: "insensitive" } },
  });
  if (!board) throw new Error(`Scoreboard not found: ${oldName}`);
  const conflict = await prisma.scoreboard.findFirst({
    where: {
      guildId,
      name: { equals: newName, mode: "insensitive" },
      id: { not: board.id },
    },
  });
  if (conflict)
    throw new Error(`A scoreboard named "${newName}" already exists.`);
  return prisma.scoreboard.update({
    where: { id: board.id },
    data: { name: newName, liveTitle: newName },
  });
}

async function setTheme({ guildId, name, color }) {
  const board =
    (await getScoreboard(guildId, name)) ||
    (await prisma.scoreboard.findFirst({
      where: {
        guildId,
        name: { equals: name, mode: "insensitive" },
        isArchived: true,
      },
    }));
  if (!board) throw new Error(`Scoreboard not found: ${name}`);
  return prisma.scoreboard.update({
    where: { id: board.id },
    data: { theme: color },
  });
}

async function setDescription({ guildId, name, description }) {
  const board = await getScoreboard(guildId, name);
  if (!board) throw new Error(`Scoreboard not found: ${name}`);
  return prisma.scoreboard.update({
    where: { id: board.id },
    data: { description },
  });
}

async function setTitle({ guildId, name, title }) {
  const board = await getScoreboard(guildId, name);
  if (!board) throw new Error(`Scoreboard not found: ${name}`);
  return prisma.scoreboard.update({
    where: { id: board.id },
    data: { liveTitle: title },
  });
}

async function getTargetScores({ guildId, targetId }) {
  const boards = await prisma.scoreboard.findMany({
    where: { guildId },
    include: { entries: { where: { targetId } } },
    orderBy: [{ isArchived: "asc" }, { name: "asc" }],
  });
  return boards
    .filter((b) => b.entries.length > 0)
    .map((b) => ({ board: b, entry: b.entries[0] }));
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

async function buildScoreboardEmbed(interaction, board) {
  const sorted = sortEntries(board);
  const MEDALS = ["🥇", "🥈", "🥉"];
  const metric = board.metric;

  const lines = sorted.slice(0, 15).map((entry, index) => {
    const medal = MEDALS[index] || `\`#${index + 1}\``;
    const mention =
      entry.targetType === "ROLE"
        ? `<@&${entry.targetId}>`
        : `<@${entry.targetId}>`;
    if (metric === "POINTS") {
      return `${medal} ${mention} — **${entry.points}** pts`;
    }
    if (metric === "WIN_STREAK") {
      return `${medal} ${mention} — 🔥 ${entry.winStreak} win streak • ${entry.wins}W / ${entry.losses}L`;
    }
    if (metric === "LOSS_STREAK") {
      return `${medal} ${mention} — 💀 ${entry.lossStreak} loss streak • ${entry.wins}W / ${entry.losses}L`;
    }
    if (metric === "RATIO") {
      return `${medal} ${mention} — ⚖️ ${ratio(entry.wins, entry.losses)} ratio • ${entry.wins}W / ${entry.losses}L`;
    }
    // WINS / LOSSES / SEASON / ALL_TIME
    const streak =
      entry.winStreak > 0
        ? `🔥 ${entry.winStreak}ws`
        : entry.lossStreak > 0
          ? `💀 ${entry.lossStreak}ls`
          : "";
    return `${medal} ${mention} — **${entry.wins}W / ${entry.losses}L** • Ratio ${ratio(entry.wins, entry.losses)}${streak ? ` • ${streak}` : ""}`;
  });

  const colorOverride = makeBoardColor(board);

  return createDiscoreEmbed(interaction, {
    title: `🏆 ${board.liveTitle || board.name}`,
    description: [
      board.description ? `*${board.description}*` : null,
      lines.length ? lines.join("\n") : "No entries yet.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    ...(colorOverride && { color: colorOverride }),
    fields: [
      { name: "Metric", value: board.metric, inline: true },
      { name: "Type", value: board.type, inline: true },
      {
        name: "Season",
        value: board.season != null ? String(board.season) : "—",
        inline: true,
      },
    ],
  });
}

module.exports = {
  createScoreboard,
  getScoreboard,
  getArchivedScoreboards,
  addResult,
  editEntry,
  deleteEntry,
  archiveScoreboard,
  restoreScoreboard,
  deleteScoreboard,
  renameScoreboard,
  mergeScoreboards,
  setTheme,
  setDescription,
  setTitle,
  getTargetScores,
  buildScoreboardEmbed,
};

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
