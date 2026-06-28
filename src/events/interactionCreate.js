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

      // ── Discord Entitlement (Shop purchase) ──────────────────────────
      if (interaction.type === 29) {
        const entitlements = interaction.entitlements || [];
        const {
          processSubscriptionEntitlement,
          processAiCreditsEntitlement,
        } = require("../modules/premium/service");

        for (const ent of entitlements) {
          const guildId = ent.guild_id;
          if (!guildId) continue;

          if (ent.sku_id === process.env.DISCORD_PREMIUM_SKU_ID) {
            await processSubscriptionEntitlement(guildId, ent.id).catch((e) =>
              logger.error("Entitlement: premium activation failed", { guildId, error: e.message }),
            );
          } else if (ent.sku_id === process.env.DISCORD_AI_CREDITS_SKU_ID) {
            await processAiCreditsEntitlement(guildId, ent.sku_id, ent.id).catch((e) =>
              logger.error("Entitlement: AI credits purchase failed", { guildId, error: e.message }),
            );
          }
        }
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
