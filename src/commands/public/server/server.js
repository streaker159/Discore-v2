const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const {
  updateGuildSettings,
  ensureGuild,
} = require("../../../modules/serverSettings/service");
const { requireFeature } = require("../../../lib/premiumGate");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");

module.exports = {
  scope: "SERVER_ADMIN",
  data: new SlashCommandBuilder()
    .setName("server")
    .setDescription("Configure Discore server settings.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
