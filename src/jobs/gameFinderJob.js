module.exports = {
  name: 'gameFinderJob',
  intervalMs: 120_000,
  enabled: true,
  async run(client) {
    // Placeholder: global game finder scanner goes here.
    // Design rule: scan once globally, cache results, then match all server watchers.
  },
};
