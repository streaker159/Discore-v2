"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const { randomBytes } = require("crypto");
const prisma = require("../../lib/prisma");
const { getGuildSettings } = require("../../lib/embedBuilder");

const CLEANUP_DAYS = 7;

function genPublicId() {
  return randomBytes(3).toString("hex");
}

// -----------------------------------------------------------------------------
// Type / Status config
// -----------------------------------------------------------------------------

const EVENT_TYPES = {
  EVENT: { icon: "📅", label: "Event", color: 0x5865f2 },
  BATTLE: { icon: "⚔️", label: "Game Sign-On", color: 0xe74c3c },
  TEAM: { icon: "🛡️", label: "Team Event", color: 0x9b59b6 },
  COMMUNITY: { icon: "🌍", label: "Community Event", color: 0x27ae60 },
  TRAINING: { icon: "🎯", label: "Training", color: 0xf39c12 },
  GAME_START: { icon: "🚀", label: "Game Start", color: 0x1abc9c },
  CUSTOM: { icon: "📌", label: "Custom", color: 0x5865f2 },
};

const COLOR_PRESETS = {
  blurple: 0x5865f2,
  red: 0xe74c3c,
  orange: 0xe67e22,
  yellow: 0xf1c40f,
  green: 0x2ecc71,
  teal: 0x1abc9c,
  blue: 0x3498db,
  purple: 0x9b59b6,
  pink: 0xe91e63,
  grey: 0x95a5a6,
};

const STATUS_COLORS = {
  LIVE: 0x2ecc71,
  COMPLETED: 0x95a5a6,
  CANCELLED: 0xe74c3c,
  EXPIRED: 0x7f8c8d,
};

const STATUS_LABELS = {
  UPCOMING: "🔵 Upcoming",
  LIVE: "🟢 Live Now",
  COMPLETED: "✅ Completed",
  CANCELLED: "🚫 Cancelled",
  EXPIRED: "⌛ Expired",
};

function getEventColor(event) {
  // 1. Custom color set by user
  if (event.color) {
    const preset = COLOR_PRESETS[event.color.toLowerCase()];
    if (preset) return preset;
    const hex = parseInt(event.color.replace("#", ""), 16);
    if (!isNaN(hex)) return hex;
  }
  // 2. Status overrides (ended events go grey/red)
  if (STATUS_COLORS[event.status]) return STATUS_COLORS[event.status];
  // 3. Default by type
  return EVENT_TYPES[event.eventType]?.color ?? 0x5865f2;
}

function getTypeInfo(event) {
  const t = EVENT_TYPES[event.eventType] ?? EVENT_TYPES.EVENT;
  const label =
    event.eventType === "CUSTOM" && event.customTypeName
      ? event.customTypeName
      : t.label;
  return { icon: t.icon, label };
}

// -----------------------------------------------------------------------------
// DB helpers
// -----------------------------------------------------------------------------

async function createEvent(data) {
  return prisma.event.create({
    data: {
      ...data,
      publicId: data.publicId ?? genPublicId(),
      eventType: data.eventType ?? "EVENT",
    },
    include: { rsvps: true, guild: true },
  });
}

async function updateEvent(eventId, data) {
  return prisma.event.update({ where: { id: eventId }, data });
}

async function closeEvent(eventId, status = "COMPLETED") {
  // Respect cleanupAfter already chosen at event creation; fall back to default
  const existing = await prisma.event.findUnique({
    where: { id: eventId },
    select: { cleanupAfter: true },
  });
  const cleanupAfter =
    existing?.cleanupAfter ??
    new Date(Date.now() + CLEANUP_DAYS * 24 * 60 * 60 * 1000);
  return prisma.event.update({
    where: { id: eventId },
    data: { status, cleanupAfter },
  });
}

async function setRsvp(eventId, userId, status) {
  return prisma.eventRsvp.upsert({
    where: { eventId_userId: { eventId, userId } },
    update: { status },
    create: { eventId, userId, status },
  });
}

async function removeRsvp(eventId, userId) {
  return prisma.eventRsvp.deleteMany({ where: { eventId, userId } });
}

async function getEvent(eventId, guildId = null) {
  // Try to parse as event number first
  const asNum = parseInt(eventId, 10);
  if (!isNaN(asNum) && guildId) {
    const event = await prisma.event.findFirst({
      where: { guildId, eventNumber: asNum },
      include: { rsvps: true, guild: true },
    });
    if (event) return event;
  }

  // Fall back to ID or publicId lookup
  return prisma.event.findFirst({
    where: { OR: [{ id: eventId }, { publicId: eventId }] },
    include: { rsvps: true, guild: true },
  });
}

async function getUpcomingEvents(guildId) {
  return prisma.event.findMany({
    where: { guildId, status: { in: ["UPCOMING", "LIVE"] } },
    orderBy: { scheduledAt: "asc" },
    include: { rsvps: true },
  });
}

async function claimNotification(
  eventId,
  guildId,
  notificationType,
  extra = {},
) {
  try {
    await prisma.eventNotificationLog.create({
      data: {
        id: randomBytes(4).toString("hex"),
        eventId,
        guildId,
        notificationType,
        channelId: extra.channelId ?? null,
        roleId: extra.roleId ?? null,
        messageId: extra.messageId ?? null,
      },
    });
    return true;
  } catch (err) {
    if (err.code === "P2002") return false;
    throw err;
  }
}

async function setEventReminder(eventId, userId, remindAt) {
  return prisma.eventReminder.upsert({
    where: { eventId_userId: { eventId, userId } },
    update: { remindAt, sentAt: null },
    create: { id: randomBytes(4).toString("hex"), eventId, userId, remindAt },
  });
}

async function removeEventReminder(eventId, userId) {
  return prisma.eventReminder.deleteMany({ where: { eventId, userId } });
}

// -----------------------------------------------------------------------------
// RSVP helpers
// -----------------------------------------------------------------------------

function rsvpCounts(event) {
  const going = event.rsvps.filter((r) => r.status === "GOING").length;
  const maybe = event.rsvps.filter((r) => r.status === "MAYBE").length;
  const notGoing = event.rsvps.filter((r) => r.status === "NOT_GOING").length;
  return { going, maybe, notGoing };
}

/** Returns a compact mention list � always safe for embed field values (=1024 chars) */
function rsvpList(event, status, max = 8) {
  const items = event.rsvps
    .filter((r) => r.status === status)
    .map((r) => `<@${r.userId}>`);
  if (!items.length) return "*none*";
  const shown = items.slice(0, max).join(" ");
  return items.length > max ? `${shown}\n*+${items.length - max} more*` : shown;
}

// -----------------------------------------------------------------------------
// Embed builders
// -----------------------------------------------------------------------------

async function buildEventEmbed(guildIdOrInteraction, event) {
  const guildId =
    typeof guildIdOrInteraction === "string"
      ? guildIdOrInteraction
      : guildIdOrInteraction.guildId;
  const settings = await getGuildSettings(guildId).catch(() => null);
  const serverIcon = settings?.allianceLogo ?? null;

  const unix = Math.floor(new Date(event.scheduledAt).getTime() / 1000);
  const { icon, label } = getTypeInfo(event);
  const { going, maybe, notGoing } = rsvpCounts(event);
  const color = getEventColor(event);
  const isEnded = ["COMPLETED", "CANCELLED", "EXPIRED"].includes(event.status);
  const isBattle = event.eventType === "BATTLE";
  const fields = [];

  // ── Row 1: Status | Type | When ──────────────────────────────────────────
  fields.push({
    name: "Status",
    value: STATUS_LABELS[event.status] ?? "Unknown",
    inline: true,
  });

  const typeVal = [`${icon} ${label}`, event.game ? `🎮 ${event.game}` : null]
    .filter(Boolean)
    .join("\n");
  fields.push({ name: "Type", value: typeVal, inline: true });

  fields.push({
    name: "When",
    value: `<t:${unix}:F>\n<t:${unix}:R>`,
    inline: true,
  });

  // ── Row 2: Location | Reminder (optional inline pair) ────────────────────
  if (event.location) {
    const locVal = event.location.startsWith("http")
      ? `[🔗 Open link](${event.location})`
      : `📍 ${event.location}`;
    fields.push({ name: "📍 Location", value: locVal, inline: true });
  }
  if (!isEnded && event.reminderBeforeMinutes) {
    const m = event.reminderBeforeMinutes;
    fields.push({
      name: "⏰ Channel Reminder",
      value: `${m >= 60 ? `${m / 60}h` : `${m}m`} before start`,
      inline: true,
    });
  }

  // ── Battle slot bar ───────────────────────────────────────────────────────
  if (!isEnded && isBattle && event.teamSize) {
    const bar = buildSlotBar(going, event.teamSize);
    fields.push({
      name: "⚔️ Slots",
      value: `${bar}\n**${going} / ${event.teamSize}** signed on`,
      inline: false,
    });
  }

  // ── RSVP sections ─────────────────────────────────────────────────────────
  if (!isEnded) {
    if (isBattle) {
      fields.push({
        name: `✅ Available (${going}${event.teamSize ? `/${event.teamSize}` : ""})`,
        value: rsvpList(event, "GOING"),
        inline: false,
      });
      if (maybe > 0)
        fields.push({
          name: `🔄 Reserve (${maybe})`,
          value: rsvpList(event, "MAYBE"),
          inline: true,
        });
      if (notGoing > 0)
        fields.push({
          name: `❌ Not Available (${notGoing})`,
          value: rsvpList(event, "NOT_GOING"),
          inline: true,
        });
    } else {
      fields.push({
        name: `✅ Going (${going})`,
        value: rsvpList(event, "GOING"),
        inline: false,
      });
      if (maybe > 0)
        fields.push({
          name: `🤔 Maybe (${maybe})`,
          value: rsvpList(event, "MAYBE"),
          inline: true,
        });
      if (notGoing > 0)
        fields.push({
          name: `❌ Not Going (${notGoing})`,
          value: rsvpList(event, "NOT_GOING"),
          inline: true,
        });
    }
  } else {
    const goingLabel = isBattle ? "signed on" : "went";
    fields.push({
      name: "📋 Final Attendance",
      value: [
        `✅ **${going}** ${goingLabel}`,
        maybe > 0 ? `🔄 **${maybe}** reserve` : null,
        notGoing > 0 ? `❌ **${notGoing}** declined` : null,
      ]
        .filter(Boolean)
        .join("  •  "),
      inline: false,
    });
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const footerParts = ["Powered by Discore"];
  if (event.eventNumber) footerParts.push(`#${event.eventNumber}`);
  else if (event.publicId) footerParts.push(`ID: ${event.publicId}`);
  if (event.timezoneUsed && event.timezoneUsed !== "UTC")
    footerParts.push(`🌍 ${event.timezoneUsed}`);

  const embed = new EmbedBuilder()
    .setTitle(`${icon} ${label}: ${event.title}`)
    .setColor(color)
    .addFields(fields)
    .setFooter({ text: footerParts.join(" • ") })
    .setTimestamp();

  if (event.description) embed.setDescription(event.description);
  if (event.thumbnailUrl) embed.setThumbnail(event.thumbnailUrl);
  else if (serverIcon) embed.setThumbnail(serverIcon);
  if (event.imageUrl) embed.setImage(event.imageUrl);

  return embed;
}

/** Visual slot-fill bar — 10 segments using block characters */
function buildSlotBar(filled, total) {
  if (!total || total <= 0) return "";
  const pct = Math.min(1, filled / total);
  const on = Math.round(pct * 10);
  const bar = "█".repeat(on) + "░".repeat(10 - on);
  return `\`[${bar}]\``;
}

function buildEventReminderEmbed(event, minsUntil, opts = {}) {
  const { started = false } = opts;
  const unix = Math.floor(new Date(event.scheduledAt).getTime() / 1000);
  const { icon, label } = getTypeInfo(event);
  const isBattle = event.eventType === "BATTLE";
  const timeStr =
    minsUntil <= 0
      ? "**starting now!**"
      : `in **${minsUntil} minute${minsUntil !== 1 ? "s" : ""}**`;

  const embed = new EmbedBuilder()
    .setColor(started ? 0x2ecc71 : isBattle ? 0xe74c3c : 0xf1c40f)
    .setTitle(
      started
        ? `✅ ${isBattle ? "Battle" : label} Started!`
        : `⏰ ${isBattle ? "Battle" : label} Starting Soon!`,
    )
    .setDescription(
      started
        ? `**${icon} ${event.title}**\n\nThe event has started!`
        : `**${icon} ${event.title}**\n\nStarts ${timeStr}`,
    )
    .addFields({
      name: "When",
      value: `<t:${unix}:F>\n<t:${unix}:R>`,
      inline: false,
    })
    .setFooter({ text: "Powered by Discore" })
    .setTimestamp();

  if (event.location)
    embed.addFields({
      name: "📍 Location",
      value: event.location,
      inline: false,
    });
  if (event.thumbnailUrl) embed.setThumbnail(event.thumbnailUrl);
  return embed;
}

// -----------------------------------------------------------------------------
// Button builders
// -----------------------------------------------------------------------------

/**
 * Build action rows for an event embed.
 * @param {string} eventId
 * @param {boolean} isEnded
 * @param {string} eventType  � e.g. "BATTLE", "EVENT"
 * @param {number|null} teamSize � slots (for battle slot display)
 */
/**
 * @param {string} eventId
 * @param {boolean} isEnded   - COMPLETED/CANCELLED/EXPIRED
 * @param {string}  eventType - e.g. "BATTLE"
 * @param {number|null} teamSize
 * @param {boolean} isLive    - currently LIVE (started)
 */
function eventButtons(
  eventId,
  isEnded = false,
  eventType = "EVENT",
  teamSize = null,
  isLive = false,
) {
  if (isLive) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`event:delete:${eventId}`)
          .setLabel("Delete Embed")
          .setStyle(ButtonStyle.Danger),
      ),
    ];
  }
  if (isEnded) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`event:refresh:${eventId}`)
          .setLabel("Refresh")
          .setStyle(ButtonStyle.Secondary),
      ),
    ];
  }

  const isBattle = eventType === "BATTLE";

  const rsvpRow = new ActionRowBuilder().addComponents(
    isBattle
      ? [
          new ButtonBuilder()
            .setCustomId(`event:rsvp:going:${eventId}`)
            .setLabel("Available")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`event:rsvp:not:${eventId}`)
            .setLabel("Not Available")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`event:rsvp:maybe:${eventId}`)
            .setLabel("Reserve")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`event:remind:${eventId}`)
            .setLabel("Remind Me")
            .setStyle(ButtonStyle.Primary),
        ]
      : [
          new ButtonBuilder()
            .setCustomId(`event:rsvp:going:${eventId}`)
            .setLabel("Going")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`event:rsvp:maybe:${eventId}`)
            .setLabel("Maybe")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`event:rsvp:not:${eventId}`)
            .setLabel("Not Going")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`event:remind:${eventId}`)
            .setLabel("Remind Me")
            .setStyle(ButtonStyle.Primary),
        ],
  );

  const mgmtRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`event:refresh:${eventId}`)
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`event:edit:${eventId}`)
      .setLabel("Edit")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`event:delete:${eventId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  return [rsvpRow, mgmtRow];
}
module.exports = {
  createEvent,
  updateEvent,
  closeEvent,
  setRsvp,
  removeRsvp,
  getEvent,
  getUpcomingEvents,
  claimNotification,
  setEventReminder,
  removeEventReminder,
  buildEventEmbed,
  buildEventReminderEmbed,
  eventButtons,
  rsvpCounts,
  getTypeInfo,
  STATUS_LABELS,
  EVENT_TYPES,
  COLOR_PRESETS,
};
