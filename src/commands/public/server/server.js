const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const {
  updateGuildSettings,
  ensureGuild,
} = require("../../../modules/serverSettings/service");
const { requireFeature } = require("../../../lib/premiumGate");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");
const { getPremiumStatus } = require("../../../modules/premium/service");

module.exports = {
  scope: "SERVER_ADMIN",
  data: new SlashCommandBuilder()
    .setName("server")
    .setDescription("Configure Discore server settings.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("info")
        .setDescription("Show local server stats and Discore setup health."),
    )
    .addSubcommand((s) =>
      s.setName("setup").setDescription("Create default server settings."),
    )
    .addSubcommand((s) =>
      s.setName("settings").setDescription("Show current server settings."),
    )
    .addSubcommand((s) =>
      s
        .setName("timezone")
        .setDescription("Set server timezone.")
        .addStringOption((o) =>
          o
            .setName("timezone")
            .setDescription("Example: Europe/Paris")
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("default-game")
        .setDescription("Set default game slug.")
        .addStringOption((o) =>
          o
            .setName("game")
            .setDescription("Example: supremacy-ww3")
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("branding")
        .setDescription("Set alliance branding.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Alliance name"),
        )
        .addStringOption((o) => o.setName("logo").setDescription("Logo URL"))
        .addStringOption((o) =>
          o.setName("color").setDescription("Hex color, example #1a7a9e"),
        )
        .addStringOption((o) =>
          o.setName("footer").setDescription("Custom embed footer text (Pro)"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("channels")
        .setDescription("Set channel assignments.")
        .addChannelOption((o) =>
          o
            .setName("scoreboard")
            .setDescription("Default scoreboard channel")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("admin_log")
            .setDescription("Admin log channel")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("battle_signup")
            .setDescription("Battle signup channel")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("premium_notice")
            .setDescription("Premium notice channel")
            .addChannelTypes(ChannelType.GuildText),
        ),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    let guild;

    // ── info ───────────────────────────────────────────────────────────────
    if (sub === "info") {
      const [dbGuild, scoreboards, events, premiumStatus] = await Promise.all([
        ensureGuild(interaction.guildId),
        prisma.scoreboard.findMany({
          where: { guildId: interaction.guildId },
          select: { isArchived: true, repairStatus: true, channelId: true },
        }),
        prisma.event.findMany({
          where: {
            guildId: interaction.guildId,
            status: { in: ["UPCOMING", "LIVE"] },
          },
          select: { id: true },
        }),
        getPremiumStatus(interaction.guildId),
      ]);

      const discordGuild = interaction.guild;
      const activeBoards = scoreboards.filter((s) => !s.isArchived).length;
      const archivedBoards = scoreboards.filter((s) => s.isArchived).length;
      const brokenBoards = scoreboards.filter(
        (s) => !s.isArchived && s.repairStatus !== "OK",
      ).length;
      const liveBoards = scoreboards.filter(
        (s) => !s.isArchived && s.channelId,
      ).length;

      const statusLines = [
        dbGuild.adminLogChan
          ? `✅ Admin log: <#${dbGuild.adminLogChan}>`
          : `⚠️ Admin log channel not set`,
        dbGuild.scoreboardChan
          ? `✅ Default scoreboard channel: <#${dbGuild.scoreboardChan}>`
          : `⚠️ Default scoreboard channel not set`,
        brokenBoards > 0
          ? `❌ ${brokenBoards} scoreboard(s) need repair — run \`/scoreboard repair\``
          : `✅ All scoreboards healthy`,
      ];

      const embed = new EmbedBuilder()
        .setTitle(`🏠 ${dbGuild.allianceName || discordGuild.name}`)
        .setColor(
          parseInt((dbGuild.themeColor ?? "#1a7a9e").replace("#", ""), 16),
        )
        .setThumbnail(discordGuild.iconURL({ dynamic: true }) ?? null)
        .addFields(
          { name: "Discord server", value: discordGuild.name, inline: true },
          {
            name: "Created",
            value: `<t:${Math.floor(discordGuild.createdTimestamp / 1000)}:D>`,
            inline: true,
          },
          {
            name: "Members",
            value: String(discordGuild.memberCount),
            inline: true,
          },
          {
            name: "Default game",
            value: dbGuild.defaultGame || "Not set",
            inline: true,
          },
          { name: "Timezone", value: dbGuild.timezone || "UTC", inline: true },
          {
            name: "Premium",
            value: premiumStatus.isLifetime
              ? "🌟 LIFETIME"
              : premiumStatus.tier === "FREE"
                ? "Free"
                : `${premiumStatus.tier}${premiumStatus.expiresAt ? ` (expires <t:${Math.floor(new Date(premiumStatus.expiresAt).getTime() / 1000)}:R>)` : ""}`,
            inline: true,
          },
          {
            name: "Scoreboards",
            value: `${activeBoards} active · ${archivedBoards} archived · ${liveBoards} live`,
            inline: false,
          },
          {
            name: "Upcoming events",
            value: String(events.length),
            inline: true,
          },
          {
            name: "Setup health",
            value: statusLines.join("\n"),
            inline: false,
          },
        )
        .setFooter({ text: `ID: ${interaction.guildId}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "setup") {
      guild = await ensureGuild(interaction.guildId, {
        allianceName: interaction.guild.name,
        allianceLogo: interaction.guild.iconURL(),
      });
    } else if (sub === "timezone") {
      guild = await updateGuildSettings(interaction.guildId, {
        timezone: interaction.options.getString("timezone", true),
      });
    } else if (sub === "default-game") {
      guild = await updateGuildSettings(interaction.guildId, {
        defaultGame: interaction.options.getString("game", true),
      });
    } else if (sub === "branding") {
      const data = {};
      const name = interaction.options.getString("name");
      const logo = interaction.options.getString("logo");
      const color = interaction.options.getString("color");
      const footer = interaction.options.getString("footer");
      if (name) data.allianceName = name;
      if (logo) data.allianceLogo = logo;
      if (color) data.themeColor = color;
      if (footer) {
        const ok = await requireFeature(interaction, "branding.customFooter");
        if (!ok) return;
        data.customFooter = footer;
      }
      guild = await updateGuildSettings(interaction.guildId, data);
    } else if (sub === "channels") {
      const data = {};
      const scoreboard = interaction.options.getChannel("scoreboard");
      const adminLog = interaction.options.getChannel("admin_log");
      const battleSignup = interaction.options.getChannel("battle_signup");
      const premiumNotice = interaction.options.getChannel("premium_notice");
      if (scoreboard) data.scoreboardChan = scoreboard.id;
      if (adminLog) data.adminLogChan = adminLog.id;
      if (battleSignup) data.battleSignupChan = battleSignup.id;
      if (premiumNotice) data.premiumNoticeChan = premiumNotice.id;
      if (!Object.keys(data).length)
        return interaction.reply({
          content: "Please provide at least one channel.",
          ephemeral: true,
        });
      guild = await updateGuildSettings(interaction.guildId, data);
    } else {
      guild = await ensureGuild(interaction.guildId);
    }

    const embed = await createDiscoreEmbed(interaction, {
      guildSettings: guild,
      title: "⚙️ Server Settings",
      fields: [
        {
          name: "Alliance",
          value: guild.allianceName || "Not set",
          inline: true,
        },
        { name: "Timezone", value: guild.timezone || "UTC", inline: true },
        {
          name: "Default game",
          value: guild.defaultGame || "Not set",
          inline: true,
        },
        {
          name: "Theme color",
          value: guild.themeColor || "#1a7a9e",
          inline: true,
        },
        {
          name: "Custom footer",
          value: guild.customFooter || "Powered by Discore",
          inline: true,
        },
        {
          name: "Scoreboard channel",
          value: guild.scoreboardChan
            ? `<#${guild.scoreboardChan}>`
            : "Not set",
          inline: true,
        },
        {
          name: "Admin log channel",
          value: guild.adminLogChan ? `<#${guild.adminLogChan}>` : "Not set",
          inline: true,
        },
        {
          name: "Battle signup channel",
          value: guild.battleSignupChan
            ? `<#${guild.battleSignupChan}>`
            : "Not set",
          inline: true,
        },
        {
          name: "Premium notice channel",
          value: guild.premiumNoticeChan
            ? `<#${guild.premiumNoticeChan}>`
            : "Not set",
          inline: true,
        },
      ],
    });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
