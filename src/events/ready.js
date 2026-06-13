const logger = require('../lib/logger');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    logger.info(`Logged in as ${client.user.tag}`);
    client.user.setActivity('strategy communities', { type: 3 });
  },
};
