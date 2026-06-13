const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const prisma = require('../../lib/prisma');
const { createDiscoreEmbed, formatDiscordTime } = require('../../lib/embedBuilder');

async function createEvent(data) {
  return prisma.event.create({ data });
}

async function setRsvp(eventId, userId, status) {
  return prisma.eventRsvp.upsert({
    where: { eventId_userId: { eventId, userId } },
    update: { status },
    create: { eventId, userId, status },
  });
}

async function getEvent(eventId) {
  return prisma.event.findUnique({ where: { id: eventId }, include: { rsvps: true, guild: true } });
}

async function buildEventEmbed(interaction, event) {
  const t = formatDiscordTime(event.scheduledAt);
  return createDiscoreEmbed(interaction, {
    title: `📅 ${event.title}`,
    description: event.description || 'No description provided.',
    image: event.imageUrl || undefined,
    fields: [
      { name: 'When', value: `${t.full}\nStarts ${t.relative}`, inline: false },
      { name: 'Location', value: event.location || 'Not set', inline: true },
      { name: 'Status', value: event.status, inline: true },
    ],
  });
}

function eventButtons(eventId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`event:rsvp:going:${eventId}`).setLabel('Going').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`event:rsvp:maybe:${eventId}`).setLabel('Maybe').setEmoji('🤔').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`event:rsvp:not:${eventId}`).setLabel('Not going').setEmoji('❌').setStyle(ButtonStyle.Danger),
  )];
}

module.exports = { createEvent, setRsvp, getEvent, buildEventEmbed, eventButtons };
