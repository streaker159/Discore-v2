const { findComponent } = require('../loaders/componentLoader');
const { friendlyError } = require('../lib/errors');
const logger = require('../lib/logger');

async function safeReply(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, client);
        return;
      }

      if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        const component = findComponent(client, interaction.customId);
        if (!component) {
          await safeReply(interaction, { content: 'That interaction is no longer available.', ephemeral: true });
          return;
        }
        await component.execute(interaction, client);
      }
    } catch (error) {
      logger.error('Interaction failed', { error: error.stack || error.message });
      await safeReply(interaction, { content: friendlyError(error), ephemeral: true }).catch(() => {});
    }
  },
};
