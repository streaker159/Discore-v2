"use strict";

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");

const prisma = require("../../../lib/prisma");
const {
  updateGuildSettings,
  ensureGuild,
} = require("../../../modules/serverSettings/service");
const { requireFeature } = require("../../../lib/premiumGate");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");
const { getPremiumStatus } = require("../../../modules/premium/service");

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

function channelMention(id) {
  return id ? `<#${id}>` : "Not set";
}

function roleMention(id) {
  return id ? `<@&${id}>` : "Not set";
}

function getChannelId(interaction, name) {
  const channel = interaction.options.getChannel(name);
  return channel?.id || null;
}

function getRoleId(interaction, name) {
  const role = interaction.options.getRole(name);
  return role?.id || null;
}

const ALLIANCE_CODE_RE = /^[A-Za-z0-9]{1,6}$/;

function validateAllianceCode(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return { error: "Alliance code cannot be empty." };
  if (!ALLIANCE_CODE_RE.test(trimmed))
    return {
      error:
        "⚠️ Alliance code must be 1–6 letters/numbers. No spaces or symbols.",
    };
  return { code: trimmed.toUpperCase() };
}

async function checkAllianceCodeUnique(code, ownGuildId) {
  const existing = await prisma.guild.findFirst({
    where: { allianceCode: code, id: { not: ownGuildId } },
    select: { id: true },
  });
  return !existing;
}

function buildChannelFields(guild) {
  return [
    {
      name: "Server/Admin Logs",
      value: channelMention(guild.logChannelId || guild.adminLogChan),
      inline: true,
    },
    {
      name: "Moderation Logs",
      value: channelMention(guild.moderationLogChannelId),
      inline: true,
    },
    {
      name: "Appeals Channel",
      value: channelMention(guild.appealChannelId),
      inline: true,
    },
    {
      name: "Appeals Category",
      value: channelMention(guild.appealCategoryId),
      inline: true,
    },
    {
      name: "Scoreboards",
      value: channelMention(guild.scoreboardChan),
      inline: true,
    },
    {
      name: "Events",
      value: channelMention(guild.eventChannelId),
      inline: true,
    },
    {
      name: "Suggestions",
      value: channelMention(guild.suggestionChannelId),
      inline: true,
    },
    {
      name: "Premium Notices",
      value: channelMention(guild.premiumNoticeChan),
      inline: true,
    },
    {
      name: "Admin Reports",
      value: channelMention(guild.adminReportsChannelId),
      inline: true,
    },
    {
      name: "AI Welcome",
      value: channelMention(guild.aiWelcomeChannelId),
      inline: true,
    },
  ];
}

function buildRoleFields(guild) {
  return [
    {
      name: "Discore Manager Role",
      value: roleMention(guild.discoreManagerRoleId),
      inline: true,
    },
    {
      name: "Appeal Ping Role",
      value: roleMention(guild.discoreAppealRoleId),
      inline: true,
    },
    {
      name: "Muted Role",
      value: roleMention(guild.discoreMutedRoleId),
      inline: true,
    },
    {
      name: "Scoreboard Manager Role",
      value: roleMention(guild.scoreboardManagerRoleId),
      inline: true,
    },
    {
      name: "Discore Admin Role",
      value: roleMention(guild.disAdminRoleId),
      inline: true,
    },
  ];
}

function buildSetupIdentityFields(guild) {
  return [
    {
      name: "Alliance Code",
      value: guild.allianceCode || "Not set",
      inline: true,
    },
    {
      name: "Alliance Name",
      value: guild.allianceName || "Not set",
      inline: true,
    },
    { name: "Theme Color", value: guild.themeColor || "#1a7a9e", inline: true },
    {
      name: "Custom Footer",
      value: guild.customFooter || "Powered by Discore",
      inline: true,
    },
  ];
}

function buildSetupRoleFields(guild) {
  return [
    {
      name: "Discore Manager Role",
      value: roleMention(guild.discoreManagerRoleId),
      inline: true,
    },
    {
      name: "Scoreboard Manager Role",
      value: roleMention(guild.scoreboardManagerRoleId),
      inline: true,
    },
    {
      name: "Discore Admin Role",
      value: roleMention(guild.disAdminRoleId),
      inline: true,
    },
  ];
}

function buildSettingsFields(guild) {
  return [
    {
      name: "Alliance Code",
      value: guild.allianceCode || "Not set",
      inline: true,
    },
    {
      name: "Alliance Name",
      value: guild.allianceName || "Not set",
      inline: true,
    },
    {
      name: "Default game",
      value: guild.defaultGame || "Not set",
      inline: true,
    },
    { name: "Theme color", value: guild.themeColor || "#1a7a9e", inline: true },
    {
      name: "Custom footer",
      value: guild.customFooter || "Powered by Discore",
      inline: true,
    },
    ...buildChannelFields(guild),
    ...buildRoleFields(guild),
  ];
}

function getServerSettingsTitle(sub) {
  if (sub === "channels") return "📡 Server Channels Updated";
  if (sub === "branding") return "🎨 Server Branding Updated";
  if (sub === "default-game") return "🎮 Default Game Updated";
  if (sub === "setup") return "✅ Server Setup Updated";
  return "⚙️ Server Settings";
}

function isDatabaseConnectionError(error) {
  return (
    error?.code === "P1001" ||
    error?.code === "P1002" ||
    String(error?.message || "").includes("Can't reach database server")
  );
}

module.exports = {
  scope: "SERVER_ADMIN",

  data: new SlashCommandBuilder()
    .setName("server")
    .setDescription("Configure Discore server settings.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand((s) =>
      s
        .setName("setup-guide")
        .setDescription("Resend the onboarding setup guide to a safe channel."),
    )
    .addSubcommand((s) =>
      s
        .setName("info")
        .setDescription("Show local server stats and Discore setup health."),
    )
    .addSubcommand((s) =>
      s.setName("settings").setDescription("Show current server settings."),
    )

    .addSubcommand((s) =>
      s
        .setName("setup")
        .setDescription("Configure alliance identity and key Discore roles.")
        .addStringOption((o) =>
          o
            .setName("alliance_code")
            .setDescription(
              "Short unique alliance code (1-6 letters/numbers, e.g. LAST)",
            ),
        )
        .addStringOption((o) =>
          o
            .setName("alliance_name")
            .setDescription("Human-readable alliance/server name"),
        )
        .addRoleOption((o) =>
          o
            .setName("discore_manager_role")
            .setDescription("Main Discore manager role"),
        )
        .addRoleOption((o) =>
          o
            .setName("scoreboard_manager_role")
            .setDescription("Role allowed to manage scoreboards"),
        )
        .addRoleOption((o) =>
          o
            .setName("discore_admin_role")
            .setDescription("Discore advanced admin role"),
        )
        .addRoleOption((o) =>
          o
            .setName("appeal_ping_role")
            .setDescription("Role to mention when a new appeal is submitted"),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName("default-game")
        .setDescription("Set default game.")
        .addStringOption((o) =>
          o
            .setName("game")
            .setDescription("Choose the server default game")
            .setRequired(true)
            .addChoices(
              { name: "Supremacy: World War 3", value: "supremacy-ww3" },
              {
                name: "Supremacy: Call of War 1942",
                value: "call-of-war-1942",
              },
              { name: "Supremacy 1914", value: "supremacy-1914" },
              { name: "Iron Order 1919", value: "iron-order-1919" },
              { name: "Custom / Other", value: "custom" },
            ),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName("branding")
        .setDescription("Set alliance branding. (Premium)")
        .addStringOption((o) =>
          o.setName("name").setDescription("Alliance/server display name"),
        )
        .addStringOption((o) => o.setName("logo").setDescription("Logo URL"))
        .addAttachmentOption((o) =>
          o
            .setName("logo_upload")
            .setDescription("Upload logo from mobile or PC"),
        )
        .addStringOption((o) =>
          o.setName("footer").setDescription("Custom embed footer text"),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName("scoreboard-image")
        .setDescription("Set a banner image for one scoreboard. (Premium)")
        .addStringOption((o) =>
          o
            .setName("scoreboard")
            .setDescription("Scoreboard name")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addAttachmentOption((o) =>
          o
            .setName("image")
            .setDescription("Image to upload")
            .setRequired(true),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName("clear-scoreboard-image")
        .setDescription(
          "Remove the banner image from one scoreboard. (Premium)",
        )
        .addStringOption((o) =>
          o
            .setName("scoreboard")
            .setDescription("Scoreboard name")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )

    .addSubcommand((s) =>
      s
        .setName("channels")
        .setDescription("Set all important Discore channels.")
        .addChannelOption((o) =>
          o
            .setName("admin_log")
            .setDescription("Server/admin log channel")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("moderation_log")
            .setDescription("Moderation log channel")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("appeals")
            .setDescription("Appeals review/notification channel")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("appeals_category")
            .setDescription("Category where appeal tickets are created")
            .addChannelTypes(ChannelType.GuildCategory),
        )
        .addChannelOption((o) =>
          o
            .setName("scoreboard")
            .setDescription("Default scoreboard channel")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("events")
            .setDescription("Default events channel")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("suggestions")
            .setDescription("Suggestions channel")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("premium_notice")
            .setDescription("Premium notice channel")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("admin_reports")
            .setDescription("Admin reports/bot status channel")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("discore_announcements")
            .setDescription("Official Discore update announcements channel")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o
            .setName("ai_welcome")
            .setDescription("AI Welcome channel for new member greetings")
            .addChannelTypes(ChannelType.GuildText),
        ),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "⚠️ This command can only be used in a server.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    if (!isAdmin(interaction)) {
      return interaction.reply({
        content:
          "🚫 You need Manage Server permission or the configured Discore admin role to use server commands.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      const sub = interaction.options.getSubcommand();
      let guild;

      if (sub === "info") {
        const [dbGuild, scoreboards, events, premiumStatus] = await Promise.all(
          [
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
          ],
        );

        const discordGuild = interaction.guild;
        const activeBoards = scoreboards.filter((s) => !s.isArchived).length;
        const archivedBoards = scoreboards.filter((s) => s.isArchived).length;
        const brokenBoards = scoreboards.filter(
          (s) => !s.isArchived && s.repairStatus !== "OK",
        ).length;
        const liveBoards = scoreboards.filter(
          (s) => !s.isArchived && s.channelId,
        ).length;

        const premiumText = premiumStatus.isLifetime
          ? "🌟 LIFETIME"
          : premiumStatus.tier === "FREE"
            ? "Free"
            : `${premiumStatus.tier}${premiumStatus.expiresAt ? ` (expires <t:${Math.floor(new Date(premiumStatus.expiresAt).getTime() / 1000)}:R>)` : ""}`;

        const statusLines = [
          dbGuild.logChannelId || dbGuild.adminLogChan
            ? `✅ Admin log: ${channelMention(dbGuild.logChannelId || dbGuild.adminLogChan)}`
            : "⚠️ Admin log channel not set",
          dbGuild.moderationLogChannelId
            ? `✅ Moderation log: ${channelMention(dbGuild.moderationLogChannelId)}`
            : "⚠️ Moderation log channel not set",
          dbGuild.appealChannelId
            ? `✅ Appeals: ${channelMention(dbGuild.appealChannelId)}`
            : "⚠️ Appeals channel not set",
          dbGuild.appealCategoryId
            ? `✅ Appeal category: ${channelMention(dbGuild.appealCategoryId)}`
            : "⚠️ Appeal category not set",
          dbGuild.discoreAppealRoleId
            ? `✅ Appeal role: ${roleMention(dbGuild.discoreAppealRoleId)}`
            : "⚠️ Appeal ping role not set",
          dbGuild.scoreboardChan
            ? `✅ Default scoreboard: ${channelMention(dbGuild.scoreboardChan)}`
            : "⚠️ Default scoreboard channel not set",
          dbGuild.allianceCode
            ? `✅ Alliance code: ${dbGuild.allianceCode}`
            : "⚠️ Alliance code not set",
          brokenBoards > 0
            ? `❌ ${brokenBoards} scoreboard(s) need repair — run \`/scoreboard repair\``
            : "✅ All scoreboards healthy",
        ];

        const title = dbGuild.allianceName
          ? `🏠 ${dbGuild.allianceName}`
          : `🏠 ${discordGuild.name}`;

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setColor(
            parseInt((dbGuild.themeColor ?? "#1a7a9e").replace("#", ""), 16),
          )
          .setThumbnail(
            dbGuild.allianceLogo ||
              discordGuild.iconURL({ dynamic: true }) ||
              null,
          )
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
            {
              name: "Timezone",
              value: dbGuild.timezone || "UTC",
              inline: true,
            },
            { name: "Premium", value: premiumText, inline: true },
            {
              name: "AI Credits",
              value:
                premiumStatus.monthlyAiCredits !== undefined
                  ? `${premiumStatus.usedAiCredits || 0}/${premiumStatus.monthlyAiCredits}`
                  : "Not tracked yet",
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
          .setFooter({
            text: `Powered by Discore • ID: ${interaction.guildId}`,
          })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === "setup") {
        const data = {};

        const rawCode = interaction.options.getString("alliance_code");
        if (rawCode !== null) {
          const validation = validateAllianceCode(rawCode);
          if (validation.error)
            return interaction.editReply({ content: validation.error });
          const unique = await checkAllianceCodeUnique(
            validation.code,
            interaction.guildId,
          );
          if (!unique)
            return interaction.editReply({
              content: `⚠️ Alliance code **${validation.code}** is already used by another server. Please choose a different code.`,
            });
          data.allianceCode = validation.code;
        }

        const allianceName = interaction.options.getString("alliance_name");
        if (allianceName) data.allianceName = allianceName;

        const managerRole = getRoleId(interaction, "discore_manager_role");
        const scoreboardMgrRole = getRoleId(
          interaction,
          "scoreboard_manager_role",
        );
        const adminRole = getRoleId(interaction, "discore_admin_role");
        const appealPingRole = getRoleId(interaction, "appeal_ping_role");

        if (managerRole) data.discoreManagerRoleId = managerRole;
        if (scoreboardMgrRole) data.scoreboardManagerRoleId = scoreboardMgrRole;
        if (adminRole) data.disAdminRoleId = adminRole;
        if (appealPingRole) data.discoreAppealRoleId = appealPingRole;

        if (!Object.keys(data).length) {
          const {
            ensureGuild: eg,
          } = require("../../../modules/serverSettings/service");
          const g = await eg(interaction.guildId);

          const embed = new EmbedBuilder()
            .setTitle("⚙️ Server Setup")
            .setDescription(
              "Use this panel to configure your alliance identity and key Discore roles.\n\nChoose what to configure below.",
            )
            .setColor(
              parseInt((g.themeColor ?? "#1a7a9e").replace("#", ""), 16),
            )
            .setFooter({
              text: g.customFooter || "Powered by Discore",
              iconURL:
                interaction.client.user?.displayAvatarURL({
                  size: 64,
                  extension: "png",
                }) || undefined,
            })
            .setTimestamp()
            .addFields([
              ...buildSetupIdentityFields(g),
              ...buildSetupRoleFields(g),
            ]);

          const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("server_setup:menu:")
              .setPlaceholder("Choose what to configure...")
              .addOptions(
                new StringSelectMenuOptionBuilder()
                  .setLabel("🏷️ Alliance Identity")
                  .setDescription("Set alliance code and name")
                  .setValue("identity"),
                new StringSelectMenuOptionBuilder()
                  .setLabel("🎨 Theme & Footer")
                  .setDescription("Set embed color and custom footer")
                  .setValue("theme"),
                new StringSelectMenuOptionBuilder()
                  .setLabel("🛡️ Manager Roles")
                  .setDescription(
                    "Set Discore manager, scoreboard manager, and admin roles",
                  )
                  .setValue("manager_roles"),
                new StringSelectMenuOptionBuilder()
                  .setLabel("🔄 Refresh")
                  .setDescription("Refresh the setup panel")
                  .setValue("refresh"),
              ),
          );

          return interaction.editReply({
            embeds: [embed],
            components: [selectRow],
          });
        }

        guild = await updateGuildSettings(interaction.guildId, data);
        const embed = await createDiscoreEmbed(interaction, {
          guildSettings: guild,
          title: "✅ Server Setup Updated",
          fields: [
            ...buildSetupIdentityFields(guild),
            ...buildSetupRoleFields(guild),
          ],
        });
        return interaction.editReply({ embeds: [embed] });
      } else if (sub === "default-game") {
        guild = await updateGuildSettings(interaction.guildId, {
          defaultGame: interaction.options.getString("game", true),
        });
      } else if (sub === "branding") {
        if (!(await requireFeature(interaction, "branding.basic"))) return;
        const data = {};
        const name = interaction.options.getString("name");
        const logo = interaction.options.getString("logo");
        const logoUpload = interaction.options.getAttachment("logo_upload");
        const footer = interaction.options.getString("footer");
        if (name) data.allianceName = name;
        if (logoUpload?.url) data.allianceLogo = logoUpload.url;
        else if (logo) data.allianceLogo = logo;
        if (footer) data.customFooter = footer;
        if (!Object.keys(data).length)
          return interaction.editReply({
            content: "Please provide at least one branding option.",
          });
        guild = await updateGuildSettings(interaction.guildId, data);
      } else if (sub === "scoreboard-image") {
        if (!(await requireFeature(interaction, "branding.basic"))) return;
        const boardName = interaction.options.getString("scoreboard", true);
        const attachment = interaction.options.getAttachment("image", true);
        if (!attachment.contentType?.startsWith("image/"))
          return interaction.editReply({
            content: "⚠️ Please upload a valid image file.",
          });
        const board = await prisma.scoreboard.findFirst({
          where: {
            guildId: interaction.guildId,
            name: { equals: boardName, mode: "insensitive" },
            isArchived: false,
          },
        });
        if (!board)
          return interaction.editReply({
            content: "⚠️ Scoreboard not found or is archived.",
          });
        await prisma.scoreboard.update({
          where: { id: board.id },
          data: { brandingImageUrl: attachment.url },
        });
        const {
          pushLiveEmbed,
        } = require("../../../modules/scoreboards/service");
        await pushLiveEmbed(interaction.client, {
          ...board,
          brandingImageUrl: attachment.url,
        }).catch(() => {});
        return interaction.editReply({
          content: `✅ Scoreboard image updated for **${board.name}**.\nThe live scoreboard has been refreshed.`,
        });
      } else if (sub === "clear-scoreboard-image") {
        if (!(await requireFeature(interaction, "branding.basic"))) return;
        const boardName = interaction.options.getString("scoreboard", true);
        const board = await prisma.scoreboard.findFirst({
          where: {
            guildId: interaction.guildId,
            name: { equals: boardName, mode: "insensitive" },
            isArchived: false,
          },
        });
        if (!board)
          return interaction.editReply({
            content: "⚠️ Scoreboard not found or is archived.",
          });
        await prisma.scoreboard.update({
          where: { id: board.id },
          data: { brandingImageUrl: null },
        });
        const {
          pushLiveEmbed,
        } = require("../../../modules/scoreboards/service");
        await pushLiveEmbed(interaction.client, {
          ...board,
          brandingImageUrl: null,
        }).catch(() => {});
        return interaction.editReply({
          content: `✅ Scoreboard image removed from **${board.name}**.`,
        });
      } else if (sub === "channels") {
        const data = {};
        const adminLog = getChannelId(interaction, "admin_log");
        if (adminLog) {
          data.logChannelId = adminLog;
          data.adminLogChan = adminLog;
        }
        const moderationLog = getChannelId(interaction, "moderation_log");
        if (moderationLog) data.moderationLogChannelId = moderationLog;
        const appeals = getChannelId(interaction, "appeals");
        if (appeals) data.appealChannelId = appeals;
        const appealsCategory = getChannelId(interaction, "appeals_category");
        if (appealsCategory) data.appealCategoryId = appealsCategory;
        const scoreboard = getChannelId(interaction, "scoreboard");
        if (scoreboard) data.scoreboardChan = scoreboard;
        const events = getChannelId(interaction, "events");
        if (events) data.eventChannelId = events;
        const suggestions = getChannelId(interaction, "suggestions");
        if (suggestions) data.suggestionChannelId = suggestions;
        const premiumNotice = getChannelId(interaction, "premium_notice");
        if (premiumNotice) data.premiumNoticeChan = premiumNotice;
        const adminReports = getChannelId(interaction, "admin_reports");
        if (adminReports) data.adminReportsChannelId = adminReports;
        const discoreAnnouncements = getChannelId(
          interaction,
          "discore_announcements",
        );
        if (discoreAnnouncements)
          data.announcementChannelId = discoreAnnouncements;
        const aiWelcome = getChannelId(interaction, "ai_welcome");
        if (aiWelcome) data.aiWelcomeChannelId = aiWelcome;
        if (!Object.keys(data).length)
          return interaction.editReply({
            content: "Please provide at least one channel/category.",
          });
        guild = await updateGuildSettings(interaction.guildId, data);
      } else if (sub === "settings") {
        guild = await ensureGuild(interaction.guildId);
        const embed = await createDiscoreEmbed(interaction, {
          guildSettings: guild,
          title: "⚙️ Server Settings",
          fields: buildSettingsFields(guild),
        });
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === "setup-guide") {
        const {
          findBestChannel,
          sendOnboarding,
        } = require("../../../modules/onboarding/service");
        const channel = findBestChannel(interaction.guild);
        if (!channel)
          return interaction.editReply({
            content:
              "⚠️ Could not find a suitable channel to post the setup guide.",
          });
        try {
          await sendOnboarding(interaction.guild, channel);
          return interaction.editReply({
            content: `✅ Setup guide sent to ${channel}.`,
          });
        } catch (err) {
          return interaction.editReply({
            content: `⚠️ Failed to send setup guide: ${err.message}`,
          });
        }
      }

      if (sub !== "settings" && sub !== "setup") {
        const embed = await createDiscoreEmbed(interaction, {
          guildSettings: guild,
          title: getServerSettingsTitle(sub),
          fields: buildSettingsFields(guild),
        });
        return interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error("[Server Command Error]", error);
      const message = isDatabaseConnectionError(error)
        ? "⚠️ Discore could not reach the database right now. Supabase may be waking up or the pooler may be unavailable. Try again in a moment."
        : `⚠️ Server command failed: ${error.message}`;
      return interaction.editReply({ content: message }).catch(() => {});
    }
  },
};
