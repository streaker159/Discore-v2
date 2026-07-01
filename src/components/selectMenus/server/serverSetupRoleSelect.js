"use strict";

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const {
  ensureGuild,
  updateGuildSettings,
} = require("../../../modules/serverSettings/service");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleMention(id) {
  return id ? `<@&${id}>` : "Not set";
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

function buildSetupSelectMenu() {
  return new ActionRowBuilder().addComponents(
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
}

// ─── Role field mapping ──────────────────────────────────────────────────────

const ROLE_FIELD_MAP = {
  discore_manager_role: "discoreManagerRoleId",
  scoreboard_manager_role: "scoreboardManagerRoleId",
  discore_admin_role: "disAdminRoleId",
};

const ROLE_LABELS = {
  discore_manager_role: "Discore Manager Role",
  scoreboard_manager_role: "Scoreboard Manager Role",
  discore_admin_role: "Discore Admin Role",
};

// ─── Component handler ───────────────────────────────────────────────────────

module.exports = {
  customIdPrefix: "server_setup_role:",

  async execute(interaction) {
    const customId = interaction.customId;
    const roleId = interaction.values?.[0];

    if (!roleId) {
      return interaction.reply({ content: "No role selected.", flags: 64 });
    }

    // Extract the role key from the customId
    // customId format: "server_setup_role:discore_manager_role"
    const roleKey = customId.split(":")[1];
    const fieldName = ROLE_FIELD_MAP[roleKey];
    const labelName = ROLE_LABELS[roleKey];

    if (!fieldName) {
      return interaction.reply({ content: "Unknown role field.", flags: 64 });
    }

    // Save the role
    await updateGuildSettings(interaction.guildId, { [fieldName]: roleId });

    // Show updated setup panel
    const guild = await ensureGuild(interaction.guildId);
    const embed = await createDiscoreEmbed(interaction, {
      guildSettings: guild,
      title: "✅ Server Setup Updated",
      description: `**${labelName}** has been set to <@&${roleId}>.\n\nChoose what to configure below.`,
      fields: [
        ...buildSetupIdentityFields(guild),
        ...buildSetupRoleFields(guild),
      ],
    });

    return interaction.update({
      content: null,
      embeds: [embed],
      components: [buildSetupSelectMenu()],
    });
  },
};
