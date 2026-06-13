const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const prisma = require("../../lib/prisma");
const {
  createDiscoreEmbed,
  formatDiscordTime,
} = require("../../lib/embedBuilder");

async function createEvent(data) {
  return prisma.event.create({ data });
}

async function updateEvent(eventId, data) {
  return prisma.event.update({ where: { id: eventId }, data });
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

async function getEvent(eventId) {
  return prisma.event.findUnique({
    where: { id: eventId },
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

function rsvpCounts(event) {
  const going = event.rsvps.filter((r) => r.status === "GOING").length;
  const maybe = event.rsvps.filter((r) => r.status === "MAYBE").length;
  const notGoing = event.rsvps.filter((r) => r.status === "NOT_GOING").length;
  return { going, maybe, notGoing };
}

function rsvpLines(event, status, max = 15) {
  const items = event.rsvps
    .filter((r) => r.status === status)
    .map((r) => `<@${r.userId}>`);
  if (!items.length) return "*None yet*";
  const shown = items.slice(0, max).join(", ");
  return items.length > max ? `${shown} +${items.length - max} more` : shown;
}

async function buildEventEmbed(interactionOrGuildId, event) {
  const t = formatDiscordTime(event.scheduledAt);
  const { going, maybe, notGoing } = rsvpCounts(event);

  let statusBanner = "";
  if (event.status === "LIVE")
    statusBanner = "\n> 🚀 **This event is happening now!**";
  if (event.status === "COMPLETED")
    statusBanner = "\n> ✅ **This event has ended.**";
  if (event.status === "CANCELLED")
    statusBanner = "\n> 🚫 **This event was cancelled.**";

  const fields = [
    { name: "📅 Date", value: t.shortDate, inline: true },
    { name: "⏰ Time", value: `${t.shortTime} — ${t.full}`, inline: true },
    { name: "⏳ Starts", value: t.relative, inline: true },
  ];

  if (event.location) {
    const locVal = event.location.startsWith("http")
      ? `[📍 View location](${event.location})`
      : `📍 ${event.location}`;
    fields.push({ name: "Location", value: locVal, inline: false });
  }

  fields.push(
    {
      name: `✅ Going (${going})`,
      value: rsvpLines(event, "GOING"),
      inline: false,
    },
    {
      name: `🤔 Maybe (${maybe})`,
      value: rsvpLines(event, "MAYBE"),
      inline: true,
    },
    {
      name: `❌ Not going (${notGoing})`,
      value: rsvpLines(event, "NOT_GOING"),
      inline: true,
    },
  );

  return createDiscoreEmbed(interactionOrGuildId, {
    title: `📅 ${event.title}`,
    description: (event.description || "") + statusBanner,
    image: event.imageUrl || undefined,
    thumbnail: event.thumbnailUrl || undefined,
    fields,
  });
}

/**
 * A compact DM embed for reminders.
 */
function buildEventReminderEmbed(event, minsUntil) {
  const t = formatDiscordTime(event.scheduledAt);
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`⏰ Event Starting in ${minsUntil} Minutes!`)
    .setDescription(`**${event.title}**`)
    .addFields(
      { name: "When", value: `${t.full} (${t.relative})`, inline: false },
      { name: "Location", value: event.location || "–", inline: false },
    )
    .setFooter({ text: "Powered by Discore" })
    .setTimestamp();
}

function eventButtons(eventId, isEnded = false) {
  if (isEnded) return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`event:rsvp:going:${eventId}`)
        .setLabel("Going")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`event:rsvp:maybe:${eventId}`)
        .setLabel("Maybe")
        .setEmoji("🤔")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`event:rsvp:not:${eventId}`)
        .setLabel("Not going")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`event:remind:${eventId}`)
        .setLabel("Remind Me")
        .setEmoji("🔔")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`event:edit:${eventId}`)
        .setLabel("Edit")
        .setEmoji("✏️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`event:delete:${eventId}`)
        .setLabel("Delete")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

module.exports = {
  createEvent,
  updateEvent,
  setRsvp,
  removeRsvp,
  getEvent,
  getUpcomingEvents,
  buildEventEmbed,
  buildEventReminderEmbed,
  eventButtons,
  rsvpCounts,
};
