"use strict";

const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const path = require("path");
const fs = require("fs");

const OFFICIAL_INVITE =
  process.env.SAFE_OFFICIAL_INVITE || "https://discord.gg/ddG42cF25u";

const PRIZES = [
  { label: "🎮 Free Month of Discord Nitro", value: "discord_nitro_month" },
  {
    label: "💎 Free Premium Month for Server of Discore",
    value: "discore_premium_month",
  },
  { label: "🧠 5,000 Discore AI Credits", value: "discore_ai_credits_5000" },
  { label: "🎁 $10 Apple / Android Gift Card", value: "gift_card_10" },
];

function getPrizeLabel(value) {
  const prize = PRIZES.find((p) => p.value === value);
  return prize ? prize.label : value || "Unknown";
}

function getImagePath(name) {
  // Try multiple paths to be resilient
  const candidates = [
    path.join(__dirname, "..", "..", "assets", "safe", name),
    path.join(__dirname, "..", "..", "..", "assets", "safe", name),
    path.join(__dirname, "..", "..", "..", "safe", name),
    path.join(__dirname, "..", "safe", name),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function createAttachment(name) {
  const filePath = getImagePath(name);
  if (!filePath) {
    const logger = require("../../lib/logger");
    logger.warn("Safe image not found", { image: name });
    return null;
  }
  try {
    return new AttachmentBuilder(filePath, { name });
  } catch (e) {
    const logger = require("../../lib/logger");
    logger.warn("Failed to create safe attachment", {
      image: name,
      error: e.message,
    });
    return null;
  }
}

// ── Active (sealed) embed ──────────────────────────────────

function buildActiveEmbed(globalAttemptCount) {
  const closedAttachment = createAttachment("closed.png");

  const label = globalAttemptCount === 1 ? "attempt" : "attempts";

  const embed = new EmbedBuilder()
    .setColor(0x00ff00) // green
    .setTitle("🟢 The Discore Vault Is Sealed")
    .setDescription(
      "A 4-digit code is hidden inside the vault. Every user gets **5 attempts per day**. Crack it, choose your prize, and become the menace who opened the box.",
    )
    .addFields(
      {
        name: "🌍 Global Attempts On This Vault",
        value: `\`${globalAttemptCount} ${label}\``,
        inline: false,
      },
      {
        name: "🎁 Possible Prizes",
        value: PRIZES.map((p) => p.label).join("\n"),
        inline: false,
      },
      {
        name: "🔗 Official Server",
        value: OFFICIAL_INVITE,
        inline: false,
      },
      {
        name: "📜 Rules",
        value:
          "Free promotional game. No purchase required. Prizes are manually reviewed by Discore Official.",
        inline: false,
      },
    )
    .setFooter({
      text: "Discore Vault • One global safe • 5 attempts per user per day",
    });

  if (closedAttachment) {
    embed.setImage("attachment://closed.png");
  }

  return { embed, attachment: closedAttachment };
}

// ── Wrong code embed ──────────────────────────────────────

function buildWrongEmbed(attemptsUsed, maxAttempts, nextResetTimestamp) {
  const attemptsLeft = Math.max(0, maxAttempts - attemptsUsed);
  const closedAttachment = createAttachment("closed.png");

  const embed = new EmbedBuilder()
    .setColor(0xff0000) // red
    .setTitle("🔴 Wrong Code")
    .setDescription("The vault stayed shut. It may have judged you a little.")
    .addFields(
      {
        name: "👤 Your Attempts Today",
        value: `\`${attemptsUsed}/${maxAttempts}\``,
        inline: true,
      },
      {
        name: "🔁 Attempts Reset",
        value: nextResetTimestamp ? `<t:${nextResetTimestamp}:R>` : "Tomorrow",
        inline: true,
      },
      { name: "Status", value: "Locked", inline: true },
    )
    .setFooter({
      text: "Discore Vault • Try again if you still have attempts",
    });

  if (closedAttachment) {
    embed.setImage("attachment://closed.png");
  }

  return { embed, attachment: closedAttachment, attemptsLeft };
}

// ── Cracked (open) embed ──────────────────────────────────

function buildCrackedEmbed(winnerTag, guildName, attemptsUsed, maxAttempts) {
  const openAttachment = createAttachment("open.png");

  const embed = new EmbedBuilder()
    .setColor(0xffd700) // gold
    .setTitle("🏆 The Discore Vault Has Been Cracked")
    .setDescription(
      "The lock has fallen. The code has been beaten. Choose your prize below before the vault goblins change their mind.",
    )
    .addFields(
      { name: "Winner", value: winnerTag, inline: true },
      { name: "Server", value: guildName, inline: true },
      {
        name: "Attempts Used Today",
        value: `${attemptsUsed}/${maxAttempts}`,
        inline: true,
      },
      { name: "Status", value: "Awaiting Prize Selection", inline: true },
    )
    .setFooter({
      text: "Discore Vault • Prize must be claimed in the official server",
    });

  if (openAttachment) {
    embed.setImage("attachment://open.png");
  }

  return { embed, attachment: openAttachment };
}

// ── Global announcement embed ─────────────────────────────

function buildAnnouncementEmbed(winnerName, guildName, prizeLabel) {
  const openAttachment = createAttachment("open.png");

  const embed = new EmbedBuilder()
    .setColor(0xffd700) // gold
    .setTitle("🏆 THE DISCORE VAULT HAS BEEN CRACKED")
    .setDescription(
      "The global vault has opened. Somewhere in the Discore network, one absolute menace guessed the code and walked away with treasure.",
    )
    .addFields(
      { name: "Winner", value: winnerName, inline: true },
      { name: "Winning Server", value: guildName, inline: true },
      { name: "Prize Selected", value: prizeLabel, inline: true },
      { name: "Official Server", value: OFFICIAL_INVITE, inline: false },
    )
    .setFooter({
      text: "Discore Official • The vault has been resealed with a new code",
    });

  if (openAttachment) {
    embed.setImage("attachment://open.png");
  }

  return { embed, attachment: openAttachment };
}

// ── Admin: new code log ───────────────────────────────────

function buildAdminNewCodeEmbed(roundId, code, generatedAt) {
  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("🔐 New Discore Vault Code Generated")
    .addFields(
      { name: "Round ID", value: roundId, inline: false },
      { name: "Code", value: `||${code}||`, inline: false },
      { name: "Generated At", value: String(generatedAt), inline: false },
      { name: "Status", value: "ACTIVE", inline: false },
    )
    .setTimestamp();
}

// ── Admin: vault cracked log ──────────────────────────────

function buildAdminCrackedEmbed(data) {
  return new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🏆 Discore Vault Cracked")
    .addFields(
      { name: "Round ID", value: data.roundId, inline: false },
      { name: "Code", value: `||${data.code}||`, inline: false },
      { name: "Winner ID", value: data.winnerId, inline: true },
      { name: "Winner Tag", value: data.winnerTag, inline: true },
      {
        name: "Winner Display Name",
        value: data.winnerDisplayName || "N/A",
        inline: true,
      },
      { name: "Server Name", value: data.guildName, inline: true },
      { name: "Server ID", value: data.guildId, inline: true },
      { name: "Channel ID", value: data.channelId || "N/A", inline: true },
      {
        name: "Attempts Used Today",
        value: `${data.attemptsUsed}/${data.maxAttempts}`,
        inline: true,
      },
      {
        name: "Prize Selected",
        value: getPrizeLabel(data.selectedPrize),
        inline: false,
      },
      { name: "Prize Status", value: "PENDING_CLAIM", inline: false },
      { name: "Cracked At", value: String(data.crackedAt), inline: false },
      {
        name: "Official Server Invite",
        value: OFFICIAL_INVITE,
        inline: false,
      },
      {
        name: "Owner",
        value: `<@${data.ownerId || "462858253252952065"}>`,
        inline: false,
      },
    )
    .setTimestamp();
}

// ── Prize confirmation embed ──────────────────────────────

function buildPrizeConfirmationEmbed(prizeLabel) {
  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("🏆 Vault prize selected!")
    .setDescription(
      `**Prize:** ${prizeLabel}\n\nYour prize has been logged as **PENDING CLAIM**.\n\nTo claim it, join/contact the official Discore server:\n${OFFICIAL_INVITE}\n\nA Discore admin will review it manually.`,
    );
}

// ── No attempts left embed ────────────────────────────────

function buildNoAttemptsLeftEmbed(
  attemptsUsed,
  maxAttempts,
  nextResetTimestamp,
) {
  return new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("⏳ No Attempts Left")
    .setDescription(
      "You have used all 5 safecrack attempts today. Come back when the vault goblins refill your keypad privileges.",
    )
    .addFields(
      {
        name: "👤 Your Attempts Today",
        value: `\`${attemptsUsed}/${maxAttempts}\``,
        inline: true,
      },
      {
        name: "🔁 Attempts Reset",
        value: nextResetTimestamp ? `<t:${nextResetTimestamp}:R>` : "Tomorrow",
        inline: true,
      },
    )
    .setFooter({ text: "Discore Vault • Attempts reset daily" });
}

module.exports = {
  PRIZES,
  getPrizeLabel,
  getImagePath,
  createAttachment,
  buildActiveEmbed,
  buildWrongEmbed,
  buildCrackedEmbed,
  buildAnnouncementEmbed,
  buildAdminNewCodeEmbed,
  buildAdminCrackedEmbed,
  buildPrizeConfirmationEmbed,
  buildNoAttemptsLeftEmbed,
  OFFICIAL_INVITE,
};
