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

async function checkAllianceCodeUnique(code, ownGuildId) {
  const existing = await prisma.guild.findFirst({
    where: { allianceCode: code, id: { not: ownGuildId } },
    select: { id: true },
  });
  return !existing;
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

// ─── Modal handler ───────────────────────────────────────────────────────────

module.exports = {
  customIdPrefix: "server_setup_modal:",

  async execute(interaction) {
    const data = {};

    if (interaction.customId.startsWith("server_setup_modal:identity:")) {
      const rawCode = interaction.fields.getTextInputValue("alliance_code");
      const rawName = interaction.fields.getTextInputValue("alliance_name");

      if (rawCode) {
        const validation = validateAllianceCode(rawCode);
        if (validation.error) {
          return interaction.reply({ content: validation.error, flags: 64 });
        }
        const unique = await checkAllianceCodeUnique(
          validation.code,
          interaction.guildId,
        );
        if (!unique) {
          return interaction.reply({
            content: `⚠️ Alliance code **${validation.code}** is already used by another server.`,
            flags: 64,
          });
        }
        data.allianceCode = validation.code;
      }

      if (rawName) data.allianceName = rawName;
    }

    if (interaction.customId.startsWith("server_setup_modal:theme:")) {
      const rawColor = interaction.fields.getTextInputValue("theme_color");
      const rawFooter = interaction.fields.getTextInputValue("custom_footer");

      if (rawColor) {
        const clean = rawColor.replace("#", "");
        if (!/^[0-9A-Fa-f]{6}$/.test(clean)) {
          return interaction.reply({
            content: "⚠️ Invalid theme color. Use a hex color like `#1a7a9e`.",
            flags: 64,
          });
        }
        data.themeColor = `#${clean}`;
      }

      if (rawFooter) {
        // Premium gate check via interaction reply
        const { hasFeature } = require("../../../lib/premiumGate");
        const ok = await hasFeature(
          interaction.guildId,
          "branding.customFooter",
        );
        if (!ok) {
          return interaction.reply({
            content: "🔒 Custom footer is a premium feature.",
            flags: 64,
          });
        }
        data.customFooter = rawFooter;
      }
    }

    // Apply changes
    if (Object.keys(data).length) {
      await updateGuildSettings(interaction.guildId, data);
    }

    // Show updated setup panel
    const guild = await ensureGuild(interaction.guildId);
    const embed = await createDiscoreEmbed(interaction, {
      guildSettings: guild,
      title: "✅ Server Setup Updated",
      description:
        "Your changes have been saved.\n\nChoose what to configure below.",
      fields: [
        ...buildSetupIdentityFields(guild),
        ...buildSetupRoleFields(guild),
      ],
    });

    return interaction.reply({
      embeds: [embed],
      components: [buildSetupSelectMenu()],
      flags: 64,
    });
  },
};
