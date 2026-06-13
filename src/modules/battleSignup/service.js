const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const prisma = require("../../lib/prisma");
const {
  createDiscoreEmbed,
  formatDiscordTime,
} = require("../../lib/embedBuilder");

async function createBattleSignup(data) {
  return prisma.battleSignup.create({ data });
}

async function setParticipant(signupId, userId, status) {
  return prisma.signupParticipant.upsert({
    where: { signupId_userId: { signupId, userId } },
    update: { status },
    create: { signupId, userId, status },
  });
}

async function getSignup(signupId) {
  return prisma.battleSignup.findUnique({
    where: { id: signupId },
    include: { participants: true, guild: true },
  });
}

function participantLines(signup, status) {
  const users = signup.participants
    .filter((p) => p.status === status)
    .map((p, idx) => `${idx + 1}. <@${p.userId}>`);
  return users.length ? users.join("\n") : "None yet";
}

async function buildBattleSignupEmbed(interactionOrGuildId, signup) {
  const t = formatDiscordTime(signup.scheduledAt);
  return createDiscoreEmbed(interactionOrGuildId, {
    title: "⚔️ Battle Signup",
    description: `**Game:** ${signup.game}\n**Mode:** ${signup.mode || "Not set"}\n**Captain:** <@${signup.captainId}>\n**Team size:** ${signup.teamSize}\n**Status:** ${signup.status}`,
    fields: [
      { name: "Time", value: `${t.full}\nStarts ${t.relative}`, inline: false },
      {
        name: "Accepted",
        value: participantLines(signup, "ACCEPTED"),
        inline: true,
      },
      {
        name: "Reserves",
        value: participantLines(signup, "RESERVE"),
        inline: true,
      },
      {
        name: "Declined",
        value: participantLines(signup, "DECLINED"),
        inline: true,
      },
    ],
  });
}

function battleSignupButtons(signupId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`battle:join:${signupId}`)
        .setLabel("Join")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`battle:reserve:${signupId}`)
        .setLabel("Reserve")
        .setEmoji("🪑")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`battle:decline:${signupId}`)
        .setLabel("Decline")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`battle:remind:${signupId}`)
        .setLabel("Remind me")
        .setEmoji("🔔")
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`battle:cancel:${signupId}`)
        .setLabel("Cancel signup")
        .setEmoji("🚫")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

module.exports = {
  createBattleSignup,
  getSignup,
  setParticipant,
  buildBattleSignupEmbed,
  battleSignupButtons,
};
