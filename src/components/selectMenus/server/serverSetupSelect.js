"use strict";

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
} = require("discord.js");
const {
  ensureGuild,
  updateGuildSettings,
} = require("../../../modules/serverSettings/service");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");
const { requireFeature } = require("../../../lib/premiumGate");
const prisma = require("../../../lib/prisma");

// ─── Alliance code validation ─────────────────────────────────────────────────

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
    {
      name: "AvA Alert Role",
      value: roleMention(guild.avaAlertRoleId),
      inline: true,
    },
    {
      name: "AvA Role",
      value: roleMention(guild.discoreAvaRoleId),
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
          .setLabel("⚔️ AvA Roles")
          .setDescription("Set AvA alert and AvA feature roles")
          .setValue("ava_roles"),
        new StringSelectMenuOptionBuilder()
          .setLabel("🔄 Refresh")
          .setDescription("Refresh the setup panel")
          .setValue("refresh"),
      ),
  );
}

// ─── Component handler ───────────────────────────────────────────────────────

module.exports = {
  customIdPrefix: "server_setup:menu:",
  async execute(interaction) {
    const choice = interaction.values[0];

    // ── Refresh ──────────────────────────────────────────────────────────
    if (choice === "refresh") {
      const guild = await ensureGuild(interaction.guildId);
      const embed = await createDiscoreEmbed(interaction, {
        guildSettings: guild,
        title: "⚙️ Server Setup",
        description:
          "Use this panel to configure your alliance identity and key Discore roles.\n\nChoose what to configure below.",
        fields: [
          ...buildSetupIdentityFields(guild),
          ...buildSetupRoleFields(guild),
        ],
      });
      return interaction.update({
        embeds: [embed],
        components: [buildSetupSelectMenu()],
      });
    }

    // ── Alliance Identity → modal ────────────────────────────────────────
    if (choice === "identity") {
      const guild = await ensureGuild(interaction.guildId);
      const modal = new ModalBuilder()
        .setCustomId("server_setup_modal:identity:")
        .setTitle("Alliance Identity");

      const codeInput = new TextInputBuilder()
        .setCustomId("alliance_code")
        .setLabel("Alliance Code (1-6 letters/numbers)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(6)
        .setValue(guild.allianceCode || "")
        .setPlaceholder("e.g. LAST, WOLF, TLB1");

      const nameInput = new TextInputBuilder()
        .setCustomId("alliance_name")
        .setLabel("Alliance Name")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100)
        .setValue(guild.allianceName || "")
        .setPlaceholder("e.g. The Last Battalion");

      modal.addComponents(
        new ActionRowBuilder().addComponents(codeInput),
        new ActionRowBuilder().addComponents(nameInput),
      );

      return interaction.showModal(modal);
    }

    // ── Theme & Footer → modal ───────────────────────────────────────────
    if (choice === "theme") {
      const guild = await ensureGuild(interaction.guildId);
      const modal = new ModalBuilder()
        .setCustomId("server_setup_modal:theme:")
        .setTitle("Theme & Footer");

      const colorInput = new TextInputBuilder()
        .setCustomId("theme_color")
        .setLabel("Theme Color (hex, e.g. #1a7a9e)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(7)
        .setValue(guild.themeColor || "")
        .setPlaceholder("#1a7a9e");

      const footerInput = new TextInputBuilder()
        .setCustomId("custom_footer")
        .setLabel("Custom Footer Text (Premium: PRO+)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100)
        .setValue(guild.customFooter || "")
        .setPlaceholder("Powered by Discore");

      modal.addComponents(
        new ActionRowBuilder().addComponents(colorInput),
        new ActionRowBuilder().addComponents(footerInput),
      );

      return interaction.showModal(modal);
    }

    // ── Manager Roles → role selects ─────────────────────────────────────
    if (choice === "manager_roles") {
      const discoreManager = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("server_setup_role:discore_manager_role")
          .setPlaceholder("Select Discore Manager Role"),
      );
      const scoreboardMgr = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("server_setup_role:scoreboard_manager_role")
          .setPlaceholder("Select Scoreboard Manager Role"),
      );
      const adminRole = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("server_setup_role:discore_admin_role")
          .setPlaceholder("Select Discore Admin Role"),
      );

      return interaction.update({
        content:
          "🛡️ **Select the manager roles below.**\nSelect a role to save it, or dismiss this message.",
        components: [discoreManager, scoreboardMgr, adminRole],
        embeds: [],
      });
    }

    // ── AvA Roles → role selects ─────────────────────────────────────────
    if (choice === "ava_roles") {
      const avaAlert = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("server_setup_role:ava_alert_role")
          .setPlaceholder("Select AvA Alert Role"),
      );
      const avaRole = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("server_setup_role:ava_role")
          .setPlaceholder("Select AvA Role"),
      );

      return interaction.update({
        content:
          "⚔️ **Select the AvA roles below.**\nSelect a role to save it, or dismiss this message.",
        components: [avaAlert, avaRole],
        embeds: [],
      });
    }
  },
};
