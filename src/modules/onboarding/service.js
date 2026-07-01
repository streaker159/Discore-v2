"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const prisma = require("../../lib/prisma");

const RECOMMENDED_ROLES = [
  {
    name: "Discore Manager",
    color: "#3498db",
    field: "discoreManagerRoleId",
    desc: "Manages main Discore setup and tools",
  },
  {
    name: "Discore Admin",
    color: "#e74c3c",
    field: "disAdminRoleId",
    desc: "Advanced Discore/admin controls",
    hoist: true,
  },
  {
    name: "Scoreboard Manager",
    color: "#1abc9c",
    field: "scoreboardManagerRoleId",
    desc: "Manages scoreboards",
  },
  {
    name: "Appeal Ping",
    color: "#e67e22",
    field: "discoreAppealRoleId",
    desc: "Pinged when appeals need review",
  },
  {
    name: "Muted",
    color: "#95a5a6",
    field: "discoreMutedRoleId",
    desc: "Used by moderation/mute systems",
  },
  {
    name: "Discore Official",
    color: "#5865F2",
    field: null,
    desc: "Official Discore update pings",
    mentionable: true,
  },
];

const CHANNEL_LAYOUT = [
  {
    category: "Discore",
    channels: [
      {
        name: "bot-commands",
        field: null,
        desc: "Safe place for bot commands",
        type: ChannelType.GuildText,
      },
      {
        name: "📢・discore-announcements",
        field: "announcementChannelId",
        desc: "Official Discore updates & announcements",
        type: ChannelType.GuildText,
      },
      {
        name: "scoreboards",
        field: "scoreboardChan",
        desc: "Default live scoreboard channel",
        type: ChannelType.GuildText,
      },
      {
        name: "suggestions",
        field: "suggestionChannelId",
        desc: "Suggestions are posted here",
        type: ChannelType.GuildText,
      },
      {
        name: "premium-notices",
        field: "premiumNoticeChan",
        desc: "Premium/system notices",
        type: ChannelType.GuildText,
      },
    ],
  },
  {
    category: "Moderation",
    channels: [
      {
        name: "mod-log",
        field: "moderationLogChannelId",
        desc: "Moderation logs",
        type: ChannelType.GuildText,
      },
      {
        name: "admin-reports",
        field: "adminReportsChannelId",
        desc: "Admin/bot status reports",
        type: ChannelType.GuildText,
      },
    ],
  },
  {
    category: "Appeals",
    channels: [
      {
        name: "appeals",
        field: "appealChannelId",
        desc: "Appeal dashboards are posted here",
        type: ChannelType.GuildText,
      },
    ],
  },
];

// ─── Channel finder ───────────────────────────────────────────────────────────

function findBestChannel(guild) {
  const me = guild.members.me;
  const canPost = (ch) => {
    if (!ch.isTextBased() || ch.isThread()) return false;
    const perms = ch.permissionsFor(me);
    return (
      perms?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ]) ?? false
    );
  };

  // 1. System channel
  if (guild.systemChannel && canPost(guild.systemChannel))
    return guild.systemChannel;

  // 2. welcome
  const welcome = guild.channels.cache.find(
    (c) => c.name === "welcome" && canPost(c),
  );
  if (welcome) return welcome;

  // 3. general
  const general = guild.channels.cache.find(
    (c) => c.name === "general" && canPost(c),
  );
  if (general) return general;

  // 4. bot-commands
  const botCmd = guild.channels.cache.find(
    (c) => c.name === "bot-commands" && canPost(c),
  );
  if (botCmd) return botCmd;

  // 5. First text channel with perms
  return guild.channels.cache.find((c) => canPost(c)) || null;
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

async function createOrReuseRole(guild, roleDef) {
  const existing = guild.roles.cache.find((r) => r.name === roleDef.name);
  if (existing) {
    // Update guild settings if not already set
    return {
      created: false,
      reused: true,
      id: existing.id,
      name: roleDef.name,
    };
  }
  try {
    const role = await guild.roles.create({
      name: roleDef.name,
      color: parseInt(roleDef.color.replace("#", ""), 16),
      hoist: roleDef.hoist || false,
      reason: "Discore auto-setup",
    });
    return { created: true, reused: false, id: role.id, name: roleDef.name };
  } catch {
    return {
      created: false,
      reused: false,
      id: null,
      name: roleDef.name,
      error: true,
    };
  }
}

async function setupRoles(guild) {
  const guildData = await prisma.guild.findUnique({
    where: { id: guild.id },
    select: { id: true },
  });
  const updates = {};
  const results = [];

  for (const roleDef of RECOMMENDED_ROLES) {
    const existing = guild.roles.cache.find((r) => r.name === roleDef.name);
    if (existing) {
      updates[roleDef.field] = existing.id;
      results.push({ name: roleDef.name, reused: true, id: existing.id });
    } else {
      const result = await createOrReuseRole(guild, roleDef);
      if (result.id) {
        updates[roleDef.field] = result.id;
        results.push({
          name: roleDef.name,
          created: result.created,
          reused: result.reused,
          id: result.id,
        });
      } else {
        results.push({ name: roleDef.name, error: true });
      }
    }
  }

  if (Object.keys(updates).length) {
    await prisma.guild.update({ where: { id: guild.id }, data: updates });
  }

  return results;
}

// ─── Channel helpers ──────────────────────────────────────────────────────────

async function createOrReuseChannel(guild, name, type, parentId) {
  const existing = guild.channels.cache.find(
    (c) => c.name === name && c.type === type,
  );
  if (existing) return { created: false, reused: true, id: existing.id, name };
  try {
    const ch = await guild.channels.create({
      name,
      type,
      parent: parentId || undefined,
      reason: "Discore auto-setup",
    });
    return { created: true, reused: false, id: ch.id, name };
  } catch {
    return { created: false, reused: false, id: null, name, error: true };
  }
}

async function setupChannels(guild) {
  const guildData = await prisma.guild.findUnique({
    where: { id: guild.id },
    select: { id: true },
  });
  const updates = {};
  const results = [];

  for (const section of CHANNEL_LAYOUT) {
    // Find or create category
    let category = guild.channels.cache.find(
      (c) =>
        c.name === section.category && c.type === ChannelType.GuildCategory,
    );
    if (!category) {
      try {
        category = await guild.channels.create({
          name: section.category,
          type: ChannelType.GuildCategory,
          reason: "Discore auto-setup",
        });
        results.push({
          name: section.category,
          type: "category",
          created: true,
        });
      } catch {
        results.push({ name: section.category, type: "category", error: true });
        continue;
      }
    } else {
      results.push({ name: section.category, type: "category", reused: true });
    }

    // Track appeal category
    if (section.category === "Appeals") {
      updates.appealCategoryId = category.id;
    }

    for (const chDef of section.channels) {
      const result = await createOrReuseChannel(
        guild,
        chDef.name,
        chDef.type,
        category.id,
      );
      if (result.id && chDef.field) {
        updates[chDef.field] = result.id;
      }
      results.push({ name: chDef.name, type: "channel", ...result });
    }
  }

  if (Object.keys(updates).length) {
    await prisma.guild.update({ where: { id: guild.id }, data: updates });
  }

  return results;
}

// ─── Onboarding embed ─────────────────────────────────────────────────────────

function buildOnboardingEmbed() {
  return new EmbedBuilder()
    .setTitle("👋 Welcome to Discore Official")
    .setDescription(
      "Discore helps your server manage **scoreboards, suggestions, moderation, appeals, archives, and community records.**\n\n" +
        "Admins, choose an option below to get started.",
    )
    .setColor(0x1a7a9e)
    .addFields(
      {
        name: "📊 Scoreboards",
        value:
          "Create live scoreboards for roles, users, or custom names. Track wins, losses, points, categories, archives, and totals.",
        inline: false,
      },
      {
        name: "💡 Suggestions",
        value:
          "Let members submit suggestions with categories, images, votes, optional public voter lists, and admin approve/deny/delete controls.",
        inline: false,
      },
      {
        name: "🛡️ Moderation",
        value:
          "Manage warnings, mutes, timeouts, bans, probation, moderation logs, and case history.",
        inline: false,
      },
      {
        name: "⚖️ Appeals",
        value:
          "Appeals are linked to moderation cases. Discore posts an appeal dashboard in `#appeals` and creates a private appeal chat under the **Appeals** category for staff/member discussion.",
        inline: false,
      },
      {
        name: "📦 Archives & Records",
        value:
          "Archive scoreboards, merge totals, and preserve long-term community history.",
        inline: false,
      },
      {
        name: "⚠️ Important",
        value:
          "Discore does **not** create general support tickets. Use a dedicated ticket bot if your server needs support tickets.",
        inline: false,
      },
    )
    .setFooter({ text: "Discore • Setup Guide" })
    .setTimestamp();
}

function buildOnboardingButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("onboard:create_roles")
      .setLabel("Create Roles")
      .setEmoji("👥")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("onboard:create_channels")
      .setLabel("Create Channels")
      .setEmoji("📡")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("onboard:create_all")
      .setLabel("Create Roles + Channels")
      .setEmoji("⚡")
      .setStyle(ButtonStyle.Success),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("onboard:skip")
      .setLabel("Skip Auto Setup")
      .setEmoji("⏭️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("onboard:commands")
      .setLabel("View Setup Commands")
      .setEmoji("📋")
      .setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2];
}

function buildCommandsEmbed() {
  return new EmbedBuilder()
    .setTitle("📋 Discore Setup Commands")
    .setColor(0x1a7a9e)
    .setDescription(
      "**`/server setup`** — Set alliance code, alliance name, theme color, footer, and key roles\n" +
        "**`/server channels`** — Set channels for scoreboards, suggestions, appeals, moderation, and reports\n" +
        "**`/server settings`** — View current server settings\n" +
        "**`/server info`** — View setup health and server status\n" +
        "**`/suggestion submit`** — Submit suggestions\n" +
        "**`/archive`** — Manage archived scoreboards\n" +
        "**`/scoreboard start`** — Create scoreboards\n" +
        "**`/mod`** — Moderation tools",
    )
    .setFooter({ text: "Discore does not create general support tickets." });
}

// ─── Check admin permission ───────────────────────────────────────────────────

function isAdmin(member) {
  if (member.permissions?.has("ManageGuild")) return true;
  // Also check if member has one of the configured roles
  return false;
}

// ─── Send onboarding to a guild ───────────────────────────────────────────────

async function sendOnboarding(guild, channel) {
  const embed = buildOnboardingEmbed();
  const buttons = buildOnboardingButtons();
  const msg = await channel.send({ embeds: [embed], components: buttons });

  await prisma.guild.update({
    where: { id: guild.id },
    data: {
      onboardingSentAt: new Date(),
      onboardingChannelId: channel.id,
    },
  });

  return msg;
}

module.exports = {
  findBestChannel,
  setupRoles,
  setupChannels,
  buildOnboardingEmbed,
  buildOnboardingButtons,
  buildCommandsEmbed,
  isAdmin,
  sendOnboarding,
  RECOMMENDED_ROLES,
  CHANNEL_LAYOUT,
};
