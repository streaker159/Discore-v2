"use strict";

const { randomBytes } = require("crypto");
const {
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const prisma = require("../../lib/prisma");
const roleTracking = require("../roleTracking/service");
const { getGuildPlan, hasFeature } = require("../../lib/premiumGate");

// ─── helpers ─────────────────────────────────────────────────────────────────

function genPublicId() {
  return randomBytes(4).toString("hex");
}

function genCustomId() {
  return randomBytes(8).toString("hex");
}

function ratio(wins, losses) {
  if (!losses) return wins ? wins.toFixed(2) : "0.00";
  return (wins / losses).toFixed(2);
}

function sortEntriesByWins(entries) {
  return [...entries].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.wins / Math.max(1, b.losses) - a.wins / Math.max(1, a.losses),
  );
}

function sortEntriesByPoints(entries) {
  return [...entries].sort((a, b) => b.points - a.points);
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
  return [...board.entries].sort((a, b) => b.wins - a.wins || r(b) - r(a));
}

function makeBoardColor(board) {
  if (!board.theme || board.theme === "default") return 0x1a7a9e;
  const clean = board.theme.replace("#", "");
  const parsed = parseInt(clean, 16);
  return Number.isFinite(parsed) ? parsed : 0x1a7a9e;
}

/**
 * Strip any sourceId:: prefix from a targetId for display purposes.
 * Merged entries use "sourceId::targetId" to avoid unique constraint collisions.
 */
function stripSourcePrefix(targetId) {
  if (!targetId) return "";
  if (targetId.includes("::")) {
    const parts = targetId.split("::");
    return parts[parts.length - 1]; // Last segment is the real target
  }
  return targetId;
}

function targetMention(entry) {
  const id = stripSourcePrefix(entry.targetId);
  if (entry.targetType === "ROLE") return `<@&${id}>`;
  if (entry.targetType === "USER") return `<@${id}>`;
  return entry.targetName || id;
}

function targetDisplay(entry) {
  if (entry.targetType === "CUSTOM")
    return entry.targetName || stripSourcePrefix(entry.targetId);
  return targetMention(entry);
}

// ─── entry embed ─────────────────────────────────────────────────────────────

function buildEntryEmbed(
  board,
  entry,
  targetMentionText,
  targetName,
  targetColor,
  opts = {},
) {
  const { discoreIconUrl } = opts;
  const color =
    targetColor && targetColor !== 0 ? targetColor : makeBoardColor(board);

  let fields;
  if (board.metric === "POINTS") {
    fields = [
      {
        name: "💯 Points",
        value: `**\` ${entry?.points ?? 0} \`**`,
        inline: true,
      },
    ];
  } else {
    const r = ratio(entry?.wins ?? 0, entry?.losses ?? 0);
    const ws = entry?.winStreak ?? 0;
    const ls = entry?.lossStreak ?? 0;
    const streakName =
      ws > 1 ? "🔥 Win Streak" : ls > 1 ? "💀 Loss Streak" : "Streak";
    const streakValue =
      ws > 1 ? `**\` ${ws} \`**` : ls > 1 ? `**\` ${ls} \`**` : "`—`";
    fields = [
      { name: "🏆 Wins", value: `**\` ${entry?.wins ?? 0} \`**`, inline: true },
      {
        name: "☠️ Losses",
        value: `**\` ${entry?.losses ?? 0} \`**`,
        inline: true,
      },
      { name: "⚖️ Ratio", value: `**\` ${r} \`**`, inline: true },
      { name: streakName, value: streakValue, inline: true },
    ];
  }

  const descParts = [
    `⚔️ **Scoreboard:** ${board.liveTitle || board.name}`,
    board.description ? `📝 *${board.description}*` : null,
    `👤 **Target:** ${targetMentionText}`,
  ].filter(Boolean);

  return new EmbedBuilder()
    .setTitle(`📊 Score Update — ${targetName}`)
    .setColor(color)
    .setDescription(descParts.join("\n"))
    .addFields(fields)
    .setFooter({
      text: "Powered by Discore  •  Live Stat Updates",
      iconURL: discoreIconUrl || undefined,
    })
    .setTimestamp(entry?.updatedAt ? new Date(entry.updatedAt) : undefined);
}

// ─── scoreboard page embed ────────────────────────────────────────────────────

const PAGE_SIZE = 10;
const MEDALS = ["🥇", "🥈", "🥉"];

function buildEntryLine(entry, pos, metric, typeBreakdownLines) {
  const medal = MEDALS[pos] ?? `\`${String(pos + 1).padStart(2, "0")}.\``;
  const display = targetDisplay(entry);
  const isChampion = pos === 0;
  const label = isChampion ? `**Champion: ${display}** 👑` : `**${display}**`;

  let mainLine;
  if (metric === "POINTS") {
    mainLine = `${medal} ${label}\n   └─ \` 💯 ${entry.points} Points \``;
  } else {
    const r = ratio(entry.wins, entry.losses);
    const streakBit =
      entry.winStreak > 1
        ? `  🔥 \`Streak: ${entry.winStreak}\``
        : entry.lossStreak > 1
          ? `  💀 \`Streak: ${entry.lossStreak}\``
          : "";
    mainLine = `${medal} ${label}\n   └─ \` 🏆 ${entry.wins}W \` \` 💀 ${entry.losses}L \` \` ⚖️ ${r} Ratio \`${streakBit}`;
  }
  if (typeBreakdownLines && typeBreakdownLines.length) {
    return mainLine + "\n" + typeBreakdownLines.join("\n");
  }
  return mainLine;
}

async function buildScoreboardPage(board, page = 1, opts = {}) {
  const { guildIconUrl, discoreIconUrl, sortBy = "WINS" } = opts;
  const sorted = sortEntries(board, sortBy);
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safeP = Math.min(Math.max(page, 1), pages);
  const slice = sorted.slice((safeP - 1) * PAGE_SIZE, safeP * PAGE_SIZE);

  // Load type breakdowns for entries on this page
  const entryIds = slice.map((e) => e.id);
  const typeStats = entryIds.length
    ? await prisma.scoreboardEntryTypeStats.findMany({
        where: { scoreboardEntryId: { in: entryIds } },
        include: { scoreType: true },
      })
    : [];
  const statsByEntry = new Map();
  for (const stat of typeStats) {
    if (!statsByEntry.has(stat.scoreboardEntryId))
      statsByEntry.set(stat.scoreboardEntryId, []);
    statsByEntry.get(stat.scoreboardEntryId).push(stat);
  }

  const lines = slice.map((entry, i) => {
    const pos = (safeP - 1) * PAGE_SIZE + i;
    const stats = statsByEntry.get(entry.id) || [];
    const breakdown = stats.length
      ? require("./scoreTypes").buildEntryTypeBreakdown(stats)
      : null;
    return buildEntryLine(entry, pos, board.metric, breakdown);
  });

  const archiveLine = board.isArchived
    ? `📦 **Archived**${
        board.archivedAt
          ? " · " + new Date(board.archivedAt).toLocaleDateString()
          : ""
      }${board.archiveNote ? " — " + board.archiveNote : ""}`
    : null;

  const descParts = [];
  if (board.description) {
    descParts.push(`📝 *${board.description}*`);
  }
  if (archiveLine) {
    descParts.push(`⚠️ ${archiveLine}`);
  }
  if (descParts.length > 0) {
    descParts.push("");
  }

  descParts.push(
    lines.length
      ? lines.join("\n\n")
      : "_No entries yet. Use `/scoreboard addwin` to get started._",
  );

  const modeLabel = board.metric === "POINTS" ? "💯 Points" : "⚔️ Win/Loss";
  const typeLabels = {
    USER: "👤 Users",
    ROLE: "👥 Roles",
    CUSTOM: "📝 Custom",
  };
  const typeLabel = typeLabels[board.type] || "👤 Users";
  const sortLabel =
    board.metric !== "POINTS"
      ? sortBy === "RATIO"
        ? "Ratio"
        : sortBy === "LOSSES"
          ? "Losses"
          : "Wins"
      : null;

  const footerParts = [
    `Mode: ${modeLabel}`,
    `Track: ${typeLabel}`,
    `${total} ${total === 1 ? "entry" : "entries"}`,
    total > PAGE_SIZE ? `Page ${safeP}/${pages}` : null,
    sortLabel ? `Sort: ${sortLabel}` : null,
    board.publicId && `ID: ${board.publicId}`,
  ].filter(Boolean);

  const embed = new EmbedBuilder()
    .setTitle(`🏆  ${board.liveTitle || board.name}`)
    .setDescription(descParts.join("\n"))
    .setColor(makeBoardColor(board))
    .setFooter({
      text: footerParts.join("  ·  "),
      iconURL: discoreIconUrl || undefined,
    })
    .setTimestamp(
      board.lastUpdatedAt ? new Date(board.lastUpdatedAt) : undefined,
    );

  if (board.roleImageUrl) embed.setThumbnail(board.roleImageUrl);
  else if (guildIconUrl) embed.setThumbnail(guildIconUrl);

  return { embed, page: safeP, totalPages: pages };
}

/**
 * Check if a guild has active premium — used to gate branding features at render time.
 */
async function hasActivePremium(guildId) {
  if (!guildId) return false;
  const premium = await prisma.guildPremium.findUnique({ where: { guildId } });
  if (!premium || premium.tier === "FREE") return false;
  if (premium.expiresAt && premium.expiresAt < new Date()) return false;
  return true;
}

/**
 * Build a scoreboard page with premium-gated branding image support.
 */
async function buildScoreboardPagePremium(board, page = 1, opts = {}) {
  const result = buildScoreboardPage(board, page, opts);
  // Premium gating for branding image
  if (board.brandingImageUrl && board.guildId) {
    const premium = await hasActivePremium(board.guildId);
    if (premium) {
      result.embed.setImage(board.brandingImageUrl);
    }
  }
  return result;
}

function buildScoreboardEmbedDirectPremium(board) {
  return buildScoreboardPage(board, 1).embed;
}

async function buildScoreboardEmbedPremium(_interaction, board) {
  return buildScoreboardPagePremium(board, 1).then((r) => r.embed);
}

// ─── category-aware display ──────────────────────────────────────────────────

/**
 * Group entries by sourceScoreboardId (categories).
 * Returns an array of { categoryId, categoryName, entries }.
 */
function groupEntriesByCategory(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.sourceScoreboardId || "__uncategorized__";
    const name = entry.sourceScoreboardName || "Uncategorized";
    if (!groups.has(key)) {
      groups.set(key, { categoryId: key, categoryName: name, entries: [] });
    }
    groups.get(key).entries.push(entry);
  }
  return Array.from(groups.values());
}

/**
 * Build "All Scores Combined" view: merges matching targetIds across all categories.
 */
function buildCombinedEntries(entries, metric) {
  const combined = new Map();
  for (const entry of entries) {
    // Strip sourceId:: prefix for combined view so Team 25 from
    // Scoreboard A and Scoreboard B are merged together in display
    let key = entry.targetId;
    if (key.includes("::")) {
      const parts = key.split("::");
      key = parts[parts.length - 1]; // Last segment is the real target
    }
    if (!combined.has(key)) {
      combined.set(key, {
        targetId: entry.targetId,
        targetType: entry.targetType,
        targetName: entry.targetName,
        wins: 0,
        losses: 0,
        points: 0,
        winStreak: 0,
        lossStreak: 0,
      });
    }
    const c = combined.get(key);
    c.wins += entry.wins;
    c.losses += entry.losses;
    c.points += entry.points;
  }
  const arr = Array.from(combined.values());
  if (metric === "POINTS") {
    arr.sort((a, b) => b.points - a.points);
  } else {
    arr.sort(
      (a, b) =>
        b.wins - a.wins ||
        b.wins / Math.max(1, b.losses) - a.wins / Math.max(1, a.losses),
    );
  }
  return arr;
}

/**
 * Build a page for "All Categories" or single-category view.
 * Each category is rendered as a section with its entries.
 */
function buildCategoryPage(categories, page = 1, metric, opts = {}) {
  const { guildIconUrl, discoreIconUrl, boardTitle, board, categoryTitle } =
    opts;
  const totalEntries = categories.reduce((sum, c) => sum + c.entries.length, 0);

  // Flatten: each category's sorted entries
  const flatItems = [];
  for (const cat of categories) {
    const sorted =
      metric === "POINTS"
        ? sortEntriesByPoints(cat.entries)
        : sortEntriesByWins(cat.entries);
    for (const entry of sorted) {
      flatItems.push({ entry, categoryName: cat.categoryName });
    }
  }

  const pages = Math.max(1, Math.ceil(flatItems.length / PAGE_SIZE));
  const safeP = Math.min(Math.max(page, 1), pages);
  const slice = flatItems.slice((safeP - 1) * PAGE_SIZE, safeP * PAGE_SIZE);

  // Group slice by category for display
  const lines = [];
  let lastCategory = null;
  for (let i = 0; i < slice.length; i++) {
    const item = slice[i];
    if (item.categoryName !== lastCategory && categories.length > 1) {
      lines.push(`__**${item.categoryName}**__`);
      lastCategory = item.categoryName;
    }
    lines.push(buildEntryLine(item.entry, (safeP - 1) * PAGE_SIZE + i, metric));
  }

  const descParts = [];
  if (categoryTitle) descParts.push(`📂 **${categoryTitle}**`);
  if (descParts.length) descParts.push("");
  descParts.push(lines.length ? lines.join("\n\n") : "_No entries._");

  const modeLabel = metric === "POINTS" ? "💯 Points" : "⚔️ Win/Loss";
  const footerParts = [
    `Mode: ${modeLabel}`,
    `${totalEntries} ${totalEntries === 1 ? "entry" : "entries"}`,
    totalEntries > PAGE_SIZE ? `Page ${safeP}/${pages}` : null,
  ].filter(Boolean);

  const embed = new EmbedBuilder()
    .setTitle(`🏆  ${boardTitle || "Scoreboard"}`)
    .setDescription(descParts.join("\n"))
    .setColor(board ? makeBoardColor(board) : 0x1a7a9e)
    .setFooter({
      text: footerParts.join("  ·  "),
      iconURL: discoreIconUrl || undefined,
    })
    .setTimestamp(
      board?.lastUpdatedAt ? new Date(board.lastUpdatedAt) : undefined,
    );

  if (board?.roleImageUrl) embed.setThumbnail(board.roleImageUrl);
  else if (guildIconUrl) embed.setThumbnail(guildIconUrl);

  return { embed, page: safeP, totalPages: pages, totalEntries };
}

// ─── components ───────────────────────────────────────────────────────────────

function buildScoreboardComponents(
  boardId,
  page,
  totalPages,
  metric,
  sortBy = "WINS",
  viewMode = "flat",
  hasCategories = false,
) {
  const rows = [];

  if (viewMode === "flat" && !hasCategories) {
    if (metric === "WIN_LOSS") {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`sb:sort:${boardId}:${page}:WINS:${viewMode}`)
            .setLabel("🏆 Most Wins")
            .setStyle(
              sortBy === "WINS" ? ButtonStyle.Primary : ButtonStyle.Secondary,
            ),
          new ButtonBuilder()
            .setCustomId(`sb:sort:${boardId}:${page}:RATIO:${viewMode}`)
            .setLabel("⚖️ Best Ratio")
            .setStyle(
              sortBy === "RATIO" ? ButtonStyle.Primary : ButtonStyle.Secondary,
            ),
          new ButtonBuilder()
            .setCustomId(`sb:sort:${boardId}:${page}:LOSSES:${viewMode}`)
            .setLabel("💀 Most Losses")
            .setStyle(
              sortBy === "LOSSES" ? ButtonStyle.Primary : ButtonStyle.Secondary,
            ),
          new ButtonBuilder()
            .setCustomId(`sb:refresh:${boardId}:${page}:${sortBy}:${viewMode}`)
            .setLabel("🔄 Refresh")
            .setStyle(ButtonStyle.Secondary),
        ),
      );
    } else {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`sb:refresh:${boardId}:${page}:POINTS:${viewMode}`)
            .setLabel("🔄 Refresh")
            .setStyle(ButtonStyle.Secondary),
        ),
      );
    }
  }

  // View mode dropdown for category boards
  if (hasCategories) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`sb:view:${boardId}:${page}:${sortBy}`)
          .setPlaceholder("Select a view...")
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel("All Scores Combined")
              .setDescription("Combine matching targets across all categories")
              .setValue("combined")
              .setDefault(viewMode === "combined"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Show All Categories")
              .setDescription("Display each category separately")
              .setValue("all_cats")
              .setDefault(viewMode === "all_cats"),
          ),
      ),
    );
  }

  if (totalPages > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sb:page:${boardId}:${page - 1}:${sortBy}:${viewMode}`)
          .setLabel("◀  Prev")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId(`sb:page:${boardId}:${page + 1}:${sortBy}:${viewMode}`)
          .setLabel("Next  ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages),
      ),
    );
  }

  return rows;
}

async function buildScoreboardEmbedDirect(board) {
  const result = await buildScoreboardPage(board, 1);
  return result.embed;
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

    const p1 = visible.filter((ch) => isPrivate(ch) && nameMatch(ch));
    if (p1.length) return p1[0];
    const p2 = visible.filter((ch) => isPrivate(ch));
    if (p2.length) return p2[0];
    const p3 = visible.filter((ch) => nameMatch(ch));
    if (p3.length) return p3[0];
    const p4 = visible.filter((ch) =>
      SCORE_KEYWORDS.some((kw) => norm(ch.name).includes(kw)),
    );
    if (p4.length) return p4[0];
    return visible[0] ?? null;
  } catch {
    return null;
  }
}

// ─── per-entry live push ──────────────────────────────────────────────────────

async function pushEntryLiveEmbed(client, guild, board, entry) {
  try {
    let targetObj = null;
    let targetColor = 0;
    let targetName = entry.targetName || entry.targetId;

    if (entry.targetType === "ROLE") {
      targetObj = await guild.roles.fetch(entry.targetId).catch(() => null);
      targetColor = targetObj?.color ?? 0;
      targetName = targetObj?.name ?? entry.targetName ?? entry.targetId;
    } else if (entry.targetType === "USER") {
      targetObj = await guild.members.fetch(entry.targetId).catch(() => null);
      targetName = targetObj?.displayName ?? entry.targetName ?? entry.targetId;
    } else {
      // CUSTOM - no Discord object to resolve
      targetName = entry.targetName || entry.targetId;
    }

    const mention = targetMention(entry);
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

    let channel = entry.liveChannelId
      ? await client.channels.fetch(entry.liveChannelId).catch(() => null)
      : null;
    if (!channel && targetObj) {
      channel = findTeamChannel(guild, targetObj);
      if (!channel && entry.targetType === "CUSTOM") {
        // For custom targets, fall back to board channel
        channel = board.channelId
          ? await client.channels.fetch(board.channelId).catch(() => null)
          : null;
      }
    }
    if (!channel) return;

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
  type = "USER",
  channelId,
  description,
  createdBy,
  hasCategories = false,
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
      hasCategories,
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

/**
 * Directly updates UserRoleScore for every member currently in the role.
 * Uses Discord's role.members cache (populated via GuildMembers intent).
 * No seeding or tracking tables needed — just fetch role and iterate members.
 */
function syncRoleMemberScoresInBackground({
  guildId,
  board,
  targetId,
  action,
  delta,
  guild,
}) {
  if (!guild || !targetId || !board?.id) return;

  setImmediate(async () => {
    try {
      // Fetch the single role (not the whole server)
      const role = await guild.roles.fetch(targetId).catch(() => null);
      if (!role) return;

      // Seed tracked members from cache so /role score works
      await roleTracking.seedTrackedRoleFromCachedMembers(guildId, role);

      // Build member set from both tracked rows + cache for complete coverage
      const memberIds = new Set();
      if (role.members?.size) {
        for (const [id] of role.members) memberIds.add(id);
      }

      if (!memberIds.size) {
        console.log(
          `[Scoreboard] No cached members for role ${role.name}, skipping member score sync.`,
        );
        return;
      }

      for (const memberId of memberIds) {
        const updateData = {};
        const createData = {
          guildId,
          userId: memberId,
          roleId: targetId,
          scoreboardId: board.id,
          wins: 0,
          losses: 0,
          points: 0,
        };

        if (action === "WIN") {
          updateData.wins = { increment: delta };
          createData.wins = delta;
        } else if (action === "LOSS") {
          updateData.losses = { increment: delta };
          createData.losses = delta;
        } else if (action === "POINT") {
          updateData.points = { increment: delta };
          createData.points = delta;
        }

        await prisma.userRoleScore.upsert({
          where: {
            scoreboardId_roleId_userId: {
              scoreboardId: board.id,
              roleId: targetId,
              userId: memberId,
            },
          },
          update: updateData,
          create: createData,
        });
      }

      console.log(
        `[Scoreboard] Synced role scores for ${role.name} (${memberIds.size} member(s))`,
      );
    } catch (error) {
      console.warn(
        "[Scoreboard] Role member score sync failed:",
        error.message,
      );
    }
  });
}

async function addResult({
  guildId,
  scoreboardName,
  targetId,
  targetType = "USER",
  targetName = null,
  action,
  delta = 1,
  adminId,
  reason,
  guild = null,
  category = null,
  scoreType = null,
}) {
  const board = await getScoreboard(guildId, scoreboardName);
  if (!board) throw new Error(`Scoreboard not found: "${scoreboardName}"`);

  // Validate metric + action match
  if (["WIN", "LOSS"].includes(action) && board.metric !== "WIN_LOSS")
    throw new Error(
      `Scoreboard "${board.name}" is a Points board — use addpoints.`,
    );
  if (action === "POINT" && board.metric !== "POINTS")
    throw new Error(
      `Scoreboard "${board.name}" is a Win/Loss board — use addwin/addloss.`,
    );

  // Validate type match
  if (targetType === "ROLE" && board.type === "USER")
    throw new Error(
      `Scoreboard "${board.name}" tracks users. Provide a user, not a role.`,
    );
  if (targetType === "USER" && board.type === "ROLE")
    throw new Error(
      `Scoreboard "${board.name}" tracks roles. Provide a role, not a user.`,
    );
  if (targetType === "CUSTOM" && board.type !== "CUSTOM")
    throw new Error(
      `Scoreboard "${board.name}" does not track custom targets.`,
    );

  // Category validation
  if (board.hasCategories && !category)
    throw new Error(
      `Scoreboard "${board.name}" has categories. Please provide a category.`,
    );

  // Build composite key for category-scoped boards
  const effectiveTargetId =
    board.hasCategories && category ? `${category}::${targetId}` : targetId;

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
    where: {
      scoreboardId_targetId: {
        scoreboardId: board.id,
        targetId: effectiveTargetId,
      },
    },
    update: updateData,
    create: {
      scoreboardId: board.id,
      targetId: effectiveTargetId,
      targetType,
      targetName: targetName || null,
      wins: action === "WIN" ? delta : 0,
      losses: action === "LOSS" ? delta : 0,
      points: action === "POINT" ? delta : 0,
      winStreak: action === "WIN" ? 1 : 0,
      lossStreak: action === "LOSS" ? 1 : 0,
    },
  });

  // For ROLE targets: sync scores to every member currently holding the role
  if (targetType === "ROLE" && guild) {
    syncRoleMemberScoresInBackground({
      guildId,
      board,
      targetId,
      action,
      delta,
      guild,
    });
  }

  await prisma.$transaction([
    prisma.scoreboardAction.create({
      data: {
        scoreboardId: board.id,
        targetId: effectiveTargetId,
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

  // ── Handle score types (premium feature) ─────────────────────────────
  if (scoreType) {
    const { addCategorizedResult } = require("./scoreTypes");
    try {
      await addCategorizedResult({
        guildId,
        scoreboardId: board.id,
        scoreboardEntryId: entry.id,
        targetId,
        rawScoreType: scoreType,
        action,
        delta,
      });
    } catch (err) {
      // Non-fatal — score type tracking failure shouldn't block the score
      console.error(
        "[Scoreboard] Failed to add categorized result:",
        err.message,
      );
    }
  }

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
  await prisma.scoreboardEntryTypeStats.deleteMany({
    where: { scoreboardEntryId: existing.id },
  });
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

async function archiveScoreboard({
  guildId,
  name,
  archivedBy,
  archiveNote,
  deleteLiveEmbeds = true,
}) {
  const board = await getScoreboard(guildId, name);
  if (!board) throw new Error(`Scoreboard not found: "${name}"`);
  return prisma.scoreboard.update({
    where: { id: board.id },
    data: {
      isArchived: true,
      archivedAt: new Date(),
      archivedBy: archivedBy || null,
      archiveNote: archiveNote || null,
      messageId: deleteLiveEmbeds ? null : board.messageId,
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
    prisma.userRoleScore.deleteMany({ where: { scoreboardId: board.id } }),
    prisma.scoreboardEntry.deleteMany({ where: { scoreboardId: board.id } }),
    prisma.scoreboardAction.deleteMany({ where: { scoreboardId: board.id } }),
    prisma.scoreboardEntryTypeStats.deleteMany({
      where: { scoreboardId: board.id },
    }),
    prisma.scoreboardScoreType.deleteMany({
      where: { scoreboardId: board.id },
    }),
    prisma.scoreboardMergeHistory.deleteMany({
      where: {
        OR: [
          { targetScoreboardId: board.id },
          { sourceScoreboardId: board.id },
        ],
      },
    }),
    prisma.scoreboard.delete({ where: { id: board.id } }),
  ]);
  return board;
}

async function deleteScoreboardById(id) {
  await prisma.$transaction([
    prisma.userRoleScore.deleteMany({ where: { scoreboardId: id } }),
    prisma.scoreboardEntry.deleteMany({ where: { scoreboardId: id } }),
    prisma.scoreboardAction.deleteMany({ where: { scoreboardId: id } }),
    prisma.scoreboardEntryTypeStats.deleteMany({ where: { scoreboardId: id } }),
    prisma.scoreboardScoreType.deleteMany({ where: { scoreboardId: id } }),
    prisma.scoreboardMergeHistory.deleteMany({
      where: {
        OR: [{ targetScoreboardId: id }, { sourceScoreboardId: id }],
      },
    }),
    prisma.scoreboard.delete({ where: { id } }),
  ]);
}

// ─── merge ────────────────────────────────────────────────────────────────────

/**
 * Merge one scoreboard into another with full category/source tracking.
 *
 * mergeOptions:
 *   - merge_delete: copy scores, delete source forever
 *   - merge_clear_keep_live: copy scores, clear source, keep source live
 *   - merge_keep_live_keep_scores: copy scores, keep source live with scores
 *   - merge_archive: copy scores, archive source
 */
async function mergeScoreboards({
  guildId,
  sourceName,
  targetName,
  afterMerge = "merge_archive",
  adminId,
}) {
  // Fetch both boards
  const source = await prisma.scoreboard.findFirst({
    where: {
      guildId,
      name: { equals: sourceName, mode: "insensitive" },
      isArchived: false,
    },
    include: { entries: true },
  });
  const target = await prisma.scoreboard.findFirst({
    where: {
      guildId,
      name: { equals: targetName, mode: "insensitive" },
      isArchived: false,
    },
    include: { entries: true },
  });

  if (!source) throw new Error(`Source scoreboard not found: "${sourceName}"`);
  if (!target) throw new Error(`Target scoreboard not found: "${targetName}"`);
  if (source.id === target.id)
    throw new Error("Cannot merge a scoreboard into itself.");

  // Determine whether the target should become category-aware
  const existingSourceIds = new Set();
  for (const entry of target.entries) {
    if (entry.sourceScoreboardId)
      existingSourceIds.add(entry.sourceScoreboardId);
  }

  // If target already has categories from other sources OR this is the 2nd+ source,
  // ensure target is in category mode.
  const willHaveCategories =
    existingSourceIds.size > 0 || existingSourceIds.has(source.id);

  // Check if source already exists as category in target
  const sourceAlreadyMerged = existingSourceIds.has(source.id);

  // Copy all source entries into target.
  // Same-named targets across different source boards are COMBINED.
  // Between separate sources, same target name = one entry with combined scores.
  // Re-merging the same source later = combined into the same entry.
  let entriesMerged = 0;
  for (const entry of source.entries) {
    // Extract the real targetId (strip any existing category/merge prefix)
    let cleanTargetId = entry.targetId;
    let cleanTargetName = entry.targetName;

    // Strip any legacy "::" prefixes
    if (entry.targetId.includes("::")) {
      const parts = entry.targetId.split("::");
      cleanTargetId = parts[parts.length - 1];
    }

    // Look for an existing entry in the target with the same clean targetId
    const existingTargetEntry = target.entries.find(
      (e) => e.targetId === cleanTargetId,
    );

    if (existingTargetEntry) {
      // Combine scores into the existing entry
      await prisma.scoreboardEntry.update({
        where: { id: existingTargetEntry.id },
        data: {
          wins: existingTargetEntry.wins + entry.wins,
          losses: existingTargetEntry.losses + entry.losses,
          points: existingTargetEntry.points + entry.points,
          targetName: cleanTargetName || existingTargetEntry.targetName,
          sourceScoreboardId: source.id,
          sourceScoreboardName: source.name,
        },
      });
    } else {
      // Create new entry in target
      await prisma.scoreboardEntry.create({
        data: {
          scoreboardId: target.id,
          targetId: cleanTargetId,
          targetType: entry.targetType,
          targetName: cleanTargetName || entry.targetName,
          wins: entry.wins,
          losses: entry.losses,
          points: entry.points,
          winStreak: entry.winStreak,
          lossStreak: entry.lossStreak,
          sourceScoreboardId: source.id,
          sourceScoreboardName: source.name,
        },
      });
    }
    entriesMerged++;
  }

  // ── Merge score types (premium feature) ────────────────────────────────
  const { getScoreTypes, findOrCreateScoreType } = require("./scoreTypes");
  const sourceScoreTypes = await getScoreTypes(source.id);
  const targetScoreTypes = await getScoreTypes(target.id);

  // Map source type -> target type by normalized name
  const typeMap = new Map(); // sourceTypeId -> targetTypeId
  const skippedTypes = [];

  for (const srcType of sourceScoreTypes) {
    const existing = targetScoreTypes.find(
      (t) => t.normalizedName === srcType.normalizedName,
    );
    if (existing) {
      typeMap.set(srcType.id, existing.id);
    } else {
      try {
        const created = await findOrCreateScoreType(
          guildId,
          target.id,
          srcType.name,
        );
        typeMap.set(srcType.id, created.id);
      } catch (err) {
        skippedTypes.push({ name: srcType.name, reason: err.message });
      }
    }
  }

  // Merge entry type stats
  const sourceEntryTypeStats = await prisma.scoreboardEntryTypeStats.findMany({
    where: { scoreboardId: source.id },
  });

  for (const stat of sourceEntryTypeStats) {
    const targetTypeId = typeMap.get(stat.scoreTypeId);
    if (!targetTypeId) continue; // type couldn't be mapped (10-category limit hit)

    // Find the target entry that corresponds to the source entry
    const sourceEntry = source.entries.find(
      (e) => e.id === stat.scoreboardEntryId,
    );
    if (!sourceEntry) continue;

    const cleanTargetId = sourceEntry.targetId.includes("::")
      ? sourceEntry.targetId.split("::").pop()
      : sourceEntry.targetId;

    const targetEntry = await prisma.scoreboardEntry.findFirst({
      where: { scoreboardId: target.id, targetId: cleanTargetId },
    });
    if (!targetEntry) continue;

    await prisma.scoreboardEntryTypeStats.upsert({
      where: {
        scoreboardEntryId_scoreTypeId: {
          scoreboardEntryId: targetEntry.id,
          scoreTypeId: targetTypeId,
        },
      },
      update: {
        wins: { increment: stat.wins },
        losses: { increment: stat.losses },
        points: { increment: stat.points },
      },
      create: {
        guildId,
        scoreboardId: target.id,
        scoreboardEntryId: targetEntry.id,
        scoreTypeId: targetTypeId,
        wins: stat.wins,
        losses: stat.losses,
        points: stat.points,
      },
    });
  }

  // Enable category mode on target if needed
  if (willHaveCategories && !target.hasCategories) {
    await prisma.scoreboard.update({
      where: { id: target.id },
      data: { hasCategories: true },
    });
  }

  // Determine sourceAction based on merge option
  let sourceAction;
  switch (afterMerge) {
    case "merge_delete":
      sourceAction = "DELETED";
      break;
    case "merge_clear_keep_live":
      sourceAction = "CLEARED_KEEP_LIVE";
      break;
    case "merge_keep_live_keep_scores":
      sourceAction = "KEPT_LIVE";
      break;
    case "merge_archive":
    default:
      sourceAction = "ARCHIVED";
      afterMerge = "merge_archive";
      break;
  }

  // Record merge history
  await prisma.scoreboardMergeHistory.create({
    data: {
      guildId,
      targetScoreboardId: target.id,
      sourceScoreboardId: source.id,
      sourceScoreboardName: source.name,
      mergeOption: afterMerge,
      mergedBy: adminId,
      entriesMerged,
      sourceAction,
    },
  });

  // Create action log
  await prisma.scoreboardAction.create({
    data: {
      scoreboardId: target.id,
      targetId: guildId,
      action: "MERGE",
      delta: 0,
      adminId,
      reason: `Merged from "${source.name}" (${afterMerge})`,
    },
  });

  // Post-merge actions on source
  switch (afterMerge) {
    case "merge_delete":
      await deleteScoreboardById(source.id);
      break;
    case "merge_clear_keep_live":
      // Clear all entries from source but keep it live
      await prisma.scoreboardEntry.deleteMany({
        where: { scoreboardId: source.id },
      });
      await prisma.scoreboard.update({
        where: { id: source.id },
        data: { lastUpdatedAt: new Date(), lastLeaderId: null },
      });
      break;
    case "merge_archive":
      await prisma.scoreboard.update({
        where: { id: source.id },
        data: {
          isArchived: true,
          archivedAt: new Date(),
          archivedBy: adminId,
          archiveNote: `Merged into "${target.name}"`,
          messageId: null,
        },
      });
      break;
    case "merge_keep_live_keep_scores":
      // Do nothing — source stays live with scores
      break;
  }

  // Refresh target
  const updatedTarget = await prisma.scoreboard.findUnique({
    where: { id: target.id },
    include: { entries: true },
  });

  return {
    board: updatedTarget,
    sourceName: source.name,
    sourceId: source.id,
    sourceAction,
    afterMerge,
    entriesMerged,
  };
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
  const page = await buildScoreboardPage(board, 1, {
    guildIconUrl,
    discoreIconUrl: discoreIconUrlLive,
  });
  let embed = page.embed;

  // Apply branding image when premium is active
  if (board.brandingImageUrl && board.guildId) {
    const premium = await hasActivePremium(board.guildId);
    if (premium) {
      embed.setImage(board.brandingImageUrl);
    }
  }

  // Build components (score type dropdown) if score types exist
  const { getScoreTypes } = require("./scoreTypes");
  const scoreTypes = await getScoreTypes(board.id);
  let components = [];
  if (scoreTypes.length > 0) {
    components = buildShowComponents(
      board.id,
      1,
      page.totalPages || 1,
      board.metric,
      "WINS",
      "flat",
      board,
      { scoreTypes, hasScoreTypes: true },
    );
  }

  const payload = { embeds: [embed] };
  if (components.length) payload.components = components;

  if (board.messageId) {
    const msg = await ch.messages.fetch(board.messageId).catch(() => null);
    if (msg) {
      await msg.edit(payload).catch(() => null);
      return "updated";
    }
  }
  const newMsg = await ch.send(payload).catch(() => null);
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

// ─── interactive show helpers ─────────────────────────────────────────────────

/**
 * Build the interactive embed for a board based on view mode.
 * viewMode:
 *   "flat" or "overall" — standard flat view with category breakdowns under entries
 *   "type:<scoreTypeId>" — filtered by score type
 *   "combined", "all_cats", or a sourceScoreboardId — legacy merge-based categories
 */
async function buildInteractiveShowEmbed(
  board,
  viewMode = "flat",
  page = 1,
  sortBy = "WINS",
  opts = {},
) {
  const { guildIconUrl, discoreIconUrl } = opts;

  // ── Detect whether score types exist (new premium feature) ────────────
  const { getScoreTypes } = require("./scoreTypes");
  const scoreTypes = await getScoreTypes(board.id);
  const hasScoreTypes = scoreTypes.length > 0;

  // ── Score type filtered view ─────────────────────────────────────────
  if (viewMode.startsWith("type:")) {
    const scoreTypeId = viewMode.slice("type:".length);
    const scoreType = scoreTypes.find((t) => t.id === scoreTypeId);
    const typeName = scoreType?.name || "Unknown";

    // Load all entries with their type stats for this scoreType
    const allEntryIds = board.entries.map((e) => e.id);
    const typeStats = allEntryIds.length
      ? await prisma.scoreboardEntryTypeStats.findMany({
          where: {
            scoreboardEntryId: { in: allEntryIds },
            scoreTypeId,
          },
        })
      : [];

    // Build filtered entries: only entries with stats in this type
    const statsByEntry = new Map();
    for (const stat of typeStats) {
      statsByEntry.set(stat.scoreboardEntryId, stat);
    }

    const ranked = board.entries
      .filter((e) => statsByEntry.has(e.id))
      .map((e) => ({ entry: e, stat: statsByEntry.get(e.id) }));

    // Sort by category stats
    ranked.sort((a, b) => {
      if (board.metric === "POINTS") return b.stat.points - a.stat.points;
      return (
        b.stat.wins - a.stat.wins ||
        b.stat.wins / Math.max(1, b.stat.losses) -
          a.stat.wins / Math.max(1, a.stat.losses)
      );
    });

    const total = ranked.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safeP = Math.min(Math.max(page, 1), pages);
    const slice = ranked.slice((safeP - 1) * PAGE_SIZE, safeP * PAGE_SIZE);

    const lines = slice.map(({ entry, stat }, i) => {
      const pos = (safeP - 1) * PAGE_SIZE + i;
      const medal = MEDALS[pos] ?? `\`${String(pos + 1).padStart(2, "0")}.\``;
      const display = targetDisplay(entry);
      const label = `**${display}**`;
      if (board.metric === "POINTS") {
        return `${medal} ${label}\n   └─ \` 💯 ${stat.points} Points \``;
      }
      const r = stat.losses
        ? (stat.wins / stat.losses).toFixed(2)
        : stat.wins > 0
          ? stat.wins.toFixed(2)
          : "0.00";
      return `${medal} ${label}\n   └─ \` 🏆 ${stat.wins}W \` \` 💀 ${stat.losses}L \` \` ⚖️ ${r} Ratio \``;
    });

    const modeLabel = board.metric === "POINTS" ? "💯 Points" : "⚔️ Win/Loss";
    const footerParts = [
      `Filtered by ${typeName}`,
      `Mode: ${modeLabel}`,
      `${total} ${total === 1 ? "entry" : "entries"}`,
      total > PAGE_SIZE ? `Page ${safeP}/${pages}` : null,
    ].filter(Boolean);

    const embed = new EmbedBuilder()
      .setTitle(`🏆  ${board.liveTitle || board.name} — ${typeName}`)
      .setDescription(
        (board.description ? `📝 *${board.description}*\n\n` : "") +
          (lines.length
            ? lines.join("\n\n")
            : `_No entries with ${typeName} stats yet._`),
      )
      .setColor(makeBoardColor(board))
      .setFooter({
        text: footerParts.join("  ·  "),
        iconURL: discoreIconUrl || undefined,
      })
      .setTimestamp(
        board.lastUpdatedAt ? new Date(board.lastUpdatedAt) : undefined,
      );

    if (board.roleImageUrl) embed.setThumbnail(board.roleImageUrl);
    else if (guildIconUrl) embed.setThumbnail(guildIconUrl);

    return {
      embed,
      page: safeP,
      totalPages: pages,
      scoreTypes,
      hasScoreTypes: true,
    };
  }

  // ── Overall view (flat) — use score type breakdowns if they exist ─────
  if (
    viewMode === "flat" ||
    viewMode === "overall" ||
    !viewMode ||
    !board.hasCategories
  ) {
    const result = await buildScoreboardPage(board, page, {
      guildIconUrl,
      discoreIconUrl,
      sortBy,
    });
    return { ...result, scoreTypes, hasScoreTypes };
  }

  // ── Legacy merge-based category views ────────────────────────────────
  if (viewMode === "combined") {
    // All Scores Combined
    const combined = buildCombinedEntries(board.entries, board.metric);
    const total = combined.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safeP = Math.min(Math.max(page, 1), pages);
    const slice = combined.slice((safeP - 1) * PAGE_SIZE, safeP * PAGE_SIZE);

    const lines = slice.map((entry, i) => {
      const pos = (safeP - 1) * PAGE_SIZE + i;
      return buildEntryLine(entry, pos, board.metric);
    });

    const modeLabel = board.metric === "POINTS" ? "💯 Points" : "⚔️ Win/Loss";
    const footerParts = [
      "📊 All Scores Combined",
      `Mode: ${modeLabel}`,
      `${total} ${total === 1 ? "entry" : "entries"}`,
      total > PAGE_SIZE ? `Page ${safeP}/${pages}` : null,
    ].filter(Boolean);

    const embed = new EmbedBuilder()
      .setTitle(`🏆  ${board.liveTitle || board.name}`)
      .setDescription(
        (board.description ? `📝 *${board.description}*\n\n` : "") +
          (lines.length ? lines.join("\n\n") : "_No entries._"),
      )
      .setColor(makeBoardColor(board))
      .setFooter({
        text: footerParts.join("  ·  "),
        iconURL: discoreIconUrl || undefined,
      })
      .setTimestamp(
        board.lastUpdatedAt ? new Date(board.lastUpdatedAt) : undefined,
      );

    if (board.roleImageUrl) embed.setThumbnail(board.roleImageUrl);
    else if (guildIconUrl) embed.setThumbnail(guildIconUrl);

    return { embed, page: safeP, totalPages: pages, scoreTypes, hasScoreTypes };
  }

  if (viewMode === "all_cats") {
    // Show All Categories
    const categories = groupEntriesByCategory(board.entries);
    return {
      ...buildCategoryPage(categories, page, board.metric, {
        guildIconUrl,
        discoreIconUrl,
        boardTitle: board.liveTitle || board.name,
        board,
        categoryTitle: "All Categories",
      }),
      scoreTypes,
      hasScoreTypes,
    };
  }

  // Single old category view
  const categories = groupEntriesByCategory(board.entries);
  const cat = categories.find((c) => c.categoryId === viewMode);
  if (!cat) {
    const result = await buildScoreboardPage(board, page, {
      guildIconUrl,
      discoreIconUrl,
      sortBy,
    });
    return { ...result, scoreTypes, hasScoreTypes };
  }
  return {
    ...buildCategoryPage([cat], page, board.metric, {
      guildIconUrl,
      discoreIconUrl,
      boardTitle: `${board.liveTitle || board.name} — ${cat.categoryName}`,
      board,
      categoryTitle: cat.categoryName,
    }),
    scoreTypes,
    hasScoreTypes,
  };
}

/**
 * Build components for the interactive show view.
 * Accepts optional scoreTypes/hasScoreTypes for the new premium score type system.
 */
function buildShowComponents(
  boardId,
  page,
  totalPages,
  metric,
  sortBy,
  viewMode,
  board,
  opts = {},
) {
  const { scoreTypes, hasScoreTypes } = opts;
  const rows = [];

  // ── Score type dropdown (premium feature) ────────────────────────────
  if (hasScoreTypes && scoreTypes && scoreTypes.length > 0) {
    const currentTypeId = viewMode.startsWith("type:")
      ? viewMode.slice("type:".length)
      : null;

    const options = [
      new StringSelectMenuOptionBuilder()
        .setLabel("Overall")
        .setDescription("Combined leaderboard across all score types")
        .setValue("overall")
        .setDefault(!currentTypeId),
    ];

    for (const t of scoreTypes) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(t.name.substring(0, 25))
          .setDescription(`Filter by ${t.name}`)
          .setValue(`type:${t.id}`)
          .setDefault(currentTypeId === t.id),
      );
    }

    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`sb:scoretype:${boardId}:${page}:${sortBy}`)
          .setPlaceholder("Filter by score type...")
          .addOptions(options),
      ),
    );
  }

  // ── Legacy view selection dropdown (for boards with merge-based categories) ─
  if (
    board?.hasCategories &&
    (!hasScoreTypes ||
      rows.length === 0 ||
      hasScoreTypes === false ||
      (hasScoreTypes &&
        viewMode !== "flat" &&
        !viewMode.startsWith("type:") &&
        viewMode !== "overall"))
  ) {
    const categories = groupEntriesByCategory(board.entries || []);
    const options = [
      new StringSelectMenuOptionBuilder()
        .setLabel("All Scores Combined")
        .setDescription("Combine matching targets across all categories")
        .setValue("combined")
        .setDefault(viewMode === "combined"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Show All Categories")
        .setDescription("Display each category separately")
        .setValue("all_cats")
        .setDefault(viewMode === "all_cats"),
    ];
    // Add individual category options (up to Discord limit of 25)
    for (const cat of categories.slice(0, 23)) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(cat.categoryName.substring(0, 25))
          .setDescription(`View only ${cat.categoryName}`)
          .setValue(cat.categoryId)
          .setDefault(viewMode === cat.categoryId),
      );
    }

    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`sb:view:${boardId}:${page}:${sortBy}`)
          .setPlaceholder("Select a view...")
          .addOptions(options),
      ),
    );
  }

  // Sort buttons for WIN_LOSS boards
  if (
    metric === "WIN_LOSS" &&
    viewMode !== "all_cats" &&
    viewMode !== "combined"
  ) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sb:sort:${boardId}:${page}:WINS:${viewMode}`)
          .setLabel("🏆 Most Wins")
          .setStyle(
            sortBy === "WINS" ? ButtonStyle.Primary : ButtonStyle.Secondary,
          ),
        new ButtonBuilder()
          .setCustomId(`sb:sort:${boardId}:${page}:RATIO:${viewMode}`)
          .setLabel("⚖️ Best Ratio")
          .setStyle(
            sortBy === "RATIO" ? ButtonStyle.Primary : ButtonStyle.Secondary,
          ),
        new ButtonBuilder()
          .setCustomId(`sb:sort:${boardId}:${page}:LOSSES:${viewMode}`)
          .setLabel("💀 Most Losses")
          .setStyle(
            sortBy === "LOSSES" ? ButtonStyle.Primary : ButtonStyle.Secondary,
          ),
      ),
    );
  }

  // Refresh + Change View buttons
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sb:refresh:${boardId}:${page}:${sortBy}:${viewMode}`)
        .setLabel("🔄 Refresh")
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  // Pagination
  if (totalPages > 1) {
    const pagRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sb:page:${boardId}:${page - 1}:${sortBy}:${viewMode}`)
        .setLabel("◀  Prev")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId(`sb:page:${boardId}:${page + 1}:${sortBy}:${viewMode}`)
        .setLabel("Next  ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages),
    );
    rows.push(pagRow);
  }

  return rows;
}

// ─── batch embed updates ──────────────────────────────────────────────────────

/**
 * Batch-update all live embeds for a board and its entries.
 * Used after merge_clear_keep_live to stagger updates.
 */
async function batchRefreshLiveEmbeds(client, boardId, delayMs = 500) {
  const board = await getScoreboardById(boardId);
  if (!board) return;

  // Update board-level embed
  if (board.channelId) {
    await pushLiveEmbed(client, board);
    await new Promise((r) => setTimeout(r, delayMs));
  }

  // Update per-entry embeds
  for (const entry of board.entries) {
    try {
      const guild = client.guilds.cache.get(board.guildId);
      if (guild && entry.liveChannelId) {
        await pushEntryLiveEmbed(client, guild, board, entry);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } catch {
      // continue
    }
  }
}

// ─── exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Read
  getScoreboard,
  getScoreboardById,
  getScoreboardByPublicId,
  listActiveScoreboards,
  getArchivedScoreboards,
  getTargetScores,

  hasActivePremium,

  // Score type helpers (premium)
  getScoreTypes: async (scoreboardId) => {
    const { getScoreTypes } = require("./scoreTypes");
    return getScoreTypes(scoreboardId);
  },
  findOrCreateScoreType: async (guildId, scoreboardId, name) => {
    const { findOrCreateScoreType } = require("./scoreTypes");
    return findOrCreateScoreType(guildId, scoreboardId, name);
  },
  addCategorizedResult: async (args) => {
    const { addCategorizedResult } = require("./scoreTypes");
    return addCategorizedResult(args);
  },
  getEntryTypeStats: async (entryId) => {
    const { getEntryTypeStats } = require("./scoreTypes");
    return getEntryTypeStats(entryId);
  },
  getBoardTypeStats: async (scoreboardId) => {
    const { getBoardTypeStats } = require("./scoreTypes");
    return getBoardTypeStats(scoreboardId);
  },
  buildEntryTypeBreakdown: (stats) => {
    const { buildEntryTypeBreakdown } = require("./scoreTypes");
    return buildEntryTypeBreakdown(stats);
  },
  buildScoreTypeSelectOptions: async (boardId, currentTypeId) => {
    const { buildScoreTypeSelectOptions } = require("./scoreTypes");
    return buildScoreTypeSelectOptions(boardId, currentTypeId);
  },

  // Write
  createScoreboard,
  addResult,
  editEntry,
  deleteEntry,
  renameScoreboard,
  setTheme,
  setDescription,
  setTitle,
  setRoleImage,

  // Archive
  archiveScoreboard,
  restoreScoreboard,
  deleteScoreboard,

  // Merge
  mergeScoreboards,

  // Live embeds
  pushLiveEmbed,
  pushEntryLiveEmbed,
  repairLiveEmbed,
  batchRefreshLiveEmbeds,

  // Display
  buildScoreboardPage,
  buildScoreboardComponents,
  buildScoreboardEmbedDirect,
  buildScoreboardEmbed,
  buildEntryEmbed,
  buildInteractiveShowEmbed,
  buildShowComponents,
  buildCombinedEntries,
  groupEntriesByCategory,
  targetMention,
  targetDisplay,

  // Shared
  findTeamChannel,
  sortEntries,
  makeBoardColor,
  PAGE_SIZE,
};
