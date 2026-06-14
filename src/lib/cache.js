class TTLCache {
  constructor(defaultTtlMs = 60_000) {
    this.defaultTtlMs = defaultTtlMs;
    this.items = new Map();
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    this.items.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get(key) {
    const item = this.items.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.items.delete(key);
      return null;
    }
    return item.value;
  }

  delete(key) {
    return this.items.delete(key);
  }

  clear() {
    this.items.clear();
  }
}

module.exports = {
  TTLCache,
  guildSettingsCache: new TTLCache(60_000),
  premiumCache: new TTLCache(60_000),
  gameFinderCache: new TTLCache(120_000),
  // Holds pending profile parse results while user reviews (15 min TTL)
  pendingProfileCache: new TTLCache(15 * 60_000),
};
