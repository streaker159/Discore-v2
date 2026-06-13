const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const prisma = require("../../lib/prisma");
const { createDiscoreEmbed } = require("../../lib/embedBuilder");

async function createSuggestion(data) {
  return prisma.suggestion.create({ data, include: { votes: true } });
}

async function vote(suggestionId, userId, type) {
  return prisma.suggestionVote.upsert({
    where: { suggestionId_userId: { suggestionId, userId } },
    update: { type },
    create: { suggestionId, userId, type },
  });
}

async function removeVote(suggestionId, userId) {
  return prisma.suggestionVote.deleteMany({ where: { suggestionId, userId } });
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

async function getSuggestion(id) {
  return prisma.suggestion.findUnique({
    where: { id },
    include: { votes: true },
  });
}

function countVotes(suggestion) {
  return {
    up: suggestion.votes.filter((v) => v.type === "UP").length,
    down: suggestion.votes.filter((v) => v.type === "DOWN").length,
  };
}

async function buildSuggestionEmbed(interaction, suggestion) {
  const votes = countVotes(suggestion);
  return createDiscoreEmbed(interaction, {
    title: "💡 Suggestion",
    description: suggestion.content,
    image: suggestion.imageUrl || undefined,
    fields: [
      { name: "Author", value: `<@${suggestion.authorId}>`, inline: true },
      { name: "Status", value: suggestion.status, inline: true },
      {
        name: "Votes",
        value: `👍 ${votes.up} • 👎 ${votes.down}`,
        inline: true,
      },
    ],
  });
}

function suggestionButtons(suggestionId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`suggestion:up:${suggestionId}`)
        .setLabel("Upvote")
        .setEmoji("👍")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`suggestion:down:${suggestionId}`)
        .setLabel("Downvote")
        .setEmoji("👎")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

module.exports = {
  createSuggestion,
  vote,
  removeVote,
  getVoters,
  getSuggestion,
  buildSuggestionEmbed,
  suggestionButtons,
};
