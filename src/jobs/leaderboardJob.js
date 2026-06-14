/**
 * Scheduled leaderboard posting job.
 * Posts/updates all enabled leaderboard channels on their configured schedule,
 * and fires random updates when alliances move in the rankings.
 */
const prisma = require("../lib/prisma");
const {
  postOrUpdateLeaderboard,
} = require("../modules/profiles/leaderboardService");
const logger = require("../lib/logger");

module.exports = {
  name: "leaderboardJob",
  intervalMs: 5 * 60_000, // check every 5 minutes
  enabled: true,

  async run(client) {
    const now = new Date();

    // ── Scheduled posts ──────────────────────────────────
    const settings = await prisma.leaderboardSettings.findMany({
      where: { enabled: true },
    });

    for (const setting of settings) {
      try {
        const shouldPost = shouldRunNow(setting, now);
        if (!shouldPost) continue;

        // Post all enabled channels for this guild
        const channels = await prisma.leaderboardChannel.findMany({
          where: { guildId: setting.guildId, enabled: true },
        });

        for (const chan of channels) {
          await postOrUpdateLeaderboard(client, chan).catch((err) =>
            logger.error("leaderboardJob: failed to post", {
              channelId: chan.channelId,
              error: err.message,
            }),
          );
        }

        await prisma.leaderboardSettings.update({
          where: { id: setting.id },
          data: { lastPostedAt: now },
        });
      } catch (err) {
        logger.error("leaderboardJob: guild error", {
          guildId: setting.guildId,
          error: err.message,
        });
      }
    }

    // ── Random rank-change alerts ────────────────────────
    await checkRankChanges(client);
  },
};

function shouldRunNow(setting, now) {
  if (!setting.lastPostedAt) return true; // never posted

  const msSinceLast = now.getTime() - setting.lastPostedAt.getTime();
  const msFrequency = setting.frequencyHours * 60 * 60 * 1000;
  if (msSinceLast < msFrequency) return false;

  // Also respect hour / minute preference (within ±5 min window)
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const targetMinuteOfDay = setting.scheduleHour * 60 + setting.scheduleMinute;
  const currentMinuteOfDay = utcHour * 60 + utcMinute;
  return Math.abs(currentMinuteOfDay - targetMinuteOfDay) <= 5;
}

// Track previous Elo for rank-change detection (in-memory, resets on restart)
const prevAllianceElo = new Map();

async function checkRankChanges(client) {
  try {
    const alliances = await prisma.allianceProfile.findMany({
      where: { isPublic: true },
      orderBy: { discoreElo: "desc" },
      select: { id: true, tag: true, name: true, discoreElo: true },
    });

    for (let i = 0; i < alliances.length; i++) {
      const a = alliances[i];
      const prev = prevAllianceElo.get(a.id);
      const currentRank = i + 1;

      if (prev && prev.rank !== currentRank) {
        // Alliance moved – find channels that track alliance leaderboards
        const chanRecords = await prisma.leaderboardChannel.findMany({
          where: { type: "TOP_ALLIANCES_ELO", enabled: true },
        });

        for (const chan of chanRecords) {
          const channel = await client.channels
            .fetch(chan.channelId)
            .catch(() => null);
          if (!channel?.isTextBased()) continue;

          const direction =
            currentRank < prev.rank ? "📈 moved up" : "📉 moved down";
          await channel
            .send({
              content: `⚡ **[${a.tag}] ${a.name}** has ${direction} to **rank #${currentRank}** (was #${prev.rank}) on the Discore Alliance leaderboard!`,
            })
            .catch(() => {});
        }
      }

      prevAllianceElo.set(a.id, { rank: currentRank, elo: a.discoreElo });
    }
  } catch {
    // Non-critical
  }
}
