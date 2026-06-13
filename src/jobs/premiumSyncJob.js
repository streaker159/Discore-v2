module.exports = {
  name: 'premiumSyncJob',
  intervalMs: 15 * 60_000,
  enabled: true,
  async run(client) {
    // Placeholder: expire trials, sync Stripe statuses, monthly AI credit reset.
  },
};
