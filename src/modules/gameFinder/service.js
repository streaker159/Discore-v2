const { gameFinderCache } = require('../../lib/cache');

async function createMatchWatcher(criteria) {
  // Placeholder: once an approved API/endpoint/companion extension exists,
  // store watchers in PostgreSQL and compare them against the global cache.
  const id = `watch_${Date.now()}`;
  gameFinderCache.set(id, { id, ...criteria }, 60 * 60 * 1000);
  return { id, ...criteria };
}

module.exports = { createMatchWatcher };
