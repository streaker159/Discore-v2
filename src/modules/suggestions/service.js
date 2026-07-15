"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const prisma = require("../../lib/prisma");

const CATEGORY_LABELS = {
  GAME: "🎮 Game",
  SERVER: "🏰 Server",
  FEATURES: "✨ Features",
  CHANNEL: "#️⃣ Channel",
  RULE: "📜 Rule",
  ISSUE: "⚠️ Issue",
  GENERAL: "💬 General",
};

const CATEGORY_CHOICES = Object.entries(CATEGORY_LABELS).map(
  ([value, name]) => ({
    name,
    value,
  }),
);

const STATUS_LABELS = {
  OPEN: "🔵 Open",
  PENDING: "⏳ Pending",
  APPROVED: "✅ Approved",
  DENIED: "❌ Denied",
  UNDER_REVIEW: "🔍 Under Review",
  PLANNED: "📋 Planned",
  IMPLEMENTED: "🚀 Implemented",
  CLOSED: "🔒 Closed",
  EXPIRED: "⌛ Expired",
  DELETED: "🗑️ Deleted",
  REJECTED: "❌ Rejected",
};

const MAX_DURATION_DAYS = 30;
const MAX_RETENTION_DAYS = 30;
const DEFAULT_DURATION_DAYS = 7;

// ─── Permission helpers ───────────────────────────────────────────────────────

function isAdminOrManager(member, guildSettings) {
  if (!member) return false;
  if (member.permissions?.has("ManageGuild")) return true;
  if (member.id === member.guild?.ownerId) return true;
  if (
    guildSettings?.discoreManagerRoleId &&
    member.roles?.cache?.has(guildSettings.discoreManagerRoleId)
  )
    return true;
  if (
    guildSettings?.disAdminRoleId &&
    member.roles?.cache?.has(guildSettings.disAdminRoleId)
  )
    return true;
  if (
    guildSettings?.suggestionManagerRoleId &&
    member.roles?.cache?.has(guildSettings.suggestionManagerRoleId)
  )
    return true;
  return false;
}

// ─── Duration parser ──────────────────────────────────────────────────────────

function parseDuration(raw) {
  if (!raw) return { days: DEFAULT_DURATION_DAYS };
  const match = String(raw)
    .trim()
    .match(/^(\d+)\s*(h|d|hour|hours|day|days)$/i);
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

// ─── Guild settings ───────────────────────────────────────────────────────────

async function getGuildSuggestionSettings(guildId) {
  return prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      suggestionChannelId: true,
      suggestionDefaultDuration: true,
      suggestionShowVoters: true,
      suggestionRequireReview: true,
      suggestionAllowImages: true,
      suggestionCreateThreads: true,
      suggestionManagerRoleId: true,
      suggestionMaxPerUser: true,
    },
  });
}

async function ensureGuild(guildId) {
  let guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) {
    guild = await prisma.guild.create({ data: { id: guildId } });
  }
  return guild;
}

async function updateGuildSuggestionSettings(guildId, data) {
  await ensureGuild(guildId);
  return prisma.guild.update({
    where: { id: guildId },
    data,
  });
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

async function createSuggestion({
  guildId,
  authorId,
  title,
  content,
  imageUrl,
  channelId,
  expiresAt,
  category,
  showVoters,
}) {
  let attempts = 0;
  const closesAt =
    expiresAt ||
    new Date(Date.now() + DEFAULT_DURATION_DAYS * 24 * 60 * 60 * 1000);
  const dataDeleteAt = new Date(
    closesAt.getTime() + MAX_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

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
          messageId: null,
          threadId: null,
          expiresAt: closesAt,
          closesAt,
          dataDeleteAt,
          category: category || "GENERAL",
          showVoters: showVoters || false,
          status: "OPEN",
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

async function getSuggestionByMessage(guildId, channelId, messageId) {
  return prisma.suggestion.findFirst({
    where: { guildId, channelId, messageId },
    include: { votes: true },
  });
}

async function updateSuggestion(id, data) {
  return prisma.suggestion.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
    include: { votes: true },
  });
}

async function updateSuggestionByPublicId(publicId, data) {
  return prisma.suggestion.update({
    where: { publicId },
    data: { ...data, updatedAt: new Date() },
    include: { votes: true },
  });
}

async function listPendingSuggestions(
  guildId,
  page = 1,
  perPage = 10,
  categoryFilter = null,
) {
  const where = {
    guildId,
    status: { in: ["OPEN", "PENDING", "UNDER_REVIEW"] },
    expiresAt: { gte: new Date() },
  };
  if (categoryFilter) where.category = categoryFilter;
  return prisma.suggestion.findMany({
    where,
    include: { votes: true },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * perPage,
    take: perPage,
  });
}

async function listMySuggestions(guildId, userId, page = 1, perPage = 10) {
  return prisma.suggestion.findMany({
    where: { guildId, authorId: userId },
    include: { votes: true },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * perPage,
    take: perPage,
  });
}

async function listAdminQueueSuggestions(guildId, page = 1, perPage = 10) {
  return prisma.suggestion.findMany({
    where: {
      guildId,
      status: { in: ["OPEN", "PENDING", "UNDER_REVIEW"] },
    },
    include: { votes: true },
    orderBy: { createdAt: "asc" },
    skip: (page - 1) * perPage,
    take: perPage,
  });
}

async function getUserActiveSuggestionCount(guildId, userId) {
  return prisma.suggestion.count({
    where: {
      guildId,
      authorId: userId,
      status: { in: ["OPEN", "PENDING", "UNDER_REVIEW"] },
    },
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

async function setSuggestionStatus(publicId, status, adminId) {
  return prisma.suggestion.update({
    where: { publicId },
    data: {
      status,
      updatedAt: new Date(),
      ...(status === "APPROVED"
        ? { approvedBy: adminId, approvedAt: new Date() }
        : {}),
      ...(status === "DENIED"
        ? { deniedBy: adminId, deniedAt: new Date() }
        : {}),
      ...(status === "CLOSED"
        ? { closedBy: adminId, closedAt: new Date() }
        : {}),
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

async function purgeSuggestion(id) {
  await prisma.suggestionVote
    .deleteMany({ where: { suggestionId: id } })
    .catch(() => {});
  await prisma.suggestion.delete({ where: { id } }).catch(() => {});
}

// ─── Embed builder ────────────────────────────────────────────────────────────

async function buildSuggestionEmbed(guildIdOrSuggestion, overrideSuggestion) {
  let guildId;
  let suggestion;

  if (
    typeof guildIdOrSuggestion === "object" &&
    guildIdOrSuggestion?.publicId
  ) {
    suggestion = guildIdOrSuggestion;
    guildId = suggestion.guildId;
  } else {
    guildId = guildIdOrSuggestion;
    suggestion = overrideSuggestion;
  }

  const settings = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { themeColor: true },
  });
  const votes = countVotes(suggestion);
  const color = parseInt(
    (settings?.themeColor ?? "#1a7a9e").replace("#", ""),
    16,
  );
  const statusLabel = STATUS_LABELS[suggestion.status] || suggestion.status;
  const catLabel =
    CATEGORY_LABELS[suggestion.category] || CATEGORY_LABELS.GENERAL;

  const embed = new EmbedBuilder()
    .setTitle(`💡 ${suggestion.title || "Suggestion"}`)
    .setColor(color)
    .setFooter({ text: `Discore Suggestions • ${suggestion.publicId}` })
    .setTimestamp(new Date(suggestion.createdAt))
    .addFields(
      { name: "Category", value: catLabel, inline: true },
      { name: "Status", value: statusLabel, inline: true },
      {
        name: "Submitted by",
        value: `<@${suggestion.authorId}>`,
        inline: true,
      },
    );

  // Content preview
  const preview =
    suggestion.content.length > 256
      ? suggestion.content.slice(0, 256) + "..."
      : suggestion.content;
  embed.addFields({ name: "Suggestion", value: preview, inline: false });

  // Duration
  if (
    suggestion.closesAt &&
    ["OPEN", "PENDING", "UNDER_REVIEW"].includes(suggestion.status)
  ) {
    embed.addFields({
      name: "Voting closes",
      value: `<t:${Math.floor(new Date(suggestion.closesAt).getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  // Votes
  embed.addFields({
    name: "Votes",
    value: `👍 ${votes.up} | 👎 ${votes.down}`,
    inline: true,
  });

  // Thread link
  if (suggestion.threadId) {
    embed.addFields({
      name: "💬 Discussion Thread",
      value: `<#${suggestion.threadId}>`,
      inline: false,
    });
  }

  // Closed info
  if (suggestion.status === "CLOSED") {
    if (suggestion.closedBy) {
      embed.addFields({
        name: "Closed by",
        value: `<@${suggestion.closedBy}>`,
        inline: true,
      });
      embed.addFields({
        name: "Closed at",
        value: `<t:${Math.floor(new Date(suggestion.closedAt).getTime() / 1000)}:F>`,
        inline: true,
      });
    } else {
      embed.addFields({
        name: "Closed",
        value: "⌛ Time expired",
        inline: true,
      });
    }
    // Vote result
    const v = countVotes(suggestion);
    const result =
      v.up > v.down
        ? "✅ 👍 Supporters win"
        : v.down > v.up
          ? "❌ 👎 Against wins"
          : "🤝 Tie vote";
    embed.addFields({
      name: "Result",
      value: `${result} (👍 ${v.up} | 👎 ${v.down})`,
      inline: false,
    });
  }

  // Admin info
  if (suggestion.status === "APPROVED" && suggestion.approvedBy) {
    embed.addFields({
      name: "Approved by",
      value: `<@${suggestion.approvedBy}>`,
      inline: true,
    });
    embed.addFields({
      name: "Approved at",
      value: `<t:${Math.floor(new Date(suggestion.approvedAt).getTime() / 1000)}:F>`,
      inline: true,
    });
  }
  if (suggestion.status === "DENIED") {
    if (suggestion.deniedBy) {
      embed.addFields({
        name: "Denied by",
        value: `<@${suggestion.deniedBy}>`,
        inline: true,
      });
      embed.addFields({
        name: "Denied at",
        value: `<t:${Math.floor(new Date(suggestion.deniedAt).getTime() / 1000)}:F>`,
        inline: true,
      });
    }
    if (suggestion.adminNote)
      embed.addFields({
        name: "Reason",
        value: suggestion.adminNote,
        inline: false,
      });
  }

  // Image
  if (suggestion.imageUrl) embed.setImage(suggestion.imageUrl);

  return embed;
}

// ─── Buttons builder ──────────────────────────────────────────────────────────

function buildSuggestionButtons(suggestion) {
  const rows = [];
  const pid = suggestion.publicId;
  const isActive = [
    "OPEN",
    "PENDING",
    "UNDER_REVIEW",
    "PLANNED",
    "IMPLEMENTED",
  ].includes(suggestion.status);

  if (isActive) {
    // Row 1: Vote buttons + thread
    const voteRow = [
      new ButtonBuilder()
        .setCustomId(`sug:up:${pid}`)
        .setLabel("👍 Support")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`sug:down:${pid}`)
        .setLabel("👎 Against")
        .setStyle(ButtonStyle.Danger),
    ];

    if (suggestion.showVoters) {
      voteRow.push(
        new ButtonBuilder()
          .setCustomId(`sug:voters:${pid}:0`)
          .setLabel("Voters")
          .setEmoji("👥")
          .setStyle(ButtonStyle.Primary),
      );
    }

    if (suggestion.threadId) {
      voteRow.push(
        new ButtonBuilder()
          .setLabel("Open Discussion")
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/channels/${suggestion.guildId}/${suggestion.threadId}`,
          ),
      );
    }

    rows.push(new ActionRowBuilder().addComponents(voteRow));

    // Row 2: Edit (author only)
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sug:edit:${pid}`)
          .setLabel("Edit")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  } else {
    // Closed - show voters if public, stale note
    const closedRow = [];
    if (suggestion.showVoters) {
      closedRow.push(
        new ButtonBuilder()
          .setCustomId(`sug:voters:${pid}:0`)
          .setLabel("Voters")
          .setEmoji("👥")
          .setStyle(ButtonStyle.Primary),
      );
    }
    if (suggestion.threadId) {
      closedRow.push(
        new ButtonBuilder()
          .setLabel("Open Discussion")
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/channels/${suggestion.guildId}/${suggestion.threadId}`,
          ),
      );
    }
    if (closedRow.length)
      rows.push(new ActionRowBuilder().addComponents(closedRow));
  }

  return rows;
}

// ─── Admin buttons ────────────────────────────────────────────────────────────
// Admin buttons are no longer shown on the public embed.
// All admin actions are done from /suggestion → Admin Settings.
function buildAdminButtons(_suggestion) {
  return [];
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
    const embed = await buildSuggestionEmbed(suggestion);
    const components = [
      ...buildSuggestionButtons(suggestion),
      ...buildAdminButtons(suggestion),
    ];
    await msg.edit({ embeds: [embed], components }).catch(() => {});
  } catch {
    /* non-fatal */
  }
}

// ─── Thread management ────────────────────────────────────────────────────────

async function createDiscussionThread(client, suggestion) {
  try {
    const ch = await client.channels
      .fetch(suggestion.channelId)
      .catch(() => null);
    if (!ch || !ch.isTextBased()) return null;

    const shortTitle = (suggestion.title || suggestion.content).slice(0, 80);
    const threadName = `Suggestion — ${shortTitle}`;

    let thread;
    if (ch.threads?.create) {
      // If it's a forum/media channel, use create
      thread = await ch.threads
        .create({
          name: threadName,
          autoArchiveDuration: 10080, // 7 days
          reason: `Discussion thread for ${suggestion.publicId}`,
        })
        .catch(() => null);
    } else if (suggestion.messageId) {
      // If we already have a message, create thread from it
      const msg = await ch.messages
        .fetch(suggestion.messageId)
        .catch(() => null);
      if (msg) {
        thread = await msg
          .startThread({
            name: threadName,
            autoArchiveDuration: 10080,
            reason: `Discussion thread for ${suggestion.publicId}`,
          })
          .catch(() => null);
      }
    }

    if (thread) {
      const preview =
        suggestion.content.length > 500
          ? suggestion.content.slice(0, 500) + "..."
          : suggestion.content;
      await thread
        .send({
          content: `💡 **${suggestion.title || "Suggestion"}**\n\n${preview}\n\n━━━━━━━━━━━━\n💬 **Discuss this suggestion here.** Keep it useful, don't turn it into a goblin courtroom.\n\n📎 Suggestion: \`${suggestion.publicId}\``,
        })
        .catch(() => {});

      return thread.id;
    }
    return null;
  } catch (err) {
    console.error(
      `[Suggestions] Thread creation failed for ${suggestion.publicId}:`,
      err.message,
    );
    return null;
  }
}

// ─── Stale message ────────────────────────────────────────────────────────────

const STALE_MESSAGE =
  "This suggestion is no longer managed by Discore. The server may have kept the old post for history, but the suggestion data has been cleaned up.";

module.exports = {
  CATEGORY_LABELS,
  CATEGORY_CHOICES,
  STATUS_LABELS,
  MAX_DURATION_DAYS,
  MAX_RETENTION_DAYS,
  DEFAULT_DURATION_DAYS,
  STALE_MESSAGE,
  parseDuration,
  generatePublicId,
  isAdminOrManager,
  getGuildSuggestionSettings,
  ensureGuild,
  updateGuildSuggestionSettings,
  createSuggestion,
  getSuggestion,
  getSuggestionById,
  getSuggestionByMessage,
  updateSuggestion,
  updateSuggestionByPublicId,
  listPendingSuggestions,
  listMySuggestions,
  listAdminQueueSuggestions,
  getUserActiveSuggestionCount,
  toggleVote,
  getVoters,
  countVotes,
  approveSuggestion,
  denySuggestion,
  setSuggestionStatus,
  deleteSuggestion,
  purgeSuggestion,
  buildSuggestionEmbed,
  buildSuggestionButtons,
  buildAdminButtons,
  tryUpdatePublicEmbed,
  createDiscussionThread,
};
