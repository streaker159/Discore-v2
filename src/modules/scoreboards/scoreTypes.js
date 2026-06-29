"use strict";

const prisma = require("../../lib/prisma");
const { hasActivePremium } = require("./service");

const MAX_SCORE_TYPES = 10;

// ─── Normalize name ───────────────────────────────────────────────────────────

function normalizeTypeName(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function validateTypeName(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return { error: "Score type name cannot be empty." };
  if (trimmed.length > 32)
    return { error: "Score type name must be 32 characters or fewer." };
  return { name: trimmed, normalized: normalizeTypeName(raw) };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

async function getScoreTypes(scoreboardId) {
  return prisma.scoreboardScoreType.findMany({
    where: { scoreboardId },
    orderBy: { name: "asc" },
  });
}

async function findOrCreateScoreType(guildId, scoreboardId, rawName) {
  const validation = validateTypeName(rawName);
  if (validation.error) throw new Error(validation.error);

  const normalized = validation.normalized;
  const existing = await prisma.scoreboardScoreType.findUnique({
    where: {
      scoreboardId_normalizedName: { scoreboardId, normalizedName: normalized },
    },
  });
  if (existing) return existing;

  // Check capacity
  const count = await prisma.scoreboardScoreType.count({
    where: { scoreboardId },
  });
  if (count >= MAX_SCORE_TYPES) {
    throw new Error(
      `This scoreboard already has ${MAX_SCORE_TYPES} score categories. Use an existing category or remove one first.`,
    );
  }

  try {
    return await prisma.scoreboardScoreType.create({
      data: {
        guildId,
        scoreboardId,
        name: validation.name,
        normalizedName: normalized,
      },
    });
  } catch (err) {
    // Race condition: another admin created the same type simultaneously
    if (
      err?.code === "P2002" &&
      err?.meta?.target?.includes("normalizedName")
    ) {
      return prisma.scoreboardScoreType.findUnique({
        where: {
          scoreboardId_normalizedName: {
            scoreboardId,
            normalizedName: normalized,
          },
        },
      });
    }
    throw err;
  }
}

// ─── Add categorized result ──────────────────────────────────────────────────

async function addCategorizedResult({
  guildId,
  scoreboardId,
  scoreboardEntryId,
  targetId,
  rawScoreType,
  action,
  delta = 1,
}) {
  if (!rawScoreType) return null; // no category → skip

  const premium = await hasActivePremium(guildId);
  if (!premium) {
    throw new Error(
      "Premium is required to add category scores. Your existing category stats are still visible, but new categorized results are locked until premium is active.",
    );
  }

  const scoreType = await findOrCreateScoreType(
    guildId,
    scoreboardId,
    rawScoreType,
  );

  const updateData =
    action === "WIN"
      ? { wins: { increment: delta } }
      : action === "LOSS"
        ? { losses: { increment: delta } }
        : { points: { increment: delta } };

  const createData = {
    guildId,
    scoreboardId,
    scoreboardEntryId,
    scoreTypeId: scoreType.id,
    wins: action === "WIN" ? delta : 0,
    losses: action === "LOSS" ? delta : 0,
    points: action === "POINT" ? delta : 0,
  };

  return prisma.scoreboardEntryTypeStats.upsert({
    where: {
      scoreboardEntryId_scoreTypeId: {
        scoreboardEntryId,
        scoreTypeId: scoreType.id,
      },
    },
    update: updateData,
    create: createData,
  });
}

// ─── Read type stats ──────────────────────────────────────────────────────────

async function getEntryTypeStats(scoreboardEntryId) {
  return prisma.scoreboardEntryTypeStats.findMany({
    where: { scoreboardEntryId },
    include: { scoreType: true },
  });
}

async function getBoardTypeStats(scoreboardId) {
  return prisma.scoreboardEntryTypeStats.findMany({
    where: { scoreboardId },
    include: { scoreType: true },
  });
}

// ─── Build type breakdown for a single entry ──────────────────────────────────

function buildEntryTypeBreakdown(entryTypeStats, maxLines = 5) {
  const lines = [];
  for (const stat of entryTypeStats) {
    const name = stat.scoreType?.name || "Unknown";
    if (stat.wins || stat.losses) {
      const r = stat.losses
        ? (stat.wins / stat.losses).toFixed(2)
        : stat.wins > 0
          ? stat.wins.toFixed(2)
          : "—";
      lines.push(
        `• ${name}: \` 🏆 ${stat.wins}W \` \` 💀 ${stat.losses}L \` \` ⚖️ ${r} Ratio \``,
      );
    } else if (stat.points) {
      lines.push(`• ${name}: \` 💯 ${stat.points} pts \``);
    }
  }
  if (maxLines && lines.length > maxLines) {
    const shown = lines.slice(0, maxLines);
    shown.push(`+${lines.length - maxLines} more types`);
    return shown;
  }
  return lines;
}

// ─── Build score type dropdown options ────────────────────────────────────────

async function buildScoreTypeSelectOptions(
  boardId,
  currentTypeId,
  { StringSelectMenuOptionBuilder } = {},
) {
  const types = await getScoreTypes(boardId);
  if (!types.length) return [];

  const { StringSelectMenuOptionBuilder: Builder } = require("discord.js");

  const options = [
    new Builder()
      .setLabel("Overall")
      .setDescription("Combined leaderboard across all score types")
      .setValue("overall")
      .setDefault(currentTypeId === "overall" || !currentTypeId),
  ];

  for (const t of types) {
    options.push(
      new Builder()
        .setLabel(t.name.substring(0, 25))
        .setDescription(`Filter by ${t.name}`)
        .setValue(t.id)
        .setDefault(currentTypeId === t.id),
    );
  }

  return options;
}

module.exports = {
  MAX_SCORE_TYPES,
  normalizeTypeName,
  validateTypeName,
  getScoreTypes,
  findOrCreateScoreType,
  addCategorizedResult,
  getEntryTypeStats,
  getBoardTypeStats,
  buildEntryTypeBreakdown,
  buildScoreTypeSelectOptions,
};
