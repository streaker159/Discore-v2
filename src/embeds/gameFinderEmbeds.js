"use strict";

const { EmbedBuilder } = require("discord.js");

/**
 * Cinematic "search underway" embed shown after /findgame is invoked.
 */
function buildSearchingEmbed() {
  return new EmbedBuilder()
    .setColor(0xcc3333)
    .setTitle("🔍 Discore Game Finder Activated")
    .setDescription(
      "Scanning Conflict of Nations for a newly created **WORLD WAR 3 (4X SPEED)** match with open player slots.",
    )
    .addFields(
      { name: "🌍 Scenario", value: "World War 3", inline: true },
      { name: "⚡ Speed", value: "4×", inline: true },
      { name: "📡 Status", value: "Searching…", inline: true },
      { name: "⏱️ Maximum Duration", value: "30 minutes", inline: false },
    )
    .setFooter({
      text: "Discore is checking at controlled, randomized intervals.",
    })
    .setTimestamp();
}

/**
 * "Game found" embed — green success style.
 * @param {object} properties — game.properties from the API response
 */
function buildGameFoundEmbed(properties) {
  const maximumPlayers = Number(properties.nrofplayers) || 0;
  const openSlots = Number(properties.openSlots) || 0;
  const occupiedPlayers = Math.max(0, maximumPlayers - openSlots);

  return new EmbedBuilder()
    .setColor(0x3ba55d)
    .setTitle("🎯 NEW GAME FOUND")
    .setDescription(
      [
        "**WORLD WAR 3 (4X SPEED)**",
        "",
        "A new joinable match has been detected.",
        "The search has stopped automatically.",
      ].join("\n"),
    )
    .addFields(
      {
        name: "🎮 Game ID",
        value: `\`${properties.gameID}\``,
        inline: false,
      },
      {
        name: "⚡ Speed",
        value: "4×",
        inline: true,
      },
      {
        name: "📅 Game Day",
        value: String(properties.dayofgame ?? "?"),
        inline: true,
      },
      {
        name: "🚪 Open Slots",
        value: String(openSlots),
        inline: true,
      },
      {
        name: "👥 Players",
        value: `${occupiedPlayers}/${maximumPlayers}`,
        inline: true,
      },
      {
        name: "🏆 Ranked",
        value: properties.ranked === "1" ? "Yes" : "No",
        inline: true,
      },
      {
        name: "🛡️ Anti-Cheat",
        value: properties.anticheatset === "yes" ? "Enabled" : "Disabled",
        inline: true,
      },
    )
    .setFooter({
      text: "Discore Game Finder • Search completed",
    })
    .setTimestamp();
}

/**
 * Timeout embed — no match found within 10 minutes.
 */
function buildTimeoutEmbed() {
  return new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("⏰ Search Expired")
    .setDescription(
      [
        "No new **WORLD WAR 3 (4X SPEED)** match appeared within the 30‑minute search window.",
        "",
        "You can run `/findgame` again to restart the search.",
      ].join("\n"),
    )
    .setFooter({
      text: "Discore Game Finder • Timed out",
    })
    .setTimestamp();
}

/**
 * Manual stop embed.
 */
function buildStoppedEmbed() {
  return new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle("🛑 Search Stopped")
    .setDescription("The game finder has been stopped manually.")
    .setFooter({
      text: "Discore Game Finder • Stopped",
    })
    .setTimestamp();
}

/**
 * Generic error embed.
 * @param {string} message
 */
function buildErrorEmbed(message) {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("❌ Search Error")
    .setDescription(
      `An error occurred while searching for a game:\n\n> ${message}`,
    )
    .setFooter({
      text: "Discore Game Finder • Error",
    })
    .setTimestamp();
}

module.exports = {
  buildSearchingEmbed,
  buildGameFoundEmbed,
  buildTimeoutEmbed,
  buildStoppedEmbed,
  buildErrorEmbed,
};
