"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { requireBotOwner } = require("../../../lib/ownerGuard");
const {
  getOwnerReportSettings,
  updateOwnerReportSettings,
  resetOwnerReportSettings,
  getDatabaseStatus,
  buildSettingsEmbed,
  sendDatabaseStatusReport,
} = require("../../../modules/ownerReports");

const CHANNEL_FIELDS = {
  hourly: {
    label: "Hourly report channel ID",
    key: "hourlyReportChannelId",
  },
  join: {
    label: "Server added channel ID",
    key: "guildJoinChannelId",
  },
  leave: {
    label: "Server removed channel ID",
    key: "guildLeaveChannelId",
  },
  database: {
    label: "Database status channel ID",
    key: "databaseStatusChannelId",
  },
};

function buildPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("owner_reports:set:hourly")
        .setLabel("Set Hourly")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("owner_reports:set:join")
        .setLabel("Set Added")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("owner_reports:set:leave")
        .setLabel("Set Removed")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("owner_reports:set:database")
        .setLabel("Set Database")
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("owner_reports:db_now")
        .setLabel("Send DB Status")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("owner_reports:refresh")
        .setLabel("Refresh")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("owner_reports:reset")
        .setLabel("Reset Channels")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

async function buildOwnerReportPanel(interaction) {
  const [settings, dbStatus] = await Promise.all([
    getOwnerReportSettings(),
    getDatabaseStatus(interaction.client),
  ]);
  return {
    embeds: [buildSettingsEmbed(settings, dbStatus)],
    components: buildPanelComponents(),
    flags: 64,
  };
}

function channelModal(action, currentValue) {
  const config = CHANNEL_FIELDS[action];
  const input = new TextInputBuilder()
    .setCustomId("channel_id")
    .setLabel(config.label)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(32)
    .setPlaceholder("1367326139109871738");

  if (currentValue) input.setValue(String(currentValue));

  return new ModalBuilder()
    .setCustomId(`owner_reports:modal:${action}`)
    .setTitle(`Set ${config.label}`)
    .addComponents(new ActionRowBuilder().addComponents(input));
}

async function renderUpdatedPanel(interaction, content) {
  const payload = await buildOwnerReportPanel(interaction);
  return interaction.editReply({
    content,
    embeds: payload.embeds,
    components: payload.components,
  });
}

module.exports = {
  customIdPrefix: "owner_reports:",
  buildOwnerReportPanel,
  async execute(interaction) {
    if (!(await requireBotOwner(interaction))) return;

    const [, action, value] = interaction.customId.split(":");

    if (action === "set") {
      const settings = await getOwnerReportSettings();
      const config = CHANNEL_FIELDS[value];
      if (!config) {
        return interaction.reply({
          content: "Unknown report channel type.",
          flags: 64,
        });
      }
      return interaction.showModal(channelModal(value, settings[config.key]));
    }

    if (action === "modal") {
      const config = CHANNEL_FIELDS[value];
      if (!config) {
        return interaction.reply({
          content: "Unknown report channel type.",
          flags: 64,
        });
      }
      const channelId = interaction.fields
        .getTextInputValue("channel_id")
        .trim();
      const channel = await interaction.client.channels
        .fetch(channelId)
        .catch(() => null);
      if (!channel?.isTextBased?.()) {
        return interaction.reply({
          content:
            "That channel ID could not be found or is not a text channel the bot can access.",
          flags: 64,
        });
      }

      await interaction.deferReply({ flags: 64 });
      await updateOwnerReportSettings({ [config.key]: channelId });
      return renderUpdatedPanel(
        interaction,
        `${config.label} updated to <#${channelId}>.`,
      );
    }

    if (action === "reset") {
      await interaction.deferReply({ flags: 64 });
      await resetOwnerReportSettings();
      return renderUpdatedPanel(
        interaction,
        "Owner report channels reset to the Discore operations channel.",
      );
    }

    if (action === "refresh") {
      await interaction.deferUpdate();
      const payload = await buildOwnerReportPanel(interaction);
      return interaction.editReply({
        embeds: payload.embeds,
        components: payload.components,
      });
    }

    if (action === "db_now") {
      await interaction.deferReply({ flags: 64 });
      const status = await sendDatabaseStatusReport(interaction.client);
      return renderUpdatedPanel(
        interaction,
        status.ok
          ? `Database status sent. Database is online at ${status.latencyMs}ms.`
          : `Database status sent. Database check failed: ${status.error}`,
      );
    }

    return interaction.reply({
      content: "Unknown owner report panel action.",
      flags: 64,
    });
  },
};
