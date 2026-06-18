"use strict";

const { randomBytes } = require("crypto");
const prisma = require("../../lib/prisma");
const { createDiscoreEmbed } = require("../../lib/embedBuilder");
const { getGuildPlan } = require("../../lib/premiumGate");
const { EmbedBuilder } = require("discord.js");

// ─── helpers ─────────────────────────────────────────────────────────────────

function genPublicId() {
  return randomBytes(4).toString("hex"); // 8 hex chars
}

function ratio(wins, losses) {
  if (!losses) return wins ? wins.toFixed(2) : "0.00";
  return (wins / losses).toFixed(2);
}

function sortEntries(board) {
  const metric = board.metric;
  return [...board.entries].sort((a, b) => {
    if (metric === "POINTS")      return b.points - a.points;
    if (metric === "LOSSES")      return b.losses - a.losses;
    if (metric === "RATIO")       return b.wins / Math.max(1, b.losses) - a.wins / Math.max(1, a.losses);
    if (metric === "WIN_STREAK")  return b.winStreak - a.winStreak;
    if (metric === "LOSS_STREAK") return b.lossStreak - a.lossStreak;
    return b.wins - a.wins; // WINS / SEASON / ALL_TIME / default
  });
}

function makeBoardColor(board) {
  if (!board.theme || board.theme === "default") return undefined;
  const clean = board.theme.replace("#", "");
  const parsed = parseInt(clean, 16);
  return Number.isFinite(parsed) ? parseInt(clean, 16) : undefined;
}

function entryLine(entry, position, metric) {
  const MEDALS = ["🥇", "🥈", "🥉"];
  const medal = MEDALS[position] ?? `\`#${position + 1}\``;
  const mention = entry.targetType === "ROLE"
    ? `<@&${entry.targetId}>`
    : `<@${entry.targetId}>`;

  if (metric === "POINTS")
    return `${medal} ${mention} — **${entry.points}** pts`;
  if (metric === "WIN_STREAK")
    return `${medal} ${mention} — 🔥 ${entry.winStreak} ws · ${entry.wins}W / ${entry.losses}L`;
  if (metric === "LOSS_STREAK")
    return `${medal} ${mention} — 💀 ${entry.lossStreak} ls · ${entry.wins}W / ${entry.losses}L`;
  if (metric === "RATIO")
    return `${medal} ${mention} — ⚖️ ${ratio(entry.wins, entry.losses)} ratio · ${entry.wins}W / ${entry.losses}L`;

  const streak = entry.winStreak > 1 ? ` 🔥${entry.winStreak}ws` : entry.lossStreak > 1 ? ` 💀${entry.lossStreak}ls` : "";
  return `${medal} ${mention} — **${entry.wins}W / ${entry.losses}L** · ${ratio(entry.wins, entry.losses)} ratio${streak}`;
}

// ─── reads ────────────────────────────────────────────────────────────────────

async function getScoreboard(guildId, name) {
  return prisma.scoreboard.findFirst({
    where: { guildId, name: { equals: name, mode: "insensitive" }, isArchived: false },
    include: { entries: true },
  });
}

async function getScoreboardById(id) {
  return prisma.scoreboard.findUnique({ where: { id }, include: { entries: true } });
}

async function getScoreboardByPublicId(publicId) {
  return prisma.scoreboard.findUnique({ where: { publicId }, include: { entries: true } });
}

async function listActiveScoreboards(guildId) {
  return prisma.scoreboard.findMany({
    where: { guildId, isArchived: false },
    include: { entries: true },
    orderBy: { name: "asc" },
  });
}

async function getArchivedScoreboards(guildId) {
  return prisma.scoreboard.findMany({
    where: { guildId, isArchived: true },
    include: { entries: true },
    orderBy: { archivedAt: "desc" },
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

// ─── writes ───────────────────────────────────────────────────────────────────

async function createScoreboard({ guildId, name, metric, type, channelId, description, createdBy }) {
  const plan = await getGuildPlan(guildId);
  const activeCount = await prisma.scoreboard.count({ where: { guildId, isArchived: false } });
  if (activeCount >= plan.limits.liveScoreboards) {
    throw new Error(`Live scoreboard limit reached for ${plan.tier} (${plan.limits.liveScoreboards}).`);
  }

  const conflict = await prisma.scoreboard.findFirst({
    where: { guildId, name: { equals: name, mode: "insensitive" }, isArchived: false },
  });
  if (conflict) throw new Error(`A scoreboard named "${name}" already exists.`);

  return prisma.scoreboard.create({
    data: {
      guildId,
      publicId: genPublicId(),
      name,
      metric,
      type,
      channelId: channelId || null,
      liveTitle: name,
      description: description || null,
      actions: { create: { targetId: guildId, action: "CREATE", delta: 0, adminId: createdBy } },
    },
    include: { entries: true },
  });
}

async function addResult({ guildId, scoreboardName, targetId, targetType = "USER", action, delta = 1, adminId, reason }) {
  const board = await getScoreboard(guildId, scoreboardName);
  if (!board) throw new Error(`Scoreboard not found: "${scoreboardName}"`);

  const updateData =
    action === "WIN"
      ? { wins: { increment: delta }, winStreak: { increment: 1 }, lossStreak: 0 }
      : action === "LOSS"
      ? { losses: { increment: delta }, lossStreak: { increment: 1 }, winStreak: 0 }
      : { points: { increment: delta } };

  const entry = await prisma.scoreboardEntry.upsert({
    where: { scoreboardId_targetId: { scoreboardId: board.id, targetId } },
    update: updateData,
    create: {
      scoreboardId: board.id,
      targetId,
      targetType,
      wins:       action === "WIN"   ? delta : 0,
      losses:     action === "LOSS"  ? delta : 0,
      points:     action === "POINT" ? delta : 0,
      winStreak:  action === "WIN"   ? 1     : 0,
      lossStreak: action === "LOSS"  ? 1     : 0,
    },
  });

  await prisma.$transaction([
    prisma.scoreboardAction.create({
      data: { scoreboardId: board.id, targetId, action, delta, adminId, reason: reason || null },
    }),
    prisma.scoreboard.update({
      where: { id: board.id },
      data: { lastUpdatedAt: new Date(), repairStatus: "OK" },
    }),
  ]);

  // Prune action log — keep latest 200 per board
  const oldest = await prisma.scoreboardAction.findMany({
    where: { scoreboardId: board.id },
    orderBy: { createdAt: "desc" },
    skip: 200,
    select: { id: true },
  });
  if (oldest.length) {
    await prisma.scoreboardAction.deleteMany({ where: { id: { in: oldest.map((r) => r.id) } } });
  }

  const updatedBoard = await getScoreboard(guildId, scoreboardName);

  // Leader-change detection
  const sorted = sortEntries(updatedBoard);
  const newLeaderId = sorted[0]?.targetId ?? null;
  let leaderChange = null;
  if (newLeaderId && newLeaderId !== board.lastLeaderId) {
    await prisma.scoreboard.update({ where: { id: board.id }, data: { lastLeaderId: newLeaderId } });
    leaderChange = { newLeaderId, oldLeaderId: board.lastLeaderId };
  }

  return { board: updatedBoard, entry, leaderChange };
}

async function editEntry({ guildId, scoreboardName, targetId, targetType = "USER", wins, losses, points, winStreak, lossStreak, adminId }) {
  const board = await getScoreboard(guildId, scoreboardName);
  if (!board) throw new Error(`Scoreboard not found: "${scoreboardName}"`);

  const updateData = {};
  if (wins       !== undefined) updateData.wins       = wins;
  if (losses     !== undefined) updateData.losses     = losses;
  if (points     !== undefined) updateData.points     = points;
  if (winStreak  !== undefined) updateData.winStreak  = winStreak;
  if (lossStreak !== undefined) updateData.lossStreak = lossStreak;

  const existing = board.entries.find((e) => e.targetId === targetId);
  let entry;
  if (existing) {
    entry = await prisma.scoreboardEntry.update({ where: { id: existing.id }, data: updateData });
  } else {
    entry = await prisma.scoreboardEntry.create({
      data: { scoreboardId: board.id, targetId, targetType, wins: 0, losses: 0, points: 0, winStreak: 0, lossStreak: 0, ...updateData },
    });
  }

  await prisma.$transaction([
    prisma.scoreboardAction.create({
      data: { scoreboardId: board.id, targetId, action: "EDIT", delta: 0, adminId, reason: "Manual edit" },
    }),
    prisma.scoreboard.update({ where: { id: board.id }, data: { lastUpdatedAt: new Date() } }),
  ]);

  return { board: await getScoreboard(guildId, scoreboardName), entry };
}

async function deleteEntry({ guildId, scoreboardName, targetId, adminId }) {
  const board = await getScoreboard(guildId, scoreboardName);
  if (!board) throw new Error(`Scoreboard not found: "${scoreboardName}"`);
  const existing = board.entries.find((e) => e.targetId === targetId);
  if (!existing) throw new Error(`No entry found for that target in "${scoreboardName}".`);

  await prisma.scoreboardEntry.delete({ where: { id: existing.id } });
  await prisma.scoreboardAction.create({
    data: { scoreboardId: board.id, targetId, action: "DELETE_ENTRY", delta: 0, adminId, reason: "Entry removed" },
  });
  return getScoreboard(guildId, scoreboardName);
}

async function renameScoreboard({ guildId, oldName, newName }) {
  const board = await prisma.scoreboard.findFirst({
    where: { guildId, name: { equals: oldName, mode: "insensitive" } },
  });
  if (!board) throw new Error(`Scoreboard not found: "${oldName}"`);

  const conflict = await prisma.scoreboard.findFirst({
    where: { guildId, name: { equals: newName, mode: "insensitive" }, id: { not: board.id } },
  });
  if (conflict) throw new Error(`A scoreboard named "${newName}" already exists.`);

  return prisma.scoreboard.update({ where: { id: board.id }, data: { name: newName, liveTitle: newName } });
}

async function setTheme({ guildId, name, color }) {
  const board = await prisma.scoreboard.findFirst({
    where: { guildId, name: { equals: name, mode: "insensitive" } },
  });
  if (!board) throw new Error(`Scoreboard not found: "${name}"`);
  return prisma.scoreboard.update({ where: { id: board.id }, data: { theme: color } });
}

async function setDescription({ guildId, name, description }) {
  const board = await getScoreboard(guildId, name);
  if (!board) throw new Error(`Scoreboard not found: "${name}"`);
  return prisma.scoreboard.update({ where: { id: board.id }, data: { description } });
}

async function setTitle({ guildId, name, title }) {
  const board = await getScoreboard(guildId, name);
  if (!board) throw new Error(`Scoreboard not found: "${name}"`);
  return prisma.scoreboard.update({ where: { id: board.id }, data: { liveTitle: title } });
}

async function setRoleImage({ guildId, name, imageUrl }) {
  const board = await getScoreboard(guildId, name);
  if (!board) throw new Error(`Scoreboard not found: "${name}"`);
  return prisma.scoreboard.update({ where: { id: board.id }, data: { roleImageUrl: imageUrl || null } });
}

// ─── archive ──────────────────────────────────────────────────────────────────

async function archiveScoreboard({ guildId, name, archivedBy, archiveNote }) {
  const board = await getScoreboard(guildId, name);
  if (!board) throw new Error(`Scoreboard not found: "${name}"`);
  return prisma.scoreboard.update({
    where: { id: board.id },
    data: {
      isArchived: true,
      archivedAt: new Date(),
      archivedBy: archivedBy || null,
      archiveNote: archiveNote || null,
      messageId: null, // detach live message
    },
    include: { entries: true },
  });
}

async function restoreScoreboard({ guildId, name }) {
  const board = await prisma.scoreboard.findFirst({
    where: { guildId, name: { equals: name, mode: "insensitive" }, isArchived: true },
    include: { entries: true },
  });
  if (!board) throw new Error(`No archived scoreboard found: "${name}"`);

  const plan = await getGuildPlan(guildId);
  const activeCount = await prisma.scoreboard.count({ where: { guildId, isArchived: false } });
  if (activeCount >= plan.limits.liveScoreboards) {
    throw new Error(`Live scoreboard limit reached for ${plan.tier} (${plan.limits.liveScoreboards}).`);
  }

  return prisma.scoreboard.update({
    where: { id: board.id },
    data: { isArchived: false, archivedAt: null, archivedBy: null, archiveNote: null },
    include: { entries: true },
  });
}

async function deleteScoreboard({ guildId, name }) {
  const board = await prisma.scoreboard.findFirst({
    where: { guildId, name: { equals: name, mode: "insensitive" } },
  });
  if (!board) throw new Error(`Scoreboard not found: "${name}"`);

  await prisma.$transaction([
    prisma.scoreboardEntry.deleteMany({ where: { scoreboardId: board.id } }),
    prisma.scoreboardAction.deleteMany({ where: { scoreboardId: board.id } }),
    prisma.scoreboard.delete({ where: { id: board.id } }),
  ]);
  return board;
}

async function mergeScoreboards({ guildId, sourceName, targetName, adminId }) {
  const source = await getScoreboard(guildId, sourceName);
  const target = await getScoreboard(guildId, targetName);
  if (!source) throw new Error(`Source scoreboard not found: "${sourceName}"`);
  if (!target) throw new Error(`Target scoreboard not found: "${targetName}"`);

  for (const entry of source.entries) {
    await prisma.scoreboardEntry.upsert({
      where: { scoreboardId_targetId: { scoreboardId: target.id, targetId: entry.targetId } },
      update: { wins: { increment: entry.wins }, losses: { increment: entry.losses }, points: { increment: entry.points } },
      create: {
        scoreboardId: target.id,
        targetId: entry.targetId,
        targetType: entry.targetType,
        wins: entry.wins, losses: entry.losses, points: entry.points,
        winStreak: entry.winStreak, lossStreak: entry.lossStreak,
      },
    });
  }

  await prisma.$transaction([
    prisma.scoreboardAction.create({
      data: { scoreboardId: target.id, targetId: guildId, action: "MERGE", delta: 0, adminId, reason: `Merged from "${sourceName}"` },
    }),
    prisma.scoreboard.update({
      where: { id: source.id },
      data: { isArchived: true, archivedAt: new Date(), archivedBy: adminId, archiveNote: `Merged into "${targetName}"`, messageId: null },
    }),
    prisma.scoreboard.update({ where: { id: target.id }, data: { lastUpdatedAt: new Date() } }),
  ]);

  return getScoreboard(guildId, targetName);
}

// ─── live embed helpers ───────────────────────────────────────────────────────

const PAGE_SIZE = 15;

/**
 * Build paginated scoreboard embed (page is 1-based).
 * Returns { embed, page, totalPages }.
 */
function buildScoreboardPage(board, page = 1) {
  const sorted = sortEntries(board);
  const total  = sorted.length;
  const pages  = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safeP  = Math.min(Math.max(page, 1), pages);
  const slice  = sorted.slice((safeP - 1) * PAGE_SIZE, safeP * PAGE_SIZE);
  const lines  = slice.map((entry, i) => entryLine(entry, (safeP - 1) * PAGE_SIZE + i, board.metric));
  const color  = makeBoardColor(board);

  const footerParts = [
    board.isArchived && `📦 Archived${board.archivedAt ? ` ${new Date(board.archivedAt).toLocaleDateString()}` : ""}`,
    board.archiveNote,
    total > PAGE_SIZE && `Page ${safeP}/${pages}  ·  ${total} entries`,
    board.publicId && `ID: ${board.publicId}`,
  ].filter(Boolean);

  const desc = [
    board.description && `*${board.description}*`,
    lines.length ? lines.join("\n") : "_No entries yet._",
  ].filter(Boolean).join("\n\n");

  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${board.liveTitle || board.name}`)
    .setDescription(desc)
    .setColor(color ?? 0x1a7a9e)
    .addFields(
      { name: "Metric", value: board.metric,   inline: true },
      { name: "Type",   value: board.type,     inline: true },
      { name: "Season", value: board.season != null ? String(board.season) : "—", inline: true },
    )
    .setFooter({ text: footerParts.join("  ·  ") || "Powered by Discore" })
    .setTimestamp();

  if (board.roleImageUrl) embed.setThumbnail(board.roleImageUrl);

  return { embed, page: safeP, totalPages: pages };
}

function buildScoreboardEmbedDirect(board) {
  return buildScoreboardPage(board, 1).embed;
}

/** Legacy — keeps existing command handlers working */
async function buildScoreboardEmbed(_interaction, board) {
  return buildScoreboardEmbedDirect(board);
}

/**
 * Push live embed to the board's channel. If message is gone, recreate it.
 * Returns: "updated" | "recreated" | "no_channel" | "no_perms" | "failed"
 */
async function pushLiveEmbed(client, board) {
  if (!board.channelId) return "no_channel";

  const ch = await client.channels.fetch(board.channelId).catch(() => null);
  if (!ch) {
    await prisma.scoreboard.update({
      where: { id: board.id },
      data: { repairStatus: "NEEDS_REPAIR", messageId: null },
    }).catch(() => null);
    return "no_channel";
  }

  const me = ch.guild?.members?.me;
  if (me && !ch.permissionsFor(me)?.has("SendMessages")) {
    await prisma.scoreboard.update({ where: { id: board.id }, data: { repairStatus: "NEEDS_REPAIR" } }).catch(() => null);
    return "no_perms";
  }

  const embed = buildScoreboardEmbedDirect(board);

  if (board.messageId) {
    const msg = await ch.messages.fetch(board.messageId).catch(() => null);
    if (msg) {
      const ok = await msg.edit({ embeds: [embed] }).then(() => true).catch(() => false);
      if (ok) return "updated";
    }
  }

  // Message gone — recreate
  const newMsg = await ch.send({ embeds: [embed] }).catch(() => null);
  if (newMsg) {
    await prisma.scoreboard.update({ where: { id: board.id }, data: { messageId: newMsg.id, repairStatus: "OK" } }).catch(() => null);
    return "recreated";
  }

  await prisma.scoreboard.update({ where: { id: board.id }, data: { repairStatus: "NEEDS_REPAIR" } }).catch(() => null);
  return "failed";
}

/**
 * Diagnose and repair a live scoreboard.
 * Returns: "OK" | "CHANNEL_MISSING" | "NO_PERMS" | "REPAIRED" | "NO_CHANNEL"
 */
async function repairLiveEmbed(client, boardId) {
  const board = await getScoreboardById(boardId);
  if (!board?.channelId) return "NO_CHANNEL";

  const ch = await client.channels.fetch(board.channelId).catch(() => null);
  if (!ch) {
    await prisma.scoreboard.update({ where: { id: boardId }, data: { repairStatus: "NEEDS_REPAIR", messageId: null } });
    return "CHANNEL_MISSING";
  }

  const me = ch.guild?.members?.me;
  if (me && !ch.permissionsFor(me)?.has("SendMessages")) {
    await prisma.scoreboard.update({ where: { id: boardId }, data: { repairStatus: "NEEDS_REPAIR" } });
    return "NO_PERMS";
  }

  const embed = buildScoreboardEmbedDirect(board);
  let msg = board.messageId ? await ch.messages.fetch(board.messageId).catch(() => null) : null;

  if (msg) {
    await msg.edit({ embeds: [embed] }).catch(() => null);
  } else {
    const newMsg = await ch.send({ embeds: [embed] }).catch(() => null);
    if (newMsg) {
      await prisma.scoreboard.update({ where: { id: boardId }, data: { messageId: newMsg.id } });
    }
  }

  await prisma.scoreboard.update({ where: { id: boardId }, data: { repairStatus: "OK" } });
  return "REPAIRED";
}

// ─── exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // reads
  getScoreboard,
  getScoreboardById,
  getScoreboardByPublicId,
  listActiveScoreboards,
  getArchivedScoreboards,
  getTargetScores,
  // writes
  createScoreboard,
  addResult,
  editEntry,
  deleteEntry,
  renameScoreboard,
  setTheme,
  setDescription,
  setTitle,
  setRoleImage,
  // archive
  archiveScoreboard,
  restoreScoreboard,
  deleteScoreboard,
  mergeScoreboards,
  // live embed
  pushLiveEmbed,
  repairLiveEmbed,
  // embeds
  buildScoreboardPage,
  buildScoreboardEmbedDirect,
  buildScoreboardEmbed,
  // helpers
  sortEntries,
  PAGE_SIZE,
};
