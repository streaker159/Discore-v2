/**
 * Leaderboard service – builds embeds for scheduled & on-demand leaderboards.
 */
const prisma = require("../../lib/prisma");
const { EmbedBuilder } = require("discord.js");
const { getTopPlayers } = require("./playerService");
const { getTopAlliances } = require("./allianceProfileService");

const MEDAL = ["🥇", "🥈", "🥉"];
function medal(i) {
  return MEDAL[i] ?? `**${i + 1}.**`;
}
function n(v, fb = "N/A") {
  return v != null ? String(v) : fb;
}

// ── PLAYER LEADERBOARDS ─────────────────────────────────────────────────────

async function buildTopPlayersEloEmbed() {
  const players = await getTopPlayers("discoreElo", 15);
  const lines = players.map(
    (p, i) =>
      `${medal(i)} <@${p.discordId}> — **${p.gameUsername || "Unknown"}** | Elo: ${p.discoreElo} | W/L: ${p.avaWins}/${p.avaLosses}`,
  );
  return new EmbedBuilder()
    .setColor(0x1a3a5c)
    .setTitle("🏆 Top Players — Discore Elo")
    .setDescription(
      lines.length ? lines.join("\n") : "*No players ranked yet.*",
    )
    .setTimestamp()
    .setFooter({ text: "Discore • Player Leaderboard" });
}

async function buildTopPlayersKDEmbed() {
  const players = await getTopPlayers("kdRatio", 15);
  const lines = players.map(
    (p, i) =>
      `${medal(i)} <@${p.discordId}> — **${p.gameUsername || "Unknown"}** | K/D: ${p.kdRatio?.toFixed(2) ?? "N/A"} | Killed: ${n(p.unitsKilled?.toLocaleString())}`,
  );
  return new EmbedBuilder()
    .setColor(0x1a3a5c)
    .setTitle("🗡️ Top Players — K/D Ratio")
    .setDescription(
      lines.length ? lines.join("\n") : "*No players ranked yet.*",
    )
    .setTimestamp()
    .setFooter({ text: "Discore • Player Leaderboard" });
}

async function buildTopPlayersWinsEmbed() {
  const players = await getTopPlayers("avaWins", 15);
  const lines = players.map(
    (p, i) =>
      `${medal(i)} <@${p.discordId}> — **${p.gameUsername || "Unknown"}** | Wins: ${p.avaWins} | Win Rate: ${
        p.avaWins + p.avaLosses > 0
          ? ((p.avaWins / (p.avaWins + p.avaLosses)) * 100).toFixed(1) + "%"
          : "N/A"
      }`,
  );
  return new EmbedBuilder()
    .setColor(0x1a3a5c)
    .setTitle("🏅 Top Players — Verified Wins")
    .setDescription(
      lines.length ? lines.join("\n") : "*No players ranked yet.*",
    )
    .setTimestamp()
    .setFooter({ text: "Discore • Player Leaderboard" });
}

// ── ALLIANCE LEADERBOARDS ───────────────────────────────────────────────────

async function buildTopAlliancesEloEmbed() {
  const alliances = await getTopAlliances("discoreElo", 15);
  const lines = alliances.map(
    (a, i) =>
      `${medal(i)} **${a.name} [${a.tag}]** | Elo: ${a.discoreElo} | W/L: ${a.discoreWins}/${a.discoreLosses}`,
  );
  return new EmbedBuilder()
    .setColor(0x0f3460)
    .setTitle("🏰 Top Alliances — Discore Elo")
    .setDescription(
      lines.length ? lines.join("\n") : "*No alliances ranked yet.*",
    )
    .setTimestamp()
    .setFooter({ text: "Discore • Alliance Leaderboard" });
}

async function buildTopAlliancesWinsEmbed() {
  const alliances = await getTopAlliances("discoreWins", 15);
  const lines = alliances.map(
    (a, i) =>
      `${medal(i)} **${a.name} [${a.tag}]** | Wins: ${a.discoreWins} | Record: ${a.seasonRecord ?? "N/A"}`,
  );
  return new EmbedBuilder()
    .setColor(0x0f3460)
    .setTitle("⚔️ Top Alliances — Verified Wins")
    .setDescription(
      lines.length ? lines.join("\n") : "*No alliances ranked yet.*",
    )
    .setTimestamp()
    .setFooter({ text: "Discore • Alliance Leaderboard" });
}

async function buildTopAlliancesRankEmbed() {
  const alliances = await getTopAlliances("officialRank", 15);
  const lines = alliances.map((a, i) => {
    const rankStr = a.officialRank ? `#${a.officialRank}` : "Unranked";
    const logoHint = a.logoUrl ? "" : "";
    return `${medal(i)} **${a.name} [${a.tag}]** | Rank: ${rankStr} | Elo: ${a.officialElo ?? "N/A"} | W/L: ${n(a.officialWins, "0")}/${n(a.officialLosses, "0")}`;
  });
  return new EmbedBuilder()
    .setColor(0x0f3460)
    .setTitle("📊 Top Alliances — Official Rank")
    .setDescription(
      lines.length ? lines.join("\n") : "*No alliances ranked yet.*",
    )
    .setTimestamp()
    .setFooter({ text: "Discore • Alliance Leaderboard" });
}

// ── MAP: type → builder ──────────────────────────────────────────────────────

const LEADERBOARD_BUILDERS = {
  TOP_PLAYERS_ELO: buildTopPlayersEloEmbed,
  TOP_PLAYERS_KD: buildTopPlayersKDEmbed,
  TOP_PLAYERS_WINS: buildTopPlayersWinsEmbed,
  TOP_ALLIANCES_ELO: buildTopAlliancesEloEmbed,
  TOP_ALLIANCES_WINS: buildTopAlliancesWinsEmbed,
  TOP_ALLIANCES_RANK: buildTopAlliancesRankEmbed,
};

async function buildLeaderboardEmbed(type) {
  const builder = LEADERBOARD_BUILDERS[type];
  if (!builder) throw new Error(`Unknown leaderboard type: ${type}`);
  return builder();
}

// ── CHANNEL POSTING ──────────────────────────────────────────────────────────

async function postOrUpdateLeaderboard(client, channelRecord) {
  const channel = await client.channels
    .fetch(channelRecord.channelId)
    .catch(() => null);
  if (!channel?.isTextBased()) return;

  const embed = await buildLeaderboardEmbed(channelRecord.type);

  // Try to edit existing pinned message, else send new
  if (channelRecord.messageId) {
    const existing = await channel.messages
      .fetch(channelRecord.messageId)
      .catch(() => null);
    if (existing?.editable) {
      await existing.edit({ embeds: [embed] });
      return;
    }
  }

  const msg = await channel.send({ embeds: [embed] });
  await prisma.leaderboardChannel.update({
    where: { id: channelRecord.id },
    data: { messageId: msg.id },
  });
}

module.exports = {
  buildLeaderboardEmbed,
  postOrUpdateLeaderboard,
  LEADERBOARD_BUILDERS,
};
