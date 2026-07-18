module.exports = {
  // Scoreboards
  "scoreboards.basic": "FREE",
  "scoreboards.archive": "PRO",
  "scoreboards.restore": "PRO",
  "scoreboards.merge": "PRO",
  // Battle & events
  "battle.signup": "FREE",
  "events.create": "FREE",
  "events.liveLimit": "FREE",
  // Game data
  "game.lookup": "FREE",
  // Note: AI features (/ask, translation, welcome AI) are NOT gated by tier
  // here. They're gated purely by AI credits (see modules/premium/service.js
  // canUseAi/consumeAiCredits) — a FREE server can use AI if it has purchased
  // credits, and Premium includes 2,000 AI credits/month automatically.
  // Game finder
  "match.finder": "PRO",
  // Branding
  "branding.basic": "PRO",
  "branding.customNickname": "PRO",
  "branding.customFooter": "PRO",
  // Alliance & players
  "alliance.profiles": "FREE",
  "alliance.globalRanking": "FREE",
  // Suggestions
  "suggestions.create": "FREE",
  // Moderation exports (full case history + transcripts)
  "moderation.export": "PREMIUM",
  // Automod: dashboard + basic review/delete rules are free.
  // Advanced actions (timeout, appeals, custom user messages, exempt
  // roles/ignored channels, test rule, more than 3 rules) require premium.
  "automod.advanced": "PREMIUM",
  // Discore XP system
  "xp.message": "FREE",
  "xp.reaction": "PREMIUM",
  "xp.weeklyLeaderboard": "PREMIUM",
  "xp.profileCosmetics": "PREMIUM",
  // Auto Posts
  autopost: "PREMIUM",
  // Onboarding Applications (full system)
  "onboarding.manage": "PREMIUM",
  "onboarding.review": "PREMIUM",
};
