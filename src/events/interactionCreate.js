const { findComponent } = require("../loaders/componentLoader");
const { friendlyError } = require("../lib/errors");
const logger = require("../lib/logger");

async function safeReply(interaction, payload) {
  if (interaction.deferred || interaction.replied)
    return interaction.followUp(payload);
  return interaction.reply(payload);
}

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client) {
    try {
      // ── autocomplete ─────────────────────────────────────────────────────
      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete)
          await command.autocomplete(interaction, client);
        return;
      }

      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, client);
        return;
      }

      if (
        interaction.isButton() ||
        interaction.isStringSelectMenu() ||
        interaction.isModalSubmit()
      ) {
        const component = findComponent(client, interaction.customId);
        if (!component) {
          await safeReply(interaction, {
            content: "That interaction is no longer available.",
            ephemeral: true,
          });
          return;
        }
        await component.execute(interaction, client);
      }
    } catch (error) {
      logger.error("Interaction failed", {
        error: error.stack || error.message,
      });
      // Ignore expired/unknown interaction errors (Discord 10062) — nothing we can do
      if (error?.code === 10062) return;
      await safeReply(interaction, {
        content: friendlyError(error),
        flags: 64,
      }).catch(() => {});
    }
  },
};
