"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const prisma = require("../../lib/prisma");

const DURATION_REGEX = /^(\d+)\s*(h|d|hour|hours|day|days)$/i;
const MAX_DURATION_DAYS = 7;

const CATEGORY_LABELS = {
  GAME: "🎮 Game",
  SERVER: "🏰 Server",
  FEATURES: "✨ Features",
  CHANNEL: "#️⃣ Channel",
  RULE: "📜 Rule",
  ISSUE: "⚠️ Issue",
  GENERAL: "💬 General",
};

// ─── Duration parser ──────────────────────────────────────────────────────────

function parseDuration(raw) {
  if (!raw) return { days: MAX_DURATION_DAYS };
  const match = String(raw).trim().match(DURATION_REGEX);
  if (!match)
    return { error: "Invalid duration format. Use e.g. 1h, 12h, 1d, 7d." };
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  let days = 0;
  if (unit.startsWith("h")) days = num / 24;
  else if (unit.startsWith("d")) days = num;
  if (days < 0.04) return { error: "Duration too short. Minimum is 1 hour." };
  if (days > MAX_DURATION_DAYS)
    return {
      error: `Duration cannot be longer than ${MAX_DURATION_DAYS} days.`,
    };
  return { days, expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000) };
}

// ─── Public ID generator ──────────────────────────────────────────────────────

async function generatePublicId(guildId) {
  const rows = await prisma.$queryRaw`
    SELECT "publicId" FROM "Suggestion"
    WHERE "guildId" = ${guildId} AND "publicId" IS NOT NULL AND "publicId" ~ '^SUG-[0-9]+$'
    ORDER BY "publicId" DESC LIMIT 1
  `;
  let next = 1;
  if (rows && rows.length > 0 && rows[0].publicId) {
    const match = rows[0].publicId.match(/^SUG-(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `SUG-${String(next).padStart(3, "0")}`;
}

// ─── Permission helpers ───────────────────────────────────────────────────────

function isAdminOrManager(member, guildSettings) {
  if (member.permissions?.has("ManageGuild")) return true;
  if (
    guildSettings?.discoreManagerRoleId &&
    member.roles.cache.has(guildSettings.discoreManagerRoleId)
  )
    return true;
  if (
    guildSettings?.disAdminRoleId &&
    member.roles.cache.has(guildSettings.disAdminRoleId)
  )
    return true;
  return false;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

async function getGuildSuggestionSettings(guildId) {
  return prisma.guild.findUnique({
    where: { id: guildId },
    select: { suggestionChannelId: true },
  });
}

async function createSuggestion({
  guildId,
  authorId,
  title,
  content,
  imageUrl,
  channelId,
  messageId,
  expiresAt,
  category,
  showVoters,
}) {
  let attempts = 0;
  while (attempts < 5) {
    const publicId = await generatePublicId(guildId);
    try {
      return await prisma.suggestion.create({
        data: {
          guildId,
          publicId,
          authorId,
          title: title || content.slice(0, 100),
          content,
          imageUrl: imageUrl || null,
          channelId,
          messageId: messageId || null,
          expiresAt:
            expiresAt ||
            new Date(Date.now() + MAX_DURATION_DAYS * 24 * 60 * 60 * 1000),
          category: category || "GENERAL",
          showVoters: showVoters || false,
        },
        include: { votes: true },
      });
    } catch (err) {
      if (err?.code === "P2002" && err?.meta?.target?.includes("publicId")) {
        attempts++;
        continue;
      }
      throw err;
    }
  }
  throw new Error("Could not generate unique public ID after 5 attempts.");
}

async function getSuggestion(publicId) {
  return prisma.suggestion.findUnique({
    where: { publicId },
    include: { votes: true },
  });
}

async function getSuggestionById(id) {
  return prisma.suggestion.findUnique({
    where: { id },
    include: { votes: true },
  });
}

async function updateSuggestion(publicId, data) {
  await prisma.suggestion.update({
    where: { publicId },
    data: { ...data, updatedAt: new Date() },
  });
  return getSuggestion(publicId);
}

async function listPendingSuggestions(
  guildId,
  page = 1,
  perPage = 10,
  categoryFilter = null,
) {
  const where = { guildId, status: "PENDING", expiresAt: { gte: new Date() } };
  if (categoryFilter) where.category = categoryFilter;
  return prisma.suggestion.findMany({
    where,
    include: { votes: true },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * perPage,
    take: perPage,
  });
}

// ─── Voting ───────────────────────────────────────────────────────────────────

async function toggleVote(suggestionId, userId, newType) {
  const existing = await prisma.suggestionVote.findUnique({
    where: { suggestionId_userId: { suggestionId, userId } },
  });
  if (existing) {
    if (existing.type === newType) {
      await prisma.suggestionVote.delete({ where: { id: existing.id } });
      return "removed";
    } else {
      await prisma.suggestionVote.update({
        where: { id: existing.id },
        data: { type: newType },
      });
      return "changed";
    }
  }
  await prisma.suggestionVote.create({
    data: { suggestionId, userId, type: newType },
  });
  return "added";
}

async function getVoters(suggestionId) {
  const votes = await prisma.suggestionVote.findMany({
    where: { suggestionId },
  });
  return {
    up: votes.filter((v) => v.type === "UP").map((v) => v.userId),
    down: votes.filter((v) => v.type === "DOWN").map((v) => v.userId),
  };
}

function countVotes(suggestion) {
  return {
    up: suggestion.votes.filter((v) => v.type === "UP").length,
    down: suggestion.votes.filter((v) => v.type === "DOWN").length,
  };
}

// ─── Admin actions ────────────────────────────────────────────────────────────

async function approveSuggestion(publicId, adminId) {
  return prisma.suggestion.update({
    where: { publicId },
    data: {
      status: "APPROVED",
      approvedBy: adminId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    },
    include: { votes: true },
  });
}

async function denySuggestion(publicId, adminId, note) {
  return prisma.suggestion.update({
    where: { publicId },
    data: {
      status: "DENIED",
      deniedBy: adminId,
      deniedAt: new Date(),
      adminNote: note || null,
      updatedAt: new Date(),
    },
    include: { votes: true },
  });
}

async function deleteSuggestion(publicId) {
  const s = await getSuggestion(publicId);
  if (!s) return null;
  await prisma.suggestionVote.deleteMany({ where: { suggestionId: s.id } });
  return prisma.suggestion.update({
    where: { publicId },
    data: { status: "DELETED", updatedAt: new Date() },
    include: { votes: true },
  });
}

// ─── Embed builder ────────────────────────────────────────────────────────────

async function buildSuggestionEmbed(guildId, suggestion) {
  const settings = await prisma.guild.findUnique({
    where: { id: guildId || suggestion.guildId },
    select: { themeColor: true },
  });
  const votes = countVotes(suggestion);
  const color = parseInt(
    (settings?.themeColor ?? "#1a7a9e").replace("#", ""),
    16,
  );
  const statusLabels = {
    PENDING: "⏳ Pending",
    APPROVED: "✅ Approved",
    DENIED: "❌ Denied",
    DELETED: "🗑️ Deleted",
    EXPIRED: "⌛ Expired",
  };
  const statusLabel = statusLabels[suggestion.status] || suggestion.status;
  const catLabel =
    CATEGORY_LABELS[suggestion.category] || CATEGORY_LABELS.GENERAL;

  const fields = [
    { name: "Category", value: catLabel, inline: true },
    { name: "Status", value: statusLabel, inline: true },
  ];

  // Short preview
  const preview =
    suggestion.content.length > 150
      ? suggestion.content.slice(0, 150) + "..."
      : suggestion.content;
  fields.push({ name: "Suggestion", value: preview, inline: false });

  if (suggestion.content.length > 150) {
    fields.push({
      name: "Description",
      value: suggestion.content,
      inline: false,
    });
  }

  fields.push({
    name: "Submitted by",
    value: `<@${suggestion.authorId}>`,
    inline: true,
  });

  if (suggestion.status === "APPROVED" && suggestion.approvedBy) {
    fields.push({
      name: "Approved by",
      value: `<@${suggestion.approvedBy}>`,
      inline: true,
    });
  }
  if (suggestion.status === "DENIED") {
    if (suggestion.deniedBy)
      fields.push({
        name: "Denied by",
        value: `<@${suggestion.deniedBy}>`,
        inline: true,
      });
    if (suggestion.adminNote)
      fields.push({
        name: "Reason",
        value: suggestion.adminNote,
        inline: false,
      });
  }

  if (suggestion.expiresAt && suggestion.status === "PENDING") {
    fields.push({
      name: "Voting closes",
      value: `<t:${Math.floor(new Date(suggestion.expiresAt).getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  fields.push({
    name: "Votes",
    value: `👍 ${votes.up} | 👎 ${votes.down}`,
    inline: true,
  });

  const embed = new EmbedBuilder()
    .setTitle(`💡 ${suggestion.title}`)
    .setColor(color)
    .setFooter({ text: `Discore Suggestions • ${suggestion.publicId}` })
    .setTimestamp(new Date(suggestion.createdAt))
    .addFields(fields);

  if (suggestion.imageUrl) embed.setImage(suggestion.imageUrl);

  return embed;
}

// ─── Buttons builder ──────────────────────────────────────────────────────────

function buildSuggestionButtons(suggestion) {
  const rows = [];
  const pid = suggestion.publicId;

  if (suggestion.status === "PENDING") {
    // Row 1: votes + optional see voters
    const voteButtons = [
      new ButtonBuilder()
        .setCustomId(`sug:up:${pid}`)
        .setLabel("Upvote")
        .setEmoji("👍")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`sug:down:${pid}`)
        .setLabel("Downvote")
        .setEmoji("👎")
        .setStyle(ButtonStyle.Danger),
    ];
    if (suggestion.showVoters) {
      voteButtons.push(
        new ButtonBuilder()
          .setCustomId(`sug:voters:${pid}:0`)
          .setLabel("See Voters")
          .setEmoji("👥")
          .setStyle(ButtonStyle.Primary),
      );
    }
    rows.push(new ActionRowBuilder().addComponents(voteButtons));

    // Row 2: edit
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sug:edit:${pid}`)
          .setLabel("Edit")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Secondary),
      ),
    );

    // Row 3: admin
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sug:approve:${pid}`)
          .setLabel("Approve")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`sug:deny:${pid}`)
          .setLabel("Deny")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`sug:delete:${pid}`)
          .setLabel("Delete")
          .setEmoji("🗑️")
          .setStyle(ButtonStyle.Danger),
      ),
    );
  } else {
    // Closed: only show See Voters if public, and delete for cleanup
    if (suggestion.showVoters) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`sug:voters:${pid}:0`)
            .setLabel("See Voters")
            .setEmoji("👥")
            .setStyle(ButtonStyle.Primary),
        ),
      );
    }
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sug:delete:${pid}`)
          .setLabel("Delete")
          .setEmoji("🗑️")
          .setStyle(ButtonStyle.Danger),
      ),
    );
  }

  return rows;
}

// ─── Update public embed ──────────────────────────────────────────────────────

async function tryUpdatePublicEmbed(client, suggestion) {
  try {
    if (!suggestion.channelId || !suggestion.messageId) return;
    const ch = await client.channels
      .fetch(suggestion.channelId)
      .catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(suggestion.messageId).catch(() => null);
    if (!msg) return;
    const embed = await buildSuggestionEmbed(suggestion.guildId, suggestion);
    const components = buildSuggestionButtons(suggestion);
    await msg.edit({ embeds: [embed], components }).catch(() => {});
  } catch {
    /* non-fatal */
  }
}

module.exports = {
  parseDuration,
  generatePublicId,
  isAdminOrManager,
  getGuildSuggestionSettings,
  createSuggestion,
  getSuggestion,
  getSuggestionById,
  updateSuggestion,
  listPendingSuggestions,
  toggleVote,
  getVoters,
  countVotes,
  approveSuggestion,
  denySuggestion,
  deleteSuggestion,
  buildSuggestionEmbed,
  buildSuggestionButtons,
  tryUpdatePublicEmbed,
  CATEGORY_LABELS,
};
