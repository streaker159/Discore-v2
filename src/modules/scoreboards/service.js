"use strict";

const { randomBytes } = require("crypto");
const {
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const prisma = require("../../lib/prisma");
const { getGuildPlan } = require("../../lib/premiumGate");

// ─── helpers ─────────────────────────────────────────────────────────────────

function genPublicId() {
  return randomBytes(4).toString("hex");
}

function ratio(wins, losses) {
  if (!losses) return wins ? wins.toFixed(2) : "0.00";
  return (wins / losses).toFixed(2);
}

function sortEntries(board, sortBy = "WINS") {
  if (board.metric === "POINTS")
    return [...board.entries].sort((a, b) => b.points - a.points);
  const r = (e) =>
    e.losses === 0 ? (e.wins > 0 ? 9999 : 0) : e.wins / e.losses;
  if (sortBy === "RATIO")
    return [...board.entries].sort((a, b) => r(b) - r(a) || b.wins - a.wins);
  if (sortBy === "LOSSES")
    return [...board.entries].sort(
      (a, b) => b.losses - a.losses || r(b) - r(a),
    );
  // Default WINS
  return [...board.entries].sort((a, b) => b.wins - a.wins || r(b) - r(a));
}

function makeBoardColor(board) {
  if (!board.theme || board.theme === "default") return 0x1a7a9e;
  const clean = board.theme.replace("#", "");
  const parsed = parseInt(clean, 16);
  return Number.isFinite(parsed) ? parsed : 0x1a7a9e;
}

// ─── entry embed ─────────────────────────────────────────────────────────────

/**
 * Build the per-target score embed (posted in the team/role channel).
 * Matches the Python bot style exactly.
 */
function buildEntryEmbed(
  board,
  entry,
  targetMention,
  targetName,
  targetColor,
  opts = {},
) {
  const { discoreIconUrl } = opts;
  const color =
    targetColor && targetColor !== 0 ? targetColor : makeBoardColor(board);
  const tsUnix = entry?.updatedAt
    ? Math.floor(new Date(entry.updatedAt).getTime() / 1000)
    : null;

  let fields;
  if (board.metric === "POINTS") {
    fields = [
      { name: "💯 Points", value: `\`${entry?.points ?? 0}\``, inline: true },
    ];
  } else {
    const r = ratio(entry?.wins ?? 0, entry?.losses ?? 0);
    const ws = entry?.winStreak ?? 0;
    const ls = entry?.lossStreak ?? 0;
    const streakName =
      ws > 1 ? "🔥 Win Streak" : ls > 1 ? "💀 Loss Streak" : "Streak";
    const streakValue = ws > 1 ? `\`${ws}\`` : ls > 1 ? `\`${ls}\`` : "`—`";
    fields = [
      { name: "🏆 Wins", value: `\`${entry?.wins ?? 0}\``, inline: true },
      { name: "☠️ Losses", value: `\`${entry?.losses ?? 0}\``, inline: true },
      { name: "⚖️ Ratio", value: `\`${r}\``, inline: true },
      { name: streakName, value: streakValue, inline: true },
    ];
  }

  const descParts = [
    `**${board.liveTitle || board.name}**`,
    board.description ? `*${board.description}*` : null,
    tsUnix ? `⏰ Last updated <t:${tsUnix}:R>` : null,
  ].filter(Boolean);

  return new EmbedBuilder()
    .setAuthor({
      name: `📊 Score update · ${board.liveTitle || board.name}`,
      iconURL: discoreIconUrl || undefined,
    })
    .setTitle(targetName)
    .setColor(color)
    .setDescription(descParts.join("\n"))
    .addFields(fields)
    .setFooter({
      text: "Powered by Discore",
      iconURL: discoreIconUrl || undefined,
    })
    .setTimestamp();
}

// ─── scoreboard list embed ────────────────────────────────────────────────────

const PAGE_SIZE = 10;
const DIVIDER = "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬";

function buildScoreboardPage(board, page = 1, opts = {}) {
  const { guildIconUrl, discoreIconUrl, sortBy = "WINS" } = opts;
  const sorted = sortEntries(board, sortBy);
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safeP = Math.min(Math.max(page, 1), pages);
  const slice = sorted.slice((safeP - 1) * PAGE_SIZE, safeP * PAGE_SIZE);
  const MEDALS = ["🥇", "🥈", "🥉"];

  const lines = slice.map((entry, i) => {
    const pos = (safeP - 1) * PAGE_SIZE + i;
    const medal = MEDALS[pos] ?? `\`${pos + 1}.\``;
    const mention =
      entry.targetType === "ROLE"
        ? `<@&${entry.targetId}>`
        : `<@${entry.targetId}>`;

    if (board.metric === "POINTS") {
      return `${medal}  ${mention}\n> 💯 \`${entry.points}\` pts`;
    }
    const streakBit =
      entry.winStreak > 1
        ? `  🔥 \`${entry.winStreak}\` ws`
        : entry.lossStreak > 1
          ? `  💀 \`${entry.lossStreak}\` ls`
          : "";
    const r = ratio(entry.wins, entry.losses);
    return `${medal}  ${mention}\n> \`${entry.wins}W\` / \`${entry.losses}L\`  ·  ⚖️ \`${r}\`${streakBit}`;
  });

  const archiveLine = board.isArchived
    ? `📦 **Archived**${
        board.archivedAt
          ? " · " + new Date(board.archivedAt).toLocaleDateString()
          : ""
      }${board.archiveNote ? " — " + board.archiveNote : ""}`
    : null;

  const descParts = [
    board.description ? `*${board.description}*` : null,
    archiveLine,
    lines.length
      ? lines.join("\n")
      : "_No entries yet.  Use `/scoreboard addwin` to get started._",
  ].filter(Boolean);

  const lastUpdatedUnix = board.lastUpdatedAt
    ? Math.floor(new Date(board.lastUpdatedAt).getTime() / 1000)
    : null;

  const modeLabel = board.metric === "POINTS" ? "💯 Points" : "⚔️ Win / Loss";
  const typeLabel = board.type === "ROLE" ? "👥 Roles" : "👤 Users";
  const sortLabel =
    board.metric !== "POINTS"
      ? sortBy === "RATIO"
        ? "sorted by ratio"
        : sortBy === "LOSSES"
          ? "sorted by losses"
          : "sorted by wins"
      : null;

  const footerParts = [
    modeLabel,
    typeLabel,
    `${total} ${total === 1 ? "entry" : "entries"}`,
    total > PAGE_SIZE && `Page ${safeP}/${pages}`,
    sortLabel,
    board.publicId && `ID: ${board.publicId}`,
    lastUpdatedUnix && `Updated <t:${lastUpdatedUnix}:R>`,
  ].filter(Boolean);

  const embed = new EmbedBuilder()
    .setTitle(`🏆  ${board.liveTitle || board.name}`)
    .setDescription(descParts.join("\n"))
    .setColor(makeBoardColor(board))
    .setFooter({
      text: footerParts.join("  ·  "),
      iconURL: discoreIconUrl || undefined,
    })
    .setTimestamp();

  if (board.roleImageUrl) embed.setThumbnail(board.roleImageUrl);
  else if (guildIconUrl) embed.setThumbnail(guildIconUrl);

  return { embed, page: safeP, totalPages: pages };
}

/**
 * Build the action row components for a scoreboard display.
 * Sort row (WIN_LOSS boards) + optional pagination row.
 */
function buildScoreboardComponents(
  boardId,
  page,
  totalPages,
  metric,
  sortBy = "WINS",
) {
  const rows = [];

  if (metric === "WIN_LOSS") {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`scoreboard:sort:${boardId}:${page}:WINS`)
          .setLabel("🏆 Most Wins")
          .setStyle(
            sortBy === "WINS" ? ButtonStyle.Primary : ButtonStyle.Secondary,
          ),
        new ButtonBuilder()
          .setCustomId(`scoreboard:sort:${boardId}:${page}:RATIO`)
          .setLabel("⚖️ Best Ratio")
          .setStyle(
            sortBy === "RATIO" ? ButtonStyle.Primary : ButtonStyle.Secondary,
          ),
        new ButtonBuilder()
          .setCustomId(`scoreboard:sort:${boardId}:${page}:LOSSES`)
          .setLabel("💀 Most Losses")
          .setStyle(
            sortBy === "LOSSES" ? ButtonStyle.Primary : ButtonStyle.Secondary,
          ),
        new ButtonBuilder()
          .setCustomId(`scoreboard:refresh:${boardId}:${page}:${sortBy}`)
          .setLabel("🔄 Refresh")
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  } else {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`scoreboard:refresh:${boardId}:${page}:POINTS`)
          .setLabel("🔄 Refresh")
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  if (totalPages > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`scoreboard:page:${boardId}:${page - 1}:${sortBy}`)
          .setLabel("◀  Prev")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId(`scoreboard:page:${boardId}:${page + 1}:${sortBy}`)
          .setLabel("Next  ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages),
      ),
    );
  }

  return rows;
}

function buildScoreboardEmbedDirect(board) {
  return buildScoreboardPage(board, 1).embed;
}

async function buildScoreboardEmbed(_interaction, board) {
  return buildScoreboardEmbedDirect(board);
}

// ─── find team channel ────────────────────────────────────────────────────────

const SCORE_KEYWORDS = [
  "score",
  "scoreboard",
  "points",
  "stats",
  "ranking",
  "results",
  "bravo",
  "alpha",
  "team",
  "vein",
  "wolf",
  "shark",
  "dolphin",
];

function norm(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Find the best channel to post a live score embed for a role/user.
 * Priority:
 *  1. Private channel only target can see, name contains target name
 *  2. Any private channel only target can see
 *  3. Public channel whose name contains the target name
 *  4. Public channel with a score keyword in name
 *  5. First channel the target can send messages in
 */
function findTeamChannel(guild, targetObj) {
  try {
    const me = guild.members.me;
    const channels = guild.channels.cache.filter(
      (ch) => ch.isTextBased() && !ch.isThread(),
    );
    const everyoneRole = guild.roles.everyone;

    const canView = (ch) => {
      if (!ch.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages))
        return false;
      return (
        ch.permissionsFor(targetObj)?.has(PermissionFlagsBits.ViewChannel) ??
        false
      );
    };
    const isPrivate = (ch) =>
      !ch.permissionsFor(everyoneRole)?.has(PermissionFlagsBits.ViewChannel);
    const nameMatch = (ch) => norm(ch.name).includes(norm(targetObj.name));

    const visible = [...channels.values()].filter(canView);

    // 1. Private + name match
    const p1 = visible.filter((ch) => isPrivate(ch) && nameMatch(ch));
    if (p1.length) return p1[0];
    // 2. Private only
    const p2 = visible.filter((ch) => isPrivate(ch));
    if (p2.length) return p2[0];
    // 3. Public + name match
    const p3 = visible.filter((ch) => nameMatch(ch));
    if (p3.length) return p3[0];
    // 4. Public + score keyword
    const p4 = visible.filter((ch) =>
      SCORE_KEYWORDS.some((kw) => norm(ch.name).includes(kw)),
    );
    if (p4.length) return p4[0];
    // 5. First visible
    return visible[0] ?? null;
  } catch {
    return null;
  }
}

// ─── per-entry live push ──────────────────────────────────────────────────────

/**
 * Post or edit a live score embed for a single entry in the target's channel.
 * Tries to resolve the target (role or member) to get its color & channel.
 */
async function pushEntryLiveEmbed(client, guild, board, entry) {
  try {
    let targetObj = null;
    let targetColor = 0;
    let targetName = entry.targetId;

    if (entry.targetType === "ROLE") {
      targetObj = await guild.roles.fetch(entry.targetId).catch(() => null);
      targetColor = targetObj?.color ?? 0;
      targetName = targetObj?.name ?? entry.targetId;
    } else {
      targetObj = await guild.members.fetch(entry.targetId).catch(() => null);
      targetName = targetObj?.displayName ?? entry.targetId;
    }

    if (!targetObj) return;

    const mention =
      entry.targetType === "ROLE"
        ? `<@&${entry.targetId}>`
        : `<@${entry.targetId}>`;
    const discoreIconUrl =
      client.user?.displayAvatarURL({ size: 64, extension: "png" }) ??
      undefined;
    const embed = buildEntryEmbed(
      board,
      entry,
      mention,
      targetName,
      targetColor,
      { discoreIconUrl },
    );

    // Find channel: prefer stored liveChannelId, else auto-detect
    let channel = entry.liveChannelId
      ? await client.channels.fetch(entry.liveChannelId).catch(() => null)
      : null;
    if (!channel) {
      channel = findTeamChannel(guild, targetObj);
      if (!channel) return;
    }

    // Try to edit existing message
    let msg = entry.liveMessageId
      ? await channel.messages.fetch(entry.liveMessageId).catch(() => null)
      : null;

    if (msg) {
      await msg.edit({ embeds: [embed] }).catch(() => {
        msg = null;
      });
    }

    if (!msg) {
      msg = await channel.send({ embeds: [embed] }).catch(() => null);
    }

    if (msg) {
      await prisma.scoreboardEntry
        .update({
          where: { id: entry.id },
          data: { liveChannelId: channel.id, liveMessageId: msg.id },
        })
        .catch(() => {});
    }
  } catch {
    // non-fatal
  }
}

// ─── reads ────────────────────────────────────────────────────────────────────

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

async function getScoreboardById(id) {
  return prisma.scoreboard.findUnique({
    where: { id },
    include: { entries: true },
  });
}

async function getScoreboardByPublicId(publicId) {
  return prisma.scoreboard.findUnique({
    where: { publicId },
    include: { entries: true },
  });
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
  if (activeCount >= plan.limits.liveScoreboards)
    throw new Error(
      `Live scoreboard limit reached for ${plan.tier} (${plan.limits.liveScoreboards}).`,
    );

  const conflict = await prisma.scoreboard.findFirst({
    where: {
      guildId,
      name: { equals: name, mode: "insensitive" },
      isArchived: false,
    },
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
      actions: {
        create: {
          targetId: guildId,
          action: "CREATE",
          delta: 0,
          adminId: createdBy,
        },
      },
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
  if (!board) throw new Error(`Scoreboard not found: "${scoreboardName}"`);

  const updateData =
    action === "WIN"
      ? {
          wins: { increment: delta },
          winStreak: { increment: 1 },
          lossStreak: 0,
        }
      : action === "LOSS"
        ? {
            losses: { increment: delta },
            lossStreak: { increment: 1 },
            winStreak: 0,
          }
        : { points: { increment: delta } };

  const entry = await prisma.scoreboardEntry.upsert({
    where: { scoreboardId_targetId: { scoreboardId: board.id, targetId } },
    update: updateData,
    create: {
      scoreboardId: board.id,
      targetId,
      targetType,
      wins: action === "WIN" ? delta : 0,
      losses: action === "LOSS" ? delta : 0,
      points: action === "POINT" ? delta : 0,
      winStreak: action === "WIN" ? 1 : 0,
      lossStreak: action === "LOSS" ? 1 : 0,
    },
  });

  await prisma.$transaction([
    prisma.scoreboardAction.create({
      data: {
        scoreboardId: board.id,
        targetId,
        action,
        delta,
        adminId,
        reason: reason || null,
      },
    }),
    prisma.scoreboard.update({
      where: { id: board.id },
      data: { lastUpdatedAt: new Date() },
    }),
  ]);

  // Prune action log to 200
  const oldest = await prisma.scoreboardAction.findMany({
    where: { scoreboardId: board.id },
    orderBy: { createdAt: "desc" },
    skip: 200,
    select: { id: true },
  });
  if (oldest.length)
    await prisma.scoreboardAction.deleteMany({
      where: { id: { in: oldest.map((r) => r.id) } },
    });

  const updatedBoard = await getScoreboard(guildId, scoreboardName);
  const sorted = sortEntries(updatedBoard);
  const newLeaderId = sorted[0]?.targetId ?? null;
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
  if (!board) throw new Error(`Scoreboard not found: "${scoreboardName}"`);

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

  await prisma.$transaction([
    prisma.scoreboardAction.create({
      data: {
        scoreboardId: board.id,
        targetId,
        action: "EDIT",
        delta: 0,
        adminId,
        reason: "Manual edit",
      },
    }),
    prisma.scoreboard.update({
      where: { id: board.id },
      data: { lastUpdatedAt: new Date() },
    }),
  ]);

  return { board: await getScoreboard(guildId, scoreboardName), entry };
}

async function deleteEntry({ guildId, scoreboardName, targetId, adminId }) {
  const board = await getScoreboard(guildId, scoreboardName);
  if (!board) throw new Error(`Scoreboard not found: "${scoreboardName}"`);
  const existing = board.entries.find((e) => e.targetId === targetId);
  if (!existing)
    throw new Error(`No entry found for that target in "${scoreboardName}".`);
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

async function renameScoreboard({ guildId, oldName, newName }) {
  const board = await prisma.scoreboard.findFirst({
    where: { guildId, name: { equals: oldName, mode: "insensitive" } },
  });
  if (!board) throw new Error(`Scoreboard not found: "${oldName}"`);
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
  const board = await prisma.scoreboard.findFirst({
    where: { guildId, name: { equals: name, mode: "insensitive" } },
  });
  if (!board) throw new Error(`Scoreboard not found: "${name}"`);
  return prisma.scoreboard.update({
    where: { id: board.id },
    data: { theme: color },
  });
}

async function setDescription({ guildId, name, description }) {
  const board = await getScoreboard(guildId, name);
  if (!board) throw new Error(`Scoreboard not found: "${name}"`);
  return prisma.scoreboard.update({
    where: { id: board.id },
    data: { description },
  });
}

async function setTitle({ guildId, name, title }) {
  const board = await getScoreboard(guildId, name);
  if (!board) throw new Error(`Scoreboard not found: "${name}"`);
  return prisma.scoreboard.update({
    where: { id: board.id },
    data: { liveTitle: title },
  });
}

async function setRoleImage({ guildId, name, imageUrl }) {
  const board = await getScoreboard(guildId, name);
  if (!board) throw new Error(`Scoreboard not found: "${name}"`);
  return prisma.scoreboard.update({
    where: { id: board.id },
    data: { roleImageUrl: imageUrl || null },
  });
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
      messageId: null,
    },
    include: { entries: true },
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
  if (!board) throw new Error(`No archived scoreboard found: "${name}"`);
  const plan = await getGuildPlan(guildId);
  const activeCount = await prisma.scoreboard.count({
    where: { guildId, isArchived: false },
  });
  if (activeCount >= plan.limits.liveScoreboards)
    throw new Error(
      `Live scoreboard limit reached for ${plan.tier} (${plan.limits.liveScoreboards}).`,
    );
  return prisma.scoreboard.update({
    where: { id: board.id },
    data: {
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      archiveNote: null,
    },
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
  await prisma.$transaction([
    prisma.scoreboardAction.create({
      data: {
        scoreboardId: target.id,
        targetId: guildId,
        action: "MERGE",
        delta: 0,
        adminId,
        reason: `Merged from "${sourceName}"`,
      },
    }),
    prisma.scoreboard.update({
      where: { id: source.id },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedBy: adminId,
        archiveNote: `Merged into "${targetName}"`,
        messageId: null,
      },
    }),
    prisma.scoreboard.update({
      where: { id: target.id },
      data: { lastUpdatedAt: new Date() },
    }),
  ]);
  return getScoreboard(guildId, targetName);
}

// ─── board-level live push ────────────────────────────────────────────────────

async function pushLiveEmbed(client, board) {
  if (!board.channelId) return "no_channel";
  const ch = await client.channels.fetch(board.channelId).catch(() => null);
  if (!ch) {
    await prisma.scoreboard
      .update({
        where: { id: board.id },
        data: { repairStatus: "NEEDS_REPAIR", messageId: null },
      })
      .catch(() => null);
    return "no_channel";
  }
  const me = ch.guild?.members?.me;
  if (me && !ch.permissionsFor(me)?.has("SendMessages")) {
    await prisma.scoreboard
      .update({
        where: { id: board.id },
        data: { repairStatus: "NEEDS_REPAIR" },
      })
      .catch(() => null);
    return "no_perms";
  }
  const guildIconUrl =
    ch.guild?.iconURL({ size: 128, extension: "png" }) ?? undefined;
  const discoreIconUrlLive =
    client.user?.displayAvatarURL({ size: 64, extension: "png" }) ?? undefined;
  const embed = buildScoreboardPage(board, 1, {
    guildIconUrl,
    discoreIconUrl: discoreIconUrlLive,
  }).embed;
  if (board.messageId) {
    const msg = await ch.messages.fetch(board.messageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed] }).catch(() => null);
      return "updated";
    }
  }
  const newMsg = await ch.send({ embeds: [embed] }).catch(() => null);
  if (newMsg) {
    await prisma.scoreboard
      .update({
        where: { id: board.id },
        data: { messageId: newMsg.id, repairStatus: "OK" },
      })
      .catch(() => null);
    return "recreated";
  }
  await prisma.scoreboard
    .update({ where: { id: board.id }, data: { repairStatus: "NEEDS_REPAIR" } })
    .catch(() => null);
  return "failed";
}

async function repairLiveEmbed(client, boardId) {
  const board = await getScoreboardById(boardId);
  if (!board?.channelId) return "NO_CHANNEL";
  const ch = await client.channels.fetch(board.channelId).catch(() => null);
  if (!ch) {
    await prisma.scoreboard.update({
      where: { id: boardId },
      data: { repairStatus: "NEEDS_REPAIR", messageId: null },
    });
    return "CHANNEL_MISSING";
  }
  const me = ch.guild?.members?.me;
  if (me && !ch.permissionsFor(me)?.has("SendMessages")) {
    await prisma.scoreboard.update({
      where: { id: boardId },
      data: { repairStatus: "NEEDS_REPAIR" },
    });
    return "NO_PERMS";
  }
  const embed = buildScoreboardEmbedDirect(board);
  let msg = board.messageId
    ? await ch.messages.fetch(board.messageId).catch(() => null)
    : null;
  if (msg) {
    await msg.edit({ embeds: [embed] }).catch(() => null);
  } else {
    const newMsg = await ch.send({ embeds: [embed] }).catch(() => null);
    if (newMsg)
      await prisma.scoreboard.update({
        where: { id: boardId },
        data: { messageId: newMsg.id },
      });
  }
  await prisma.scoreboard.update({
    where: { id: boardId },
    data: { repairStatus: "OK" },
  });
  return "REPAIRED";
}

// ─── exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getScoreboard,
  getScoreboardById,
  getScoreboardByPublicId,
  listActiveScoreboards,
  getArchivedScoreboards,
  getTargetScores,
  createScoreboard,
  addResult,
  editEntry,
  deleteEntry,
  renameScoreboard,
  setTheme,
  setDescription,
  setTitle,
  setRoleImage,
  archiveScoreboard,
  restoreScoreboard,
  deleteScoreboard,
  mergeScoreboards,
  pushLiveEmbed,
  pushEntryLiveEmbed,
  repairLiveEmbed,
  buildScoreboardPage,
  buildScoreboardComponents,
  buildScoreboardEmbedDirect,
  buildScoreboardEmbed,
  buildEntryEmbed,
  findTeamChannel,
  sortEntries,
  PAGE_SIZE,
};
