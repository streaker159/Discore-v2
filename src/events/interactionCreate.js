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

        await command.execute(interaction, client);
        return;
      }

      if (
        interaction.isButton() ||
        interaction.isStringSelectMenu() ||
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
