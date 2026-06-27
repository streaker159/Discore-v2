const PLAN_RANK = {
  FREE: 0,
  PREMIUM: 1,
  PRO: 1,
  ELITE: 2,
  LIFETIME: 99,
};

const PLAN_LIMITS = {
  FREE: {
    liveScoreboards: 5,
    liveEvents: 5,
    aiCreditsMonthly: 0,
  },
  PREMIUM: {
    liveScoreboards: 50,
    liveEvents: 50,
    aiCreditsMonthly: 2000,
  },
  PRO: {
    liveScoreboards: 50,
    liveEvents: 50,
    aiCreditsMonthly: 2000,
  },
  ELITE: {
    liveScoreboards: 100,
    liveEvents: 250,
    aiCreditsMonthly: 2000,
  },
  LIFETIME: {
    liveScoreboards: 999,
    liveEvents: 9999,
    aiCreditsMonthly: 5000,
  },
};

function normalizeTier(tier) {
  return String(tier || "FREE").toUpperCase();
}

function hasTier(currentTier, requiredTier) {
  return (
    PLAN_RANK[normalizeTier(currentTier)] >=
    PLAN_RANK[normalizeTier(requiredTier)]
  );
}

function getPlanLimits(tier) {
  return PLAN_LIMITS[normalizeTier(tier)] || PLAN_LIMITS.FREE;
}

module.exports = {
  PLAN_RANK,
  PLAN_LIMITS,
  normalizeTier,
  hasTier,
  getPlanLimits,
};
