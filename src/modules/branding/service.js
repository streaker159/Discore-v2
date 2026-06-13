const { updateGuildSettings } = require('../serverSettings/service');

async function setBranding(guildId, data) {
  return updateGuildSettings(guildId, data);
}

module.exports = { setBranding };
