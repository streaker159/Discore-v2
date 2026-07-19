"use strict";

const { findComponent } = require("../loaders/componentLoader");
const { friendlyError } = require("../lib/errors");
const logger = require("../lib/logger");
const {
  trackInteraction,
} = require("../modules/player/services/userActivityService");

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
