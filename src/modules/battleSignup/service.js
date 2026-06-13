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

async function createBattleSignup(data) {
  return prisma.battleSignup.create({ data });
}

async function updateSignup(signupId, data) {
  return prisma.battleSignup.update({ where: { id: signupId }, data });
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

function participantList(signup, status) {
  const items = signup.participants
    .filter((p) => p.status === status)
    .map((p, i) => `${i + 1}. <@${p.userId}>`);
  return items.length ? items.join("\n") : "Nobody";
}

function acceptedLabel(signup) {
  const count = signup.participants.filter(
    (p) => p.status === "ACCEPTED",
  ).length;
  return `✅ Accepted (${count}/${signup.teamSize})`;
}

async function buildBattleSignupEmbed(interactionOrGuildId, signup) {
  const t = formatDiscordTime(signup.scheduledAt);
  const isExpired = ["STARTED", "CANCELLED", "COMPLETED"].includes(
    signup.status,
  );

  let statusLine = "";
  if (signup.status === "STARTED")
    statusLine = "\n> ⚔️ **This battle has started!**";
  if (signup.status === "CANCELLED")
    statusLine = "\n> 🚫 **This signup was cancelled.**";
  if (signup.status === "COMPLETED")
    statusLine = "\n> ✅ **Battle completed.**";

  const fields = [
    { name: "⚔️ Gamemode", value: signup.mode || "Open", inline: true },
    { name: "👑 Captain", value: `<@${signup.captainId}>`, inline: true },
    { name: "\u200b", value: "\u200b", inline: true },
    { name: "📅 Date", value: t.shortDate, inline: true },
    { name: "⏰ Time", value: `${t.shortTime} (${t.relative})`, inline: true },
    { name: "\u200b", value: "\u200b", inline: true },
    {
      name: acceptedLabel(signup),
      value: participantList(signup, "ACCEPTED"),
      inline: false,
    },
    {
      name: "🪑 Reserves",
      value: participantList(signup, "RESERVE"),
      inline: true,
    },
    {
      name: "❌ Declined",
      value: participantList(signup, "DECLINED"),
      inline: true,
    },
  ];

  const descriptionBlock = signup.description
    ? `\n> ${signup.description}`
    : "";
  return createDiscoreEmbed(interactionOrGuildId, {
    title: `⚔️ ${signup.title || signup.game}`,
    description: `**Game:** ${signup.game}${descriptionBlock}${statusLine}`,
    fields,
  });
}

/**
 * Build a compact DM embed when a user signs up.
 */
async function buildSignupDmEmbed(client, signup, statusVerb) {
  const t = formatDiscordTime(signup.scheduledAt);
  return new EmbedBuilder()
    .setColor(0x1a7a9e)
    .setTitle("⚔️ Battle Signup Confirmed")
    .setDescription(`You're **${statusVerb}** for an upcoming battle!`)
    .addFields(
      { name: "Game", value: signup.game, inline: true },
      { name: "Mode", value: signup.mode || "–", inline: true },
      { name: "Captain", value: `<@${signup.captainId}>`, inline: true },
      { name: "Starts", value: `${t.full}\n${t.relative}`, inline: false },
    )
    .setFooter({ text: "Click Remind Me to get a heads-up 30 min before." })
    .setTimestamp();
}

function remindMeRow(signupId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`battle:remind:${signupId}`)
      .setLabel("Remind Me")
      .setEmoji("🔔")
      .setStyle(ButtonStyle.Primary),
  );
}

function battleSignupButtons(signupId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`battle:join:${signupId}`)
        .setLabel("Accept")
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
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`battle:remind:${signupId}`)
        .setLabel("Remind Me")
        .setEmoji("🔔")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`battle:settings:${signupId}`)
        .setLabel("Settings")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

module.exports = {
  createBattleSignup,
  updateSignup,
  getSignup,
  setParticipant,
  buildBattleSignupEmbed,
  buildSignupDmEmbed,
  battleSignupButtons,
  remindMeRow,
};
