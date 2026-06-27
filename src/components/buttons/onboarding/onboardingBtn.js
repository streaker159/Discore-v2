"use strict";

const { EmbedBuilder } = require("discord.js");
const prisma = require("../../../lib/prisma");
const {
  setupRoles,
  setupChannels,
  buildOnboardingEmbed,
  buildOnboardingButtons,
  buildCommandsEmbed,
  isAdmin,
} = require("../../../modules/onboarding/service");

async function buildSummaryEmbed(guild, roleResults, channelResults) {
  const fields = [];

  if (roleResults?.length) {
    const lines = roleResults.map((r) => {
      if (r.error) return `❌ ${r.name}`;
      if (r.created) return `✅ ${r.name} (created)`;
      return `✅ ${r.name} (reused)`;
    });
    fields.push({ name: "Roles", value: lines.join("\n"), inline: false });
  }

  if (channelResults?.length) {
    const lines = channelResults.map((c) => {
      if (c.error) return `❌ ${c.name}`;
      if (c.created)
        return `✅ ${c.type === "category" ? `📁 ${c.name}` : `#${c.name}`} (created)`;
      if (c.reused)
        return `✅ ${c.type === "category" ? `📁 ${c.name}` : `#${c.name}`} (reused)`;
      return `✅ ${c.name}`;
    });
    fields.push({ name: "Channels", value: lines.join("\n"), inline: false });
  }

  if (fields.length) {
    fields.push({
      name: "⚠️ Note",
      value:
        "Please review permissions for staff/mod/appeal channels after setup.",
      inline: false,
    });
  }

  return new EmbedBuilder()
    .setTitle("✅ Discore Setup Complete")
    .setDescription("Recommended roles and channels have been configured.")
    .setColor(0x2ecc71)
    .setFooter({ text: "Discore • Setup Guide" })
    .setTimestamp()
    .addFields(fields);
}

module.exports = [
  {
    customIdPrefix: "onboard:create_roles",
    async execute(interaction) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content:
            "🚫 You need Manage Server permission to use onboarding setup.",
          flags: 64,
        });
      }
      await interaction.deferUpdate();
      const results = await setupRoles(interaction.guild);
      const embed = await buildSummaryEmbed(interaction.guild, results, null);
      await prisma.guild
        .update({
          where: { id: interaction.guildId },
          data: { onboardingCompletedAt: new Date() },
        })
        .catch(() => {});
      await interaction.editReply({ embeds: [embed], components: [] });
    },
  },
  {
    customIdPrefix: "onboard:create_channels",
    async execute(interaction) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content:
            "🚫 You need Manage Server permission to use onboarding setup.",
          flags: 64,
        });
      }
      await interaction.deferUpdate();
      const results = await setupChannels(interaction.guild);
      const embed = await buildSummaryEmbed(interaction.guild, null, results);
      await prisma.guild
        .update({
          where: { id: interaction.guildId },
          data: { onboardingCompletedAt: new Date() },
        })
        .catch(() => {});
      await interaction.editReply({ embeds: [embed], components: [] });
    },
  },
  {
    customIdPrefix: "onboard:create_all",
    async execute(interaction) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content:
            "🚫 You need Manage Server permission to use onboarding setup.",
          flags: 64,
        });
      }
      await interaction.deferUpdate();
      const roleResults = await setupRoles(interaction.guild);
      const channelResults = await setupChannels(interaction.guild);
      const embed = await buildSummaryEmbed(
        interaction.guild,
        roleResults,
        channelResults,
      );
      await prisma.guild
        .update({
          where: { id: interaction.guildId },
          data: { onboardingCompletedAt: new Date() },
        })
        .catch(() => {});
      await interaction.editReply({ embeds: [embed], components: [] });
    },
  },
  {
    customIdPrefix: "onboard:skip",
    async execute(interaction) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content:
            "🚫 You need Manage Server permission to use onboarding setup.",
          flags: 64,
        });
      }
      await interaction.deferUpdate();
      await prisma.guild
        .update({
          where: { id: interaction.guildId },
          data: { onboardingSkippedAt: new Date() },
        })
        .catch(() => {});
      const embed = new EmbedBuilder()
        .setTitle("⏭️ Setup Skipped")
        .setDescription(
          "You can configure Discore manually with `/server setup` and `/server channels`.",
        )
        .setColor(0x95a5a6)
        .setFooter({ text: "Discore • Setup Guide" });
      await interaction.editReply({ embeds: [embed], components: [] });
    },
  },
  {
    customIdPrefix: "onboard:commands",
    async execute(interaction) {
      await interaction.reply({ embeds: [buildCommandsEmbed()], flags: 64 });
    },
  },
];
