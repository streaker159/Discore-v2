"use strict";

const {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const {
  getXpConfig,
  updateXpConfig,
  invalidateXpConfigCache,
} = require("../../../modules/xp/xpConfigService");
const { formatXp } = require("../../../modules/xp/xpFormula");

// ── Helpers ─────────────────────────────────────────────────────────────

function parseBool(val) {
  const s = String(val || "")
    .trim()
    .toLowerCase();
  return (
    s === "true" || s === "yes" || s === "on" || s === "enabled" || s === "1"
  );
}

function parseInteger(val, fallback) {
  const n = parseInt(String(val || "").trim(), 10);
  return isNaN(n) ? fallback : n;
}

async function checkAdmin(interaction) {
  const member = interaction.member;
  if (
    member.permissions?.has(PermissionFlagsBits.Administrator) ||
    member.permissions?.has(PermissionFlagsBits.ManageGuild)
  )
    return true;
  const guild = await prisma.guild.findUnique({
    where: { id: interaction.guildId },
    select: { disAdminRoleId: true, discoreManagerRoleId: true },
  });
  if (guild?.disAdminRoleId && member.roles.cache.has(guild.disAdminRoleId))
    return true;
  if (
    guild?.discoreManagerRoleId &&
    member.roles.cache.has(guild.discoreManagerRoleId)
  )
    return true;
  return false;
}

function channelMention(id) {
  return id ? `<#${id}>` : "Not set";
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = [
  // ════════════════════════════════════════════════════════════════
  // Modal Submit: General Settings
  // ════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "xp:modal:general",
    async execute(interaction) {
      if (!(await checkAdmin(interaction))) {
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      }
      await interaction.deferUpdate().catch(() => {});
      try {
        await updateXpConfig(interaction.guildId, {
          enabled: parseBool(interaction.fields.getTextInputValue("enabled")),
          messageXpEnabled: parseBool(
            interaction.fields.getTextInputValue("messageXpEnabled"),
          ),
          reactionXpEnabled: parseBool(
            interaction.fields.getTextInputValue("reactionXpEnabled"),
          ),
          announceLevelUps: parseBool(
            interaction.fields.getTextInputValue("announceLevelUps"),
          ),
          weeklyTop10Enabled: parseBool(
            interaction.fields.getTextInputValue("weeklyTop10Enabled"),
          ),
        });
        invalidateXpConfigCache(interaction.guildId);
        return interaction.followUp({
          content: "✅ XP general settings updated.",
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        return interaction.followUp({
          content: "❌ Failed to update settings: " + err.message,
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  },

  // ════════════════════════════════════════════════════════════════
  // Modal Submit: Rewards Settings
  // ════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "xp:modal:rewards",
    async execute(interaction) {
      if (!(await checkAdmin(interaction))) {
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      }
      await interaction.deferUpdate().catch(() => {});
      try {
        const current = await getXpConfig(interaction.guildId);
        const minMsg = parseInteger(
          interaction.fields.getTextInputValue("minMessageXp"),
          current.minMessageXp,
        );
        const maxMsg = parseInteger(
          interaction.fields.getTextInputValue("maxMessageXp"),
          current.maxMessageXp,
        );
        const minRxn = parseInteger(
          interaction.fields.getTextInputValue("minReactionXp"),
          current.minReactionXp,
        );
        const maxRxn = parseInteger(
          interaction.fields.getTextInputValue("maxReactionXp"),
          current.maxReactionXp,
        );

        if (minMsg < 0 || maxMsg < 0 || minRxn < 0 || maxRxn < 0) {
          return interaction.followUp({
            content: "❌ XP values cannot be negative.",
            flags: MessageFlags.Ephemeral,
          });
        }
        if (minMsg > maxMsg) {
          return interaction.followUp({
            content: "❌ Min message XP cannot be higher than max.",
            flags: MessageFlags.Ephemeral,
          });
        }
        if (minRxn > maxRxn) {
          return interaction.followUp({
            content: "❌ Min reaction XP cannot be higher than max.",
            flags: MessageFlags.Ephemeral,
          });
        }
        if (maxMsg > 10000 || maxRxn > 1000) {
          return interaction.followUp({
            content: "❌ XP values exceed maximum allowed.",
            flags: MessageFlags.Ephemeral,
          });
        }

        await updateXpConfig(interaction.guildId, {
          minMessageXp: minMsg,
          maxMessageXp: maxMsg,
          minReactionXp: minRxn,
          maxReactionXp: maxRxn,
        });
        invalidateXpConfigCache(interaction.guildId);
        return interaction.followUp({
          content: "✅ XP reward settings updated.",
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        return interaction.followUp({
          content: "❌ Failed: " + err.message,
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  },

  // ════════════════════════════════════════════════════════════════
  // Modal Submit: Cooldowns Settings
  // ════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "xp:modal:cooldowns",
    async execute(interaction) {
      if (!(await checkAdmin(interaction))) {
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      }
      await interaction.deferUpdate().catch(() => {});
      try {
        const current = await getXpConfig(interaction.guildId);
        const msgCd = parseInteger(
          interaction.fields.getTextInputValue("messageCooldownSeconds"),
          current.messageCooldownSeconds,
        );
        const rxnCd = parseInteger(
          interaction.fields.getTextInputValue("reactionCooldownSeconds"),
          current.reactionCooldownSeconds,
        );

        if (msgCd < 5)
          return interaction.followUp({
            content: "❌ Message cooldown must be at least 5 seconds.",
            flags: MessageFlags.Ephemeral,
          });
        if (rxnCd < 10)
          return interaction.followUp({
            content: "❌ Reaction cooldown must be at least 10 seconds.",
            flags: MessageFlags.Ephemeral,
          });
        if (msgCd > 86400 || rxnCd > 86400)
          return interaction.followUp({
            content: "❌ Cooldown cannot exceed 86400 seconds (24 hours).",
            flags: MessageFlags.Ephemeral,
          });

        await updateXpConfig(interaction.guildId, {
          messageCooldownSeconds: msgCd,
          reactionCooldownSeconds: rxnCd,
        });
        invalidateXpConfigCache(interaction.guildId);
        return interaction.followUp({
          content: "✅ XP cooldown settings updated.",
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        return interaction.followUp({
          content: "❌ Failed: " + err.message,
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  },

  // ════════════════════════════════════════════════════════════════
  // Modal Submit: Set Level-Up Channel
  // ════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "xp:modal:chan:levelup",
    async execute(interaction) {
      if (!(await checkAdmin(interaction)))
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      await interaction.deferUpdate().catch(() => {});
      const channelId = interaction.fields
        .getTextInputValue("channelId")
        .trim();
      try {
        const channel = await interaction.guild.channels
          .fetch(channelId)
          .catch(() => null);
        if (!channel?.isTextBased()) {
          return interaction.followUp({
            content: "❌ Invalid channel or channel is not text-based.",
            flags: MessageFlags.Ephemeral,
          });
        }
        const perms = channel.permissionsFor(interaction.guild.members.me);
        if (!perms?.has("SendMessages") || !perms?.has("EmbedLinks")) {
          return interaction.followUp({
            content: `❌ I need "Send Messages" and "Embed Links" permissions in ${channel}.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        await updateXpConfig(interaction.guildId, {
          levelUpChannelId: channelId,
        });
        invalidateXpConfigCache(interaction.guildId);
        return interaction.followUp({
          content: `✅ Level-up channel set to ${channel}.`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        return interaction.followUp({
          content: "❌ Failed: " + err.message,
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  },

  // ════════════════════════════════════════════════════════════════
  // Modal Submit: Set Weekly LB Channel
  // ════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "xp:modal:chan:weekly",
    async execute(interaction) {
      if (!(await checkAdmin(interaction)))
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      await interaction.deferUpdate().catch(() => {});
      const channelId = interaction.fields
        .getTextInputValue("channelId")
        .trim();
      try {
        const channel = await interaction.guild.channels
          .fetch(channelId)
          .catch(() => null);
        if (!channel?.isTextBased()) {
          return interaction.followUp({
            content: "❌ Invalid channel.",
            flags: MessageFlags.Ephemeral,
          });
        }
        const perms = channel.permissionsFor(interaction.guild.members.me);
        if (!perms?.has("SendMessages") || !perms?.has("EmbedLinks")) {
          return interaction.followUp({
            content: `❌ I need "Send Messages" and "Embed Links" permissions in ${channel}.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        await updateXpConfig(interaction.guildId, {
          weeklyLeaderboardChannelId: channelId,
        });
        invalidateXpConfigCache(interaction.guildId);
        return interaction.followUp({
          content: `✅ Weekly leaderboard channel set to ${channel}.`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        return interaction.followUp({
          content: "❌ Failed: " + err.message,
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  },

  // ════════════════════════════════════════════════════════════════
  // Modal Submit: Reset User XP
  // ════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "xp:modal:reset_user",
    async execute(interaction) {
      if (!(await checkAdmin(interaction)))
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      await interaction.deferUpdate().catch(() => {});
      const targetId = interaction.fields.getTextInputValue("userId").trim();
      const guildId = interaction.guildId;

      try {
        // Fetch existing user XP for log info
        const existing = await prisma.userXp.findUnique({
          where: { guildId_userId: { guildId, userId: targetId } },
        });

        const [delUser, delEvents] = await Promise.all([
          prisma.userXp.deleteMany({ where: { guildId, userId: targetId } }),
          prisma.userXpEvent.deleteMany({
            where: { guildId, userId: targetId },
          }),
        ]);

        const embed = new EmbedBuilder()
          .setTitle("📊 User XP Reset")
          .setColor(0xd4af37)
          .setDescription(`XP data reset for <@${targetId}>.`)
          .addFields(
            {
              name: "Previous Level",
              value: existing ? String(existing.level) : "N/A",
              inline: true,
            },
            {
              name: "Previous Total XP",
              value: existing ? formatXp(existing.totalXp) : "N/A",
              inline: true,
            },
            {
              name: "Records Removed",
              value: `${delUser.count} user record(s) • ${delEvents.count} event(s)`,
              inline: true,
            },
          )
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        return interaction.followUp({
          content: "❌ Failed to reset user XP: " + err.message,
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  },

  // ════════════════════════════════════════════════════════════════
  // Modal Submit: Wipe Server XP
  // ════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "xp:modal:wipe_server",
    async execute(interaction) {
      if (!(await checkAdmin(interaction)))
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });

      const member = interaction.member;
      if (
        interaction.guild.ownerId !== interaction.user.id &&
        !member.permissions?.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content:
            "❌ Only server owner or Administrator can wipe all server XP.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const confirmText = interaction.fields
        .getTextInputValue("confirmText")
        .trim();
      if (confirmText !== "RESET SERVER XP") {
        return interaction.reply({
          content:
            "❌ Server XP wipe cancelled. Confirmation text did not match.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferUpdate().catch(() => {});

      const guildId = interaction.guildId;
      const [delUsers, delEvents] = await Promise.all([
        prisma.userXp.deleteMany({ where: { guildId } }),
        prisma.userXpEvent.deleteMany({ where: { guildId } }),
      ]);

      const embed = new EmbedBuilder()
        .setTitle("🚨 Server XP Wiped")
        .setDescription("All XP data has been wiped for this server.")
        .setColor(0xd4af37)
        .addFields(
          { name: "Admin", value: `${interaction.user}`, inline: true },
          {
            name: "Users Affected",
            value: String(delUsers.count),
            inline: true,
          },
          {
            name: "Events Removed",
            value: String(delEvents.count),
            inline: true,
          },
        )
        .setFooter({ text: "Discore XP System" })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed], components: [] });
    },
  },
];
