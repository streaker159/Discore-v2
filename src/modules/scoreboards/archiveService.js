"use strict";

const prisma = require("../../lib/prisma");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const logger = require("../../lib/logger");

const PAGE_SIZE = 10;

// ── Friendly Archive ID Generation ───────────────────────

function generateFriendlyArchiveId(archivedAt) {
  const d = new Date(archivedAt);
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `A-${year}${month}`;
  // The NNN suffix is assigned per-guild per-month during backfill
}

async function assignFriendlyArchiveId(guildId, boardId, archivedAt) {
  const prefix = generateFriendlyArchiveId(archivedAt);

  // Find the highest existing NNN for this prefix in this guild
  const existing = await prisma.scoreboard.findMany({
    where: {
      guildId,
      friendlyArchiveId: { startsWith: prefix },
    },
    select: { friendlyArchiveId: true },
    orderBy: { friendlyArchiveId: "desc" },
  });

  let nextNum = 1;
  if (existing.length > 0) {
    const last = existing[0].friendlyArchiveId;
    const parts = last.split("-");
    const num = parseInt(parts[2], 10);
    if (!isNaN(num)) nextNum = num + 1;
  }

  const friendlyId = `${prefix}-${String(nextNum).padStart(3, "0")}`;

  await prisma.scoreboard.update({
    where: { id: boardId },
    data: { friendlyArchiveId: friendlyId },
  });

  return friendlyId;
}

async function backfillAllArchives(guildId) {
  const orphans = await prisma.scoreboard.findMany({
    where: {
      guildId,
      isArchived: true,
      friendlyArchiveId: null,
      archivedAt: { not: null },
    },
    select: { id: true, archivedAt: true },
    orderBy: { archivedAt: "asc" },
  });

  let count = 0;
  for (const board of orphans) {
    await assignFriendlyArchiveId(guildId, board.id, board.archivedAt);
    count++;
  }

  if (count > 0) {
    logger.info("Archive backfill complete", { guildId, count });
  }
  return count;
}

// ── Archive Search & List ────────────────────────────────

async function searchArchives(guildId, filters = {}) {
  const { query, month, year, page = 1 } = filters;
  const where = { guildId, isArchived: true };

  // Month filter: YYYY-MM
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    where.archivedAt = { gte: start, lt: end };
  } else if (year) {
    const y = parseInt(year, 10);
    if (!isNaN(y)) {
      const start = new Date(Date.UTC(y, 0, 1));
      const end = new Date(Date.UTC(y + 1, 0, 1));
      where.archivedAt = { gte: start, lt: end };
    }
  }

  const boards = await prisma.scoreboard.findMany({
    where,
    include: { entries: true },
    orderBy: { archivedAt: "desc" },
  });

  let filtered = boards;

  // Text search: friendlyArchiveId, name, publicId
  if (query) {
    const lowerQuery = query.toLowerCase();
    filtered = boards.filter((b) => {
      if (b.friendlyArchiveId?.toLowerCase().includes(lowerQuery)) return true;
      if (b.name.toLowerCase().includes(lowerQuery)) return true;
      if (b.publicId?.toLowerCase().includes(lowerQuery)) return true;
      // Search by champion/top entry
      const sorted = sortEntries(b);
      if (sorted.length > 0) {
        const champ = sorted[0];
        const champId = stripSourcePrefix(champ.targetId).toLowerCase();
        const champName = (champ.targetName || "").toLowerCase();
        if (champId.includes(lowerQuery) || champName.includes(lowerQuery))
          return true;
      }
      return false;
    });
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  return { items: pageItems, total, page: safePage, totalPages };
}

// ── Archive lookup by ID ─────────────────────────────────

async function findArchiveById(guildId, identifier) {
  // Try exact match on friendlyArchiveId (case-insensitive)
  const byFriendly = await prisma.scoreboard.findFirst({
    where: {
      guildId,
      isArchived: true,
      friendlyArchiveId: { equals: identifier, mode: "insensitive" },
    },
    include: { entries: true },
  });
  if (byFriendly) return byFriendly;

  // Try prefix match (e.g., "202606-003" without A-)
  const byPartial = await prisma.scoreboard.findFirst({
    where: {
      guildId,
      isArchived: true,
      friendlyArchiveId: { endsWith: identifier, mode: "insensitive" },
    },
    include: { entries: true },
  });
  if (byPartial) return byPartial;

  // Try by publicId
  const byPublic = await prisma.scoreboard.findFirst({
    where: { guildId, isArchived: true, publicId: identifier },
    include: { entries: true },
  });
  if (byPublic) return byPublic;

  // Try by internal ID
  const byId = await prisma.scoreboard.findUnique({
    where: { id: identifier },
    include: { entries: true },
  });
  if (byId?.isArchived) return byId;

  return null;
}

// ── Archive list embed builder ───────────────────────────

function buildArchiveListEmbed(guild, result, filters = {}) {
  const embed = new EmbedBuilder()
    .setColor(0x1a7a9e)
    .setTitle("📦 Scoreboard Archives");

  let desc = "";
  if (filters.query) desc += `Search: **${filters.query}**\n`;
  if (filters.month) desc += `Month: **${filters.month}**\n`;

  if (result.items.length === 0) {
    desc += "\nNo archived scoreboards found.";
    embed.setDescription(desc);
    return embed;
  }

  const lines = result.items.map((b) => {
    const id = b.friendlyArchiveId || b.publicId || b.id.slice(0, 8);
    const date = b.archivedAt
      ? new Date(b.archivedAt).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "Unknown";
    const modeLabel = b.metric === "POINTS" ? "Points" : "Win/Loss";
    const sorted = sortEntries(b);
    const champ = sorted.length > 0 ? targetDisplayShort(sorted[0]) : "—";

    return (
      `\`${id}\` **${b.liveTitle || b.name}**\n` +
      `↳ Archived: ${date} · ${b.entries.length} entries · ${modeLabel} · 🏆 ${champ}`
    );
  });

  desc += lines.join("\n\n");
  desc += `\n\nPage ${result.page}/${result.totalPages} · ${result.total} archives`;

  embed.setDescription(desc);
  embed.setFooter({
    text: "Use /archive view <id> to open · /archive search <query> to find",
  });

  return embed;
}

function buildArchiveListButtons(result, filters = {}) {
  const { page, totalPages } = result;
  const queryParams = encodeURIComponent(JSON.stringify(filters));

  const rows = [];
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`archive_v2:page:${page - 1}:${queryParams}`)
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`archive_v2:page:${page + 1}:${queryParams}`)
      .setLabel("▶ Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId(`archive_v2:refresh:${queryParams}`)
      .setLabel("🔄 Refresh")
      .setStyle(ButtonStyle.Secondary),
  );
  rows.push(navRow);

  return rows;
}

// ── Archive view embed ───────────────────────────────────

function buildArchiveViewEmbed(board, guild) {
  const id = board.friendlyArchiveId || board.publicId || board.id.slice(0, 8);
  const sorted = sortEntries(board);
  const champ = sorted.length > 0 ? targetDisplayFull(sorted[0]) : "—";

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle(`📦 Archive ${id} — ${board.liveTitle || board.name}`)
    .setDescription(board.description || "No description")
    .addFields(
      {
        name: "Status",
        value: `📦 Archived at ${board.archivedAt ? `<t:${Math.floor(new Date(board.archivedAt).getTime() / 1000)}:f>` : "Unknown"}`,
        inline: true,
      },
      {
        name: "Original ID",
        value: board.publicId || board.id.slice(0, 8),
        inline: true,
      },
      {
        name: "Mode",
        value: board.metric === "POINTS" ? "Points" : "Win/Loss",
        inline: true,
      },
      {
        name: "Entries",
        value: String(board.entries.length),
        inline: true,
      },
      {
        name: "🏆 Champion",
        value: champ,
        inline: true,
      },
      {
        name: "Type",
        value:
          board.type === "ROLE"
            ? "Roles"
            : board.type === "CUSTOM"
              ? "Custom"
              : "Users",
        inline: true,
      },
    )
    .setFooter({
      text: `Archived by ${board.archivedBy || "Unknown"}${board.archiveNote ? " · " + board.archiveNote : ""}`,
    });

  // Show top entries if any
  if (sorted.length > 0) {
    const topEntries = sorted.slice(0, 5).map((e, i) => {
      const display = targetDisplayFull(e);
      const score =
        board.metric === "POINTS"
          ? `${e.points} pts`
          : `${e.wins}W / ${e.losses}L (${ratioCalc(e.wins, e.losses)})`;
      return `**#${i + 1}** ${display} — ${score}`;
    });
    embed.addFields({
      name: `📊 Top ${Math.min(5, sorted.length)} Entries`,
      value: topEntries.join("\n"),
      inline: false,
    });
  }

  return embed;
}

function buildArchiveViewButtons(board) {
  const rows = [];
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`archive_v2:restore:${board.id}`)
      .setLabel("♻️ Restore")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`archive_v2:add_result:${board.id}`)
      .setLabel("➕ Add Result")
      .setStyle(ButtonStyle.Primary),
  );
  rows.push(actionRow);
  return rows;
}

// ── Helpers ──────────────────────────────────────────────

function stripSourcePrefix(targetId) {
  if (!targetId) return "";
  if (targetId.includes("::")) return targetId.split("::").pop();
  return targetId;
}

function targetDisplayShort(entry) {
  const id = stripSourcePrefix(entry.targetId);
  if (entry.targetType === "ROLE") return `@${entry.targetName || id}`;
  if (entry.targetType === "USER") return entry.targetName || id;
  return entry.targetName || id;
}

function targetDisplayFull(entry) {
  const id = stripSourcePrefix(entry.targetId);
  if (entry.targetType === "ROLE") return `<@&${id}>`;
  if (entry.targetType === "USER") return `<@${id}>`;
  return entry.targetName || id;
}

function ratioCalc(wins, losses) {
  if (!losses) return wins ? wins.toFixed(2) : "0.00";
  return (wins / losses).toFixed(2);
}

function sortEntries(board) {
  const entries = [...(board.entries || [])];
  if (board.metric === "POINTS") {
    return entries.sort((a, b) => b.points - a.points);
  }
  return entries.sort((a, b) => {
    const ra = a.losses === 0 ? (a.wins > 0 ? 9999 : 0) : a.wins / a.losses;
    const rb = b.losses === 0 ? (b.wins > 0 ? 9999 : 0) : b.wins / b.losses;
    return rb - ra || b.wins - a.wins;
  });
}

// ── Archive add-result ───────────────────────────────────

async function addResultToArchive(
  guildId,
  archiveId,
  targetId,
  targetType,
  resultType,
  amount,
  adminId,
) {
  const board = await prisma.scoreboard.findFirst({
    where: {
      guildId,
      isArchived: true,
      OR: [
        { id: archiveId },
        { friendlyArchiveId: archiveId },
        { publicId: archiveId },
      ],
    },
    include: { entries: true },
  });
  if (!board) throw new Error("Archive not found.");

  const cleanTargetId =
    targetType !== "CUSTOM" ? targetId : `custom_${targetId || "unknown"}`;

  let entry = await prisma.scoreboardEntry.findFirst({
    where: { scoreboardId: board.id, targetId: cleanTargetId },
  });

  const data = entry
    ? {}
    : {
        scoreboardId: board.id,
        targetId: cleanTargetId,
        targetType: targetType || board.type,
        targetName: targetType === "CUSTOM" ? targetId : null,
      };

  if (resultType === "win") data.wins = (entry?.wins || 0) + (amount || 1);
  if (resultType === "loss") data.losses = (entry?.losses || 0) + (amount || 1);
  if (resultType === "points")
    data.points = (entry?.points || 0) + (amount || 1);

  if (entry) {
    entry = await prisma.scoreboardEntry.update({
      where: { id: entry.id },
      data,
    });
  } else {
    entry = await prisma.scoreboardEntry.create({ data });
  }

  // Log action
  await prisma.scoreboardAction.create({
    data: {
      scoreboardId: board.id,
      targetId: cleanTargetId,
      action: resultType.toUpperCase(),
      delta: amount || 1,
      adminId,
    },
  });

  // Update lastUpdatedAt
  await prisma.scoreboard.update({
    where: { id: board.id },
    data: { lastUpdatedAt: new Date() },
  });

  // Recalculate champion
  const refreshed = await prisma.scoreboard.findUnique({
    where: { id: board.id },
    include: { entries: true },
  });
  const sorted = sortEntries(refreshed);
  if (sorted.length > 0 && sorted[0].targetId !== board.lastLeaderId) {
    await prisma.scoreboard.update({
      where: { id: board.id },
      data: { lastLeaderId: sorted[0].targetId },
    });
  }

  return refreshed;
}

// ── Restore archive as new live board ────────────────────

async function restoreArchiveAsNew(boardId, guildId, newName, restoredBy) {
  const board = await prisma.scoreboard.findFirst({
    where: { id: boardId, guildId, isArchived: true },
    include: { entries: true },
  });
  if (!board) throw new Error("Archive not found.");

  // Create new live board
  const { getGuildPlan } = require("../../lib/premiumGate");
  const plan = await getGuildPlan(guildId);
  const maxLive = plan.maxScoreboards || 5;
  const currentLive = await prisma.scoreboard.count({
    where: { guildId, isArchived: false },
  });
  if (currentLive >= maxLive) {
    throw new Error(
      `Live scoreboard limit reached (${maxLive}). Archive some boards first.`,
    );
  }

  const newBoard = await prisma.scoreboard.create({
    data: {
      guildId,
      name: newName || board.name,
      metric: board.metric,
      type: board.type,
      theme: board.theme,
      liveTitle: board.liveTitle || board.name,
      description: board.description,
      hasCategories: board.hasCategories,
      roleImageUrl: board.roleImageUrl,
      brandingImageUrl: board.brandingImageUrl,
      restoredFromArchiveId: board.id,
    },
  });

  // Copy entries and score types
  for (const entry of board.entries) {
    await prisma.scoreboardEntry.create({
      data: {
        scoreboardId: newBoard.id,
        targetId: entry.targetId,
        targetType: entry.targetType,
        targetName: entry.targetName,
        wins: entry.wins,
        losses: entry.losses,
        points: entry.points,
        winStreak: entry.winStreak,
        lossStreak: entry.lossStreak,
        sourceScoreboardId: entry.sourceScoreboardId,
        sourceScoreboardName: entry.sourceScoreboardName,
      },
    });
  }

  // Copy score types
  const scoreTypes = await prisma.scoreboardScoreType.findMany({
    where: { scoreboardId: board.id },
  });
  for (const st of scoreTypes) {
    await prisma.scoreboardScoreType.create({
      data: {
        guildId,
        scoreboardId: newBoard.id,
        name: st.name,
        normalizedName: st.normalizedName,
      },
    });
  }

  // Log action
  await prisma.scoreboardAction.create({
    data: {
      scoreboardId: newBoard.id,
      targetId: restoredBy,
      action: "RESTORE",
      delta: 0,
      adminId: restoredBy,
      reason: `Restored from archive ${board.friendlyArchiveId || board.id}`,
    },
  });

  return newBoard;
}

module.exports = {
  PAGE_SIZE,
  generateFriendlyArchiveId,
  assignFriendlyArchiveId,
  backfillAllArchives,
  searchArchives,
  findArchiveById,
  buildArchiveListEmbed,
  buildArchiveListButtons,
  buildArchiveViewEmbed,
  buildArchiveViewButtons,
  addResultToArchive,
  restoreArchiveAsNew,
};
