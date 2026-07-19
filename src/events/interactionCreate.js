"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { findComponent } = require("../loaders/componentLoader");
const { friendlyError } = require("../lib/errors");
const logger = require("../lib/logger");
const {
  trackInteraction,
} = require("../modules/player/services/userActivityService");

const missingBotInstallReports = new Map();
const MISSING_BOT_REPORT_COOLDOWN_MS = 60 * 60 * 1000;

function buildBotInviteUrl(clientId) {
  const permissions =
    PermissionFlagsBits.ViewChannel |
    PermissionFlagsBits.SendMessages |
    PermissionFlagsBits.EmbedLinks |
    PermissionFlagsBits.ManageRoles |
    PermissionFlagsBits.ManageChannels |
    PermissionFlagsBits.ManageGuild |
    PermissionFlagsBits.ModerateMembers |
    PermissionFlagsBits.BanMembers |
    PermissionFlagsBits.KickMembers |
    PermissionFlagsBits.ReadMessageHistory |
    PermissionFlagsBits.AddReactions |
    PermissionFlagsBits.UseExternalEmojis |
    PermissionFlagsBits.AttachFiles;

  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${permissions.toString()}&integration_type=0&scope=bot+applications.commands`;
}

async function ensureBotPresentForGuildInteraction(interaction, client) {
  if (!interaction.guildId) return true;
  if (client.guilds.cache.has(interaction.guildId)) return true;

  const guild = await client.guilds.fetch(interaction.guildId).catch(() => null);
  if (guild) return true;

  const inviteUrl = buildBotInviteUrl(client.user.id);
  const now = Date.now();
  const lastReportedAt = missingBotInstallReports.get(interaction.guildId) || 0;

  if (now - lastReportedAt > MISSING_BOT_REPORT_COOLDOWN_MS) {
    missingBotInstallReports.set(interaction.guildId, now);
    const { sendOwnerReport } = require("../modules/ownerReports");
    const embed = new EmbedBuilder()
      .setTitle("Commands-Only App Install Detected")
      .setColor(0xed4245)
      .setDescription(
        "A server used Discore commands, but the bot user is not present in the guild. Onboarding cannot run until the bot is invited with the `bot` scope.",
      )
      .addFields(
        { name: "Guild ID", value: interaction.guildId, inline: true },
        {
          name: "Command/User",
          value: `/${interaction.commandName || "component"} by <@${interaction.user.id}>`,
          inline: true,
        },
        { name: "Correct Invite", value: inviteUrl, inline: false },
      )
      .setTimestamp();

    sendOwnerReport(client, "guildJoin", { embeds: [embed] }).catch(() => {});
  }

  await safeReply(interaction, {
    content:
      "Discore was installed for slash commands only, so the bot is not actually in this server and cannot create channels, roles, or send onboarding. Ask a server admin to re-add Discore with this bot invite:\n" +
      inviteUrl,
  });
  return false;
}

function trackInteractionInBackground(interaction) {
  if (!interaction.guildId || !interaction.user?.id) return;

  setImmediate(() => {
    trackInteraction(interaction.guildId, interaction.user.id).catch(() => {});
  });
}

async function safeReply(interaction, payload) {
  try {
    if (!interaction || !interaction.isRepliable?.()) return;

    const safePayload = {
      flags: 64,
      ...payload,
    };

    delete safePayload.ephemeral;

    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp(safePayload).catch(() => null);
    }

    return await interaction.reply(safePayload).catch(() => null);
  } catch {
    return null;
  }
}

module.exports = {
  name: "interactionCreate",

  async execute(interaction, client) {
    try {
      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);

        if (command?.autocomplete) {
          await command.autocomplete(interaction, client);
        }

        return;
      }

      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        if (!(await ensureBotPresentForGuildInteraction(interaction, client))) {
          return;
        }

        trackInteractionInBackground(interaction);

        const startTime = Date.now();
        try {
          await command.execute(interaction, client);
          // Track success
          const { trackCommand } = require("../lib/commandTracker");
          trackCommand({
            guildId: interaction.guildId,
            userId: interaction.user.id,
            commandName: interaction.commandName,
            subcommand: interaction.options.getSubcommand(false) || null,
            success: true,
            durationMs: Date.now() - startTime,
          });
        } catch (err) {
          // Track failure
          const { trackCommand } = require("../lib/commandTracker");
          trackCommand({
            guildId: interaction.guildId,
            userId: interaction.user.id,
            commandName: interaction.commandName,
            subcommand: interaction.options.getSubcommand(false) || null,
            success: false,
            durationMs: Date.now() - startTime,
          });
          throw err;
        }
        return;
      }

      if (
        interaction.isButton() ||
        interaction.isStringSelectMenu() ||
        interaction.isChannelSelectMenu() ||
        interaction.isUserSelectMenu() ||
        interaction.isRoleSelectMenu() ||
        interaction.isMentionableSelectMenu() ||
        interaction.isModalSubmit()
      ) {
        if (!(await ensureBotPresentForGuildInteraction(interaction, client))) {
          return;
        }

        trackInteractionInBackground(interaction);

        const component = findComponent(client, interaction.customId);

        if (!component) {
          await safeReply(interaction, {
            content: "That interaction is no longer available.",
          });
          return;
        }

        await component.execute(interaction, client);
        return;
      }

      // Premium is now granted by owner dashboard/manual code redemption,
      // not Discord Shop entitlement events.
    } catch (error) {
      if (error?.code === 10062) return;

      logger.error("Interaction failed", {
        error: error.stack || error.message,
      });

      await safeReply(interaction, {
        content: friendlyError(error),
      });
    }
  },
};
