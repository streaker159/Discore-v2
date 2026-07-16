"use strict";

const { EmbedBuilder } = require("discord.js");

/**
 * Build a nicely formatted embed for a Conflict of Nations player.
 * @param {object} player — responseData.result from getUserDetailsFirefly
 */
function buildPlayerEmbed(player) {
  const rank = player.rankProgress || {};
  const gameStats = player.gameStats || {};
  const gameScore = gameStats.gameStatsScore || {};
  const combatPvP = gameStats.combatScores || {};
  const combatAI = gameStats.combatScoresAI || {};
  const awards = player.awardProgress || {};
  const scenarios = player.scenarioStats || [];

  // ── Calculations ──────────────────────────────────────────────────
  const pvpKilled = Object.values(combatPvP).reduce(
    (sum, s) => sum + (s.defeated || 0),
    0,
  );
  const pvpLost = Object.values(combatPvP).reduce(
    (sum, s) => sum + (s.casualty || 0),
    0,
  );
  const aiKilled = Object.values(combatAI).reduce(
    (sum, s) => sum + (s.defeated || 0),
    0,
  );
  const aiLost = Object.values(combatAI).reduce(
    (sum, s) => sum + (s.casualty || 0),
    0,
  );
  const kdRatio =
    pvpLost > 0
      ? (pvpKilled / pvpLost).toFixed(2)
      : pvpKilled > 0
        ? pvpKilled.toFixed(2)
        : "0.00";

  const awardsCompleted = Object.values(awards).filter(
    (a) => a.finished === 1,
  ).length;
  const awardsInProgress = Object.values(awards).filter(
    (a) => a.finished !== 1,
  ).length;

  const regDate = player.regTstamp
    ? new Date(player.regTstamp * 1000).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
      })
    : "?";

  const scenarioLines = scenarios
    .map((s) => `Scenario ${s.scenarioID}: ${s.gameCount} games`)
    .join("\n");

  // ── Build embed ───────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(0x1a7a9e)
    .setTitle(`🎖️ ${player.username}`)
    .setDescription(`-# ID: ${player.id} · Registered: ${regDate}`)
    .addFields(
      // ── Ranks & Scores ──────────────────────────────────────
      {
        name: "━━ RANKS & SCORES ━━",
        value: [
          `⭐ **Rank Level** — ${rank.currentRankLevel ?? "?"}`,
          `🎯 **Overall** — #${Number(rank.globalRank).toLocaleString()} (${rank.overallScore ?? 0})`,
          `⚔️ **Military** — #${Number(rank.militaryRank).toLocaleString()} (${rank.militaryScore ?? 0})`,
          `🏗️ **Economic** — #${Number(rank.economicRank).toLocaleString()} (${rank.economicScore ?? 0})`,
        ].join("\n"),
        inline: false,
      },
      // ── Games ───────────────────────────────────────────────
      {
        name: "━━ GAMES ━━",
        value: [
          `🎮 **Joined** — ${gameScore.gameJoin ?? 0}`,
          `🏆 **Solo Wins** — ${gameScore.soloVictory ?? 0}`,
          `🤝 **Coalition Wins** — ${gameScore.coalitionVictory ?? 0}`,
          scenarioLines ? `\n**Scenarios:**\n${scenarioLines}` : "",
        ].join("\n"),
        inline: false,
      },
      // ── Territory ───────────────────────────────────────────
      {
        name: "━━ TERRITORY ━━",
        value: [
          `🟢 **Captured** — ${gameScore.provinceCaptured ?? 0}`,
          `🔴 **Lost** — ${gameScore.provinceLost ?? 0}`,
        ].join("\n"),
        inline: true,
      },
      // ── Combat PvP ──────────────────────────────────────────
      {
        name: "━━ COMBAT (PvP) ━━",
        value: [
          `✅ **Killed** — ${pvpKilled}`,
          `❌ **Lost** — ${pvpLost}`,
          `⚖️ **K/D Ratio** — ${kdRatio}`,
        ].join("\n"),
        inline: true,
      },
      // ── Combat AI ───────────────────────────────────────────
      {
        name: "━━ COMBAT (AI) ━━",
        value: [`✅ **Killed** — ${aiKilled}`, `❌ **Lost** — ${aiLost}`].join(
          "\n",
        ),
        inline: true,
      },
      // ── Awards ──────────────────────────────────────────────
      {
        name: "━━ AWARDS ━━",
        value: [
          `🎖️ **Completed** — ${awardsCompleted}`,
          `⏳ **In Progress** — ${awardsInProgress}`,
          `📋 **Total** — ${awardsCompleted + awardsInProgress}`,
        ].join("\n"),
        inline: false,
      },
    )
    .setFooter({
      text: "Discore Player Lookup · Conflict of Nations",
    })
    .setTimestamp();

  return embed;
}

module.exports = { buildPlayerEmbed };
