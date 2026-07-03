"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
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

// ── Helpers ──────────────────────────────────────────────────────────────

function isPanelOwner(interaction, adminId) {
  return interaction.user.id === adminId;
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

function parseBool(val) {
  const s = String(val || "")
    .trim()
    .toLowerCase();
  return (
    s === "true" || s === "yes" || s === "on" || s === "enabled" || s === "1"
  );
}

function buildPanelEmbed(config) {
  return new EmbedBuilder()
    .setTitle("🎖️ Discore XP Control Panel")
    .setDescription(
      "Configure activity XP, rewards, cooldowns, channels, announcements, leaderboards, previews, and admin reset tools.",
    )
    .setColor(0xd4af37)
    .addFields(
      {
        name: "🟢 System Status",
        value: [
          `**XP System:** ${config.enabled ? "✅ Enabled" : "❌ Disabled"}`,
          `**Message XP:** ${config.messageXpEnabled ? "✅ Enabled" : "❌ Disabled"}`,
          `**Reaction XP:** ${config.reactionXpEnabled ? "✅ Enabled" : "❌ Disabled"}`,
          `**Level-up Announcements:** ${config.announceLevelUps ? "✅ Enabled" : "❌ Disabled"}`,
          `**Weekly Top 10:** ${config.weeklyTop10Enabled ? "✅ Enabled" : "❌ Disabled"}`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "📣 Channels",
        value: [
          `**Level-up:** ${channelMention(config.levelUpChannelId)}`,
          `**Weekly LB:** ${channelMention(config.weeklyLeaderboardChannelId)}`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "⚙️ Rewards",
        value: [
          `**Message:** ${config.minMessageXp}–${config.maxMessageXp} XP`,
          `**Reaction:** ${config.minReactionXp}–${config.maxReactionXp} XP`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "⏱️ Cooldowns",
        value: [
          `**Message:** ${config.messageCooldownSeconds}s`,
          `**Reaction:** ${config.reactionCooldownSeconds}s`,
        ].join("\n"),
        inline: true,
      },
    )
    .setFooter({ text: "Powered by Discore • XP System" })
    .setTimestamp();
}

function buildPanelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("xp:panel:general")
        .setLabel("General")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("xp:panel:rewards")
        .setLabel("Rewards")
        .setEmoji("🎁")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("xp:panel:cooldowns")
        .setLabel("Cooldowns")
        .setEmoji("⏱️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("xp:panel:channels")
        .setLabel("Channels")
        .setEmoji("📣")
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

function buildPanelRows2() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("xp:panel:preview")
        .setLabel("Preview")
        .setEmoji("🧪")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("xp:panel:admin")
        .setLabel("Admin Tools")
        .setEmoji("🛠️")
        .setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("xp:panel:refresh")
        .setLabel("Refresh")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("xp:panel:close")
        .setLabel("Close")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = [
  // ═══════════════════════════════════════════════════════════════════════
  // Panel: Main XP Control Panel
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "xp:panel:refresh",
    async execute(interaction) {
      if (!(await checkAdmin(interaction))) {
        return interaction.reply({
          content: "❌ You do not have permission to manage the XP system.",
          flags: MessageFlags.Ephemeral,
        });
      }
      await interaction.deferUpdate().catch(() => {});
      const config = await getXpConfig(interaction.guildId);
      return interaction.editReply({
        embeds: [buildPanelEmbed(config)],
        components: [...buildPanelRows(), ...buildPanelRows2()],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "xp:panel:close",
    async execute(interaction) {
      await interaction.deferUpdate().catch(() => {});
      try {
        await interaction.deleteReply();
      } catch {
        // Already deleted or no permission — clear components
        await interaction
          .editReply({
            components: [],
          })
          .catch(() => {});
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ── General modal opener ──────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "xp:panel:general",
    async execute(interaction) {
      if (!(await checkAdmin(interaction))) {
        return interaction.reply({
          content: "❌ You do not have permission to manage the XP system.",
          flags: MessageFlags.Ephemeral,
        });
      }
      const config = await getXpConfig(interaction.guildId);
      const modal = new ModalBuilder()
        .setCustomId("xp:modal:general")
        .setTitle("XP General Settings");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("enabled")
            .setLabel("XP System Enabled (true/false)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(config.enabled)),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("messageXpEnabled")
            .setLabel("Message XP Enabled (true/false)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(config.messageXpEnabled)),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("reactionXpEnabled")
            .setLabel("Reaction XP Enabled (true/false)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(config.reactionXpEnabled)),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("announceLevelUps")
            .setLabel("Announce Level-Ups (true/false)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(config.announceLevelUps)),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("weeklyTop10Enabled")
            .setLabel("Weekly Top 10 Enabled (true/false)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(config.weeklyTop10Enabled)),
        ),
      );
      return interaction.showModal(modal);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ── Rewards modal opener ──────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "xp:panel:rewards",
    async execute(interaction) {
      if (!(await checkAdmin(interaction))) {
        return interaction.reply({
          content: "❌ You do not have permission.",
          flags: MessageFlags.Ephemeral,
        });
      }
      const config = await getXpConfig(interaction.guildId);
      const modal = new ModalBuilder()
        .setCustomId("xp:modal:rewards")
        .setTitle("XP Reward Settings");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("minMessageXp")
            .setLabel("Minimum Message XP")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(config.minMessageXp)),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("maxMessageXp")
            .setLabel("Maximum Message XP")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(config.maxMessageXp)),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("minReactionXp")
            .setLabel("Minimum Reaction XP")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(config.minReactionXp)),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("maxReactionXp")
            .setLabel("Maximum Reaction XP")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(config.maxReactionXp)),
        ),
      );
      return interaction.showModal(modal);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ── Cooldowns modal opener ────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "xp:panel:cooldowns",
    async execute(interaction) {
      if (!(await checkAdmin(interaction))) {
        return interaction.reply({
          content: "❌ You do not have permission.",
          flags: MessageFlags.Ephemeral,
        });
      }
      const config = await getXpConfig(interaction.guildId);
      const modal = new ModalBuilder()
        .setCustomId("xp:modal:cooldowns")
        .setTitle("XP Cooldown Settings");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("messageCooldownSeconds")
            .setLabel("Message XP Cooldown (seconds)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(config.messageCooldownSeconds)),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("reactionCooldownSeconds")
            .setLabel("Reaction XP Cooldown (seconds)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(String(config.reactionCooldownSeconds)),
        ),
      );
      return interaction.showModal(modal);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ── Channels panel ────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "xp:panel:channels",
    async execute(interaction) {
      if (!(await checkAdmin(interaction))) {
        return interaction.reply({
          content: "❌ You do not have permission.",
          flags: MessageFlags.Ephemeral,
        });
      }
      await interaction.deferUpdate().catch(() => {});
      const config = await getXpConfig(interaction.guildId);
      const embed = new EmbedBuilder()
        .setTitle("📣 XP Channel Setup")
        .setColor(0xd4af37)
        .addFields(
          {
            name: "Level-Up Channel",
            value: channelMention(config.levelUpChannelId),
            inline: true,
          },
          {
            name: "Weekly Leaderboard Channel",
            value: channelMention(config.weeklyLeaderboardChannelId),
            inline: true,
          },
        )
        .setDescription("Select a channel type to configure.");
      const rows = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("xp:channel:levelup")
            .setLabel("Set Level-Up Channel")
            .setEmoji("📢")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("xp:channel:weekly")
            .setLabel("Set Weekly LB Channel")
            .setEmoji("📊")
            .setStyle(ButtonStyle.Primary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("xp:channel:clear_levelup")
            .setLabel("Clear Level-Up")
            .setEmoji("🗑️")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("xp:channel:clear_weekly")
            .setLabel("Clear Weekly LB")
            .setEmoji("🗑️")
            .setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("xp:panel:refresh")
            .setLabel("Back to Panel")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];
      return interaction.editReply({ embeds: [embed], components: rows });
    },
  },

  // ── Channel: Set Level-Up (modal for channel ID) ─────────────────────
  {
    customIdPrefix: "xp:channel:levelup",
    async execute(interaction) {
      if (!(await checkAdmin(interaction)))
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      const modal = new ModalBuilder()
        .setCustomId("xp:modal:chan:levelup")
        .setTitle("Set Level-Up Channel");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("channelId")
            .setLabel("Channel ID")
            .setPlaceholder("Paste the channel ID here")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
      return interaction.showModal(modal);
    },
  },

  // ── Channel: Set Weekly LB (modal for channel ID) ────────────────────
  {
    customIdPrefix: "xp:channel:weekly",
    async execute(interaction) {
      if (!(await checkAdmin(interaction)))
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      const modal = new ModalBuilder()
        .setCustomId("xp:modal:chan:weekly")
        .setTitle("Set Weekly Leaderboard Channel");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("channelId")
            .setLabel("Channel ID")
            .setPlaceholder("Paste the channel ID here")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
      return interaction.showModal(modal);
    },
  },

  // ── Channel: Clear Level-Up ──────────────────────────────────────────
  {
    customIdPrefix: "xp:channel:clear_levelup",
    async execute(interaction) {
      if (!(await checkAdmin(interaction)))
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      await interaction.deferUpdate().catch(() => {});
      await updateXpConfig(interaction.guildId, { levelUpChannelId: null });
      invalidateXpConfigCache(interaction.guildId);
      const config = await getXpConfig(interaction.guildId);
      const embed = new EmbedBuilder()
        .setTitle("📣 XP Channel Setup")
        .setColor(0xd4af37)
        .setDescription("Level-up channel cleared.")
        .addFields(
          {
            name: "Level-Up Channel",
            value: channelMention(config.levelUpChannelId),
            inline: true,
          },
          {
            name: "Weekly LB",
            value: channelMention(config.weeklyLeaderboardChannelId),
            inline: true,
          },
        );
      const btn = new ButtonBuilder()
        .setCustomId("xp:panel:refresh")
        .setLabel("Back to Panel")
        .setEmoji("⬅️")
        .setStyle(ButtonStyle.Secondary);
      return interaction.editReply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(btn)],
      });
    },
  },

  // ── Channel: Clear Weekly LB ─────────────────────────────────────────
  {
    customIdPrefix: "xp:channel:clear_weekly",
    async execute(interaction) {
      if (!(await checkAdmin(interaction)))
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      await interaction.deferUpdate().catch(() => {});
      await updateXpConfig(interaction.guildId, {
        weeklyLeaderboardChannelId: null,
      });
      invalidateXpConfigCache(interaction.guildId);
      const config = await getXpConfig(interaction.guildId);
      const embed = new EmbedBuilder()
        .setTitle("📣 XP Channel Setup")
        .setColor(0xd4af37)
        .setDescription("Weekly leaderboard channel cleared.")
        .addFields(
          {
            name: "Level-Up Channel",
            value: channelMention(config.levelUpChannelId),
            inline: true,
          },
          {
            name: "Weekly LB",
            value: channelMention(config.weeklyLeaderboardChannelId),
            inline: true,
          },
        );
      const btn = new ButtonBuilder()
        .setCustomId("xp:panel:refresh")
        .setLabel("Back to Panel")
        .setEmoji("⬅️")
        .setStyle(ButtonStyle.Secondary);
      return interaction.editReply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(btn)],
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ── Preview panel ─────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "xp:panel:preview",
    async execute(interaction) {
      if (!(await checkAdmin(interaction))) {
        return interaction.reply({
          content: "❌ You do not have permission.",
          flags: MessageFlags.Ephemeral,
        });
      }
      await interaction.deferUpdate().catch(() => {});
      const embed = new EmbedBuilder()
        .setTitle("🧪 XP Card Preview")
        .setDescription(
          "Test how XP cards look without waiting for someone to level up.",
        )
        .setColor(0xd4af37);
      const rows = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("xp:preview:profile")
            .setLabel("Preview My Profile Card")
            .setEmoji("🪪")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("xp:preview:levelup")
            .setLabel("Preview My Level-Up Card")
            .setEmoji("🎉")
            .setStyle(ButtonStyle.Primary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("xp:preview:weekly")
            .setLabel("Preview Weekly Top 10")
            .setEmoji("🏆")
            .setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("xp:panel:refresh")
            .setLabel("Back to Panel")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];
      return interaction.editReply({ embeds: [embed], components: rows });
    },
  },

  // ── Preview: Profile Card ────────────────────────────────────────────
  {
    customIdPrefix: "xp:preview:profile",
    async execute(interaction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const {
          getUserXpStats,
          getUserXpRank,
          getUserPeriodXp,
        } = require("../../../modules/xp/xpService");
        const {
          createProfileXpCard,
        } = require("../../../modules/xp/profileXpCard");
        const { formatDiscordTime } = require("../../../lib/embedBuilder");

        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const member = interaction.member;
        const [xpRaw, rank, daily, weekly, monthly] = await Promise.all([
          getUserXpStats(guildId, userId),
          getUserXpRank(guildId, userId),
          getUserPeriodXp(guildId, userId, "daily"),
          getUserPeriodXp(guildId, userId, "weekly"),
          getUserPeriodXp(guildId, userId, "monthly"),
        ]);
        const buf = await createProfileXpCard({
          avatarUrl: member.displayAvatarURL({
            extension: "png",
            size: 256,
            forceStatic: true,
          }),
          displayName:
            member.displayName ||
            interaction.user.globalName ||
            interaction.user.username,
          username: interaction.user.username,
          level: xpRaw.level,
          totalXp: xpRaw.totalXp,
          currentXp: xpRaw.progress?.progressXp || 0,
          nextLevelXp: xpRaw.progress?.nextLevelXp || 100,
          rank,
          progressPercent: xpRaw.progress?.progressPercent || 0,
          messagesCounted: xpRaw.messagesCounted || 0,
          reactionsCounted: xpRaw.reactionsCounted || 0,
          dailyXp: daily,
          weeklyXp: weekly,
          monthlyXp: monthly,
        });
        return interaction.editReply({
          content: "🧪 **Profile Card Preview** (no changes saved)",
          files: [{ attachment: buf, name: "preview-profile.png" }],
        });
      } catch (err) {
        return interaction.editReply({
          content: "❌ Failed to generate preview: " + err.message,
        });
      }
    },
  },

  // ── Preview: Level-Up Card ───────────────────────────────────────────
  {
    customIdPrefix: "xp:preview:levelup",
    async execute(interaction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const { getUserXpStats } = require("../../../modules/xp/xpService");
        const {
          createLevelUpCard,
        } = require("../../../modules/xp/levelUpCard");
        const xpRaw = await getUserXpStats(
          interaction.guildId,
          interaction.user.id,
        );
        const member = interaction.member;
        const buf = await createLevelUpCard({
          avatarUrl: member.displayAvatarURL({
            extension: "png",
            size: 256,
            forceStatic: true,
          }),
          displayName:
            member.displayName ||
            interaction.user.globalName ||
            interaction.user.username,
          oldLevel: xpRaw.level,
          newLevel: xpRaw.level + 1,
        });
        if (!buf)
          return interaction.editReply({
            content: "❌ Card generation failed. Canvas unavailable.",
          });
        return interaction.editReply({
          content: "🧪 **Level-Up Card Preview** (no XP awarded)",
          files: [{ attachment: buf, name: "preview-levelup.png" }],
        });
      } catch (err) {
        return interaction.editReply({
          content: "❌ Failed to generate preview: " + err.message,
        });
      }
    },
  },

  // ── Preview: Weekly Top 10 ───────────────────────────────────────────
  {
    customIdPrefix: "xp:preview:weekly",
    async execute(interaction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const { getLeaderboard } = require("../../../modules/xp/xpService");
        const lb = await getLeaderboard(interaction.guildId, "weekly", 10);
        if (lb.length === 0)
          return interaction.editReply({
            content: "🧪 Weekly leaderboard is empty.",
          });
        const lines = lb
          .map(
            (e, i) =>
              `**#${i + 1}** ${e.displayName || e.userTag || e.userId} — **${formatXp(e.totalXp)} XP**`,
          )
          .join("\n");
        const embed = new EmbedBuilder()
          .setTitle("🧪 Weekly XP Top 10 Preview")
          .setDescription(lines)
          .setColor(0xd4af37)
          .setFooter({ text: "Discore XP • Preview only — not posted" });
        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        return interaction.editReply({ content: "❌ Failed: " + err.message });
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ── Admin Tools panel ─────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════
  {
    customIdPrefix: "xp:panel:admin",
    async execute(interaction) {
      if (!(await checkAdmin(interaction))) {
        return interaction.reply({
          content: "❌ You do not have permission.",
          flags: MessageFlags.Ephemeral,
        });
      }
      await interaction.deferUpdate().catch(() => {});
      const embed = new EmbedBuilder()
        .setTitle("🛠️ XP Admin Tools")
        .setDescription(
          "Reset XP data for users or the whole server. **These actions cannot be undone.**",
        )
        .setColor(0xd4af37);
      const rows = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("xp:admin:reset_user")
            .setLabel("Reset User XP")
            .setEmoji("👤")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("xp:admin:wipe_server")
            .setLabel("Wipe Server XP")
            .setEmoji("🚨")
            .setStyle(ButtonStyle.Danger),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("xp:admin:reset_weekly")
            .setLabel("Reset Weekly XP")
            .setEmoji("📅")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("xp:admin:reset_monthly")
            .setLabel("Reset Monthly XP")
            .setEmoji("🌙")
            .setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("xp:panel:refresh")
            .setLabel("Back to Panel")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];
      return interaction.editReply({ embeds: [embed], components: rows });
    },
  },

  // ── Admin: Reset User XP ─────────────────────────────────────────────
  {
    customIdPrefix: "xp:admin:reset_user",
    async execute(interaction) {
      if (!(await checkAdmin(interaction)))
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      const modal = new ModalBuilder()
        .setCustomId("xp:modal:reset_user")
        .setTitle("Reset User XP");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("userId")
            .setLabel("User ID to reset")
            .setPlaceholder("Paste the user ID here")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
      return interaction.showModal(modal);
    },
  },

  // ── Admin: Wipe Server XP → confirmation modal ───────────────────────
  {
    customIdPrefix: "xp:admin:wipe_server",
    async execute(interaction) {
      if (!(await checkAdmin(interaction)))
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      // Only server owner or Administrator can wipe
      const member = interaction.member;
      if (
        interaction.guild.ownerId !== interaction.user.id &&
        !member.permissions?.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content:
            "❌ Only the server owner or Administrator can wipe all server XP.",
          flags: MessageFlags.Ephemeral,
        });
      }
      const modal = new ModalBuilder()
        .setCustomId("xp:modal:wipe_server")
        .setTitle("Confirm Server XP Wipe");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("confirmText")
            .setLabel('Type "RESET SERVER XP" to confirm')
            .setPlaceholder("RESET SERVER XP")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
      return interaction.showModal(modal);
    },
  },

  // ── Admin: Reset Weekly XP ───────────────────────────────────────────
  {
    customIdPrefix: "xp:admin:reset_weekly",
    async execute(interaction) {
      if (!(await checkAdmin(interaction)))
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      const embed = new EmbedBuilder()
        .setTitle("⚠️ Confirm Weekly XP Reset")
        .setDescription(
          "This will reset **weekly XP counters only** for all users. Total XP and levels are kept.",
        )
        .setColor(0xd4af37);
      const rows = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("xp:reset:weekly:confirm")
          .setLabel("Confirm Reset Weekly")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("xp:panel:refresh")
          .setLabel("Cancel")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Secondary),
      );
      return interaction.reply({
        embeds: [embed],
        components: [rows],
        flags: MessageFlags.Ephemeral,
      });
    },
  },

  // ── Admin: Reset Monthly XP ──────────────────────────────────────────
  {
    customIdPrefix: "xp:admin:reset_monthly",
    async execute(interaction) {
      if (!(await checkAdmin(interaction)))
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      const embed = new EmbedBuilder()
        .setTitle("⚠️ Confirm Monthly XP Reset")
        .setDescription(
          "This will reset **monthly XP counters only** for all users. Total XP and levels are kept.",
        )
        .setColor(0xd4af37);
      const rows = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("xp:reset:monthly:confirm")
          .setLabel("Confirm Reset Monthly")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("xp:panel:refresh")
          .setLabel("Cancel")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Secondary),
      );
      return interaction.reply({
        embeds: [embed],
        components: [rows],
        flags: MessageFlags.Ephemeral,
      });
    },
  },

  // ── Admin: Confirm Reset Weekly ──────────────────────────────────────
  {
    customIdPrefix: "xp:reset:weekly:confirm",
    async execute(interaction) {
      if (!(await checkAdmin(interaction)))
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      await interaction.deferUpdate().catch(() => {});
      const weekStart = new Date();
      const day = weekStart.getUTCDay();
      weekStart.setUTCDate(weekStart.getUTCDate() - day);
      weekStart.setUTCHours(0, 0, 0, 0);
      const count = await prisma.userXpEvent.deleteMany({
        where: { guildId: interaction.guildId, createdAt: { gte: weekStart } },
      });
      const embed = new EmbedBuilder()
        .setTitle("✅ Weekly XP Reset")
        .setDescription(
          `Weekly XP counters reset. **${count.count} event(s)** cleared.`,
        )
        .setColor(0xd4af37);
      return interaction.editReply({ embeds: [embed], components: [] });
    },
  },

  // ── Admin: Confirm Reset Monthly ─────────────────────────────────────
  {
    customIdPrefix: "xp:reset:monthly:confirm",
    async execute(interaction) {
      if (!(await checkAdmin(interaction)))
        return interaction.reply({
          content: "❌ No permission.",
          flags: MessageFlags.Ephemeral,
        });
      await interaction.deferUpdate().catch(() => {});
      const monthStart = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      );
      const count = await prisma.userXpEvent.deleteMany({
        where: { guildId: interaction.guildId, createdAt: { gte: monthStart } },
      });
      const embed = new EmbedBuilder()
        .setTitle("✅ Monthly XP Reset")
        .setDescription(
          `Monthly XP counters reset. **${count.count} event(s)** cleared.`,
        )
        .setColor(0xd4af37);
      return interaction.editReply({ embeds: [embed], components: [] });
    },
  },
];
