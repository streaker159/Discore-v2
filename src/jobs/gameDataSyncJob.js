module.exports = {
  name: 'gameDataSyncJob',
  intervalMs: 60 * 60_000,
  enabled: false,
  async run(client) {
    // Placeholder: approved wiki/API sync only. Normal bot commands should read from DB.
  },
};
