const path = require('path');
const { walkFiles } = require('./fileWalker');
const logger = require('../lib/logger');

function loadEvents(client) {
  const eventsRoot = path.join(__dirname, '..', 'events');
  const files = walkFiles(eventsRoot);

  for (const file of files) {
    const event = require(file);
    if (!event?.name || typeof event.execute !== 'function') {
      logger.warn('Skipped invalid event', { file });
      continue;
    }

    if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
    else client.on(event.name, (...args) => event.execute(...args, client));
    logger.info('Loaded event', { name: event.name });
  }
}

module.exports = { loadEvents };
