"use strict";

/**
 * Supported Games Configuration
 * This file contains all metadata for games supported by Discore AI
 */

module.exports = {
  supremacy_ww3: {
    displayName: "Supremacy: World War 3",
    oldNames: ["Conflict of Nations", "Conflict of Nations: World War 3"],
    aliases: [
      "supremacy ww3",
      "supremacy world war 3",
      "conflict of nations",
      "conflict of nations world war 3",
      "con",
      "con ww3",
      "ww3",
      "world war 3",
    ],
    wikiApi: "https://conflictnations.fandom.com/api.php",
    wikiSourceName: "Conflict of Nations Wiki",
    scenarios: [
      { key: "world_war_iii", name: "World War III", type: "public" },
      {
        key: "world_war_iii_apocalypse",
        name: "World War III (Apocalypse)",
        type: "public",
      },
      { key: "flashpoint_europe", name: "Flashpoint Europe", type: "public" },
      {
        key: "rising_tides_2060",
        name: "Rising Tides (2060)",
        type: "public_event",
      },
      { key: "overkill", name: "Overkill", type: "public" },
      { key: "battleground_usa", name: "Battleground USA", type: "public" },
      { key: "sengoku", name: "Sengoku", type: "public" },
      {
        key: "mediterranean_theatre",
        name: "Mediterranean Theatre",
        type: "alliance",
      },
      { key: "malta", name: "Malta", type: "alliance" },
      {
        key: "world_war_iii_elite",
        name: "World War III (Elite)",
        type: "alliance",
      },
      { key: "antarctica", name: "Antarctica", type: "alliance" },
      { key: "custom", name: "Custom / Other", type: "custom" },
    ],
    speeds: [
      { key: "1x", name: "Standard / 1x" },
      { key: "4x", name: "4x Speed" },
      { key: "10x", name: "10x Speed / Event" },
      { key: "custom", name: "Custom / Unknown" },
    ],
  },

  call_of_war_1942: {
    displayName: "Supremacy: Call of War 1942",
    oldNames: ["Call of War", "Call of War 1942"],
    aliases: [
      "call of war",
      "call of war 1942",
      "supremacy call of war",
      "supremacy call of war 1942",
      "cow",
    ],
    wikiApi: "https://call-of-war-by-bytro.fandom.com/api.php",
    wikiSourceName: "Call of War Wiki",
    scenarios: [
      {
        key: "clash_of_nations",
        name: "Clash of Nations",
        type: "standard",
        players: 22,
      },
      { key: "blitzkrieg", name: "Blitzkrieg", type: "standard", players: 10 },
      {
        key: "world_at_war",
        name: "World at War",
        type: "standard",
        players: 100,
      },
      {
        key: "all_countries_all_in",
        name: "All Countries: All In",
        type: "rotating_event",
      },
      {
        key: "historical_world_war",
        name: "Historical World War",
        type: "scenario",
      },
      {
        key: "europe_road_to_war",
        name: "Europe: Road to War",
        type: "scenario",
      },
      { key: "pacific_conquest", name: "Pacific Conquest", type: "scenario" },
      {
        key: "homeland",
        name: "Homeland / Regional Map",
        type: "scenario",
      },
      { key: "team_game", name: "Team Game", type: "modifier" },
      { key: "anonymous_round", name: "Anonymous Round", type: "modifier" },
      { key: "custom", name: "Custom / Other", type: "custom" },
    ],
    speeds: [
      { key: "1x", name: "Standard / 1x" },
      { key: "2x", name: "2x Speed / Event" },
      { key: "4x", name: "4x Speed / Event" },
      { key: "6x", name: "6x Speed / Event" },
      { key: "8x", name: "8x Speed / Event" },
      { key: "10x", name: "10x Speed / Event" },
      { key: "custom", name: "Custom / Unknown" },
    ],
  },

  supremacy_1914: {
    displayName: "Supremacy 1914",
    aliases: ["supremacy 1914", "s1914", "sup 1914", "supremacy"],
    wikiApi: "https://supremacy1914.fandom.com/api.php",
    wikiSourceName: "Supremacy 1914 Wiki",
    scenarios: [
      {
        key: "europe_1914",
        name: "Europe 1914",
        type: "scenario",
        players: 10,
      },
      {
        key: "the_great_war",
        name: "The Great War",
        type: "scenario",
        players: 31,
      },
      {
        key: "shattered_america",
        name: "Shattered America",
        type: "scenario",
        players: 43,
      },
      {
        key: "world_in_flames",
        name: "World in Flames",
        type: "scenario",
        players: 100,
      },
      {
        key: "the_great_war_500",
        name: "The Great War 500 Players",
        type: "scenario",
        players: 500,
      },
      {
        key: "tutorial",
        name: "Tutorial / Starter Map",
        type: "tutorial",
      },
      { key: "speed_event", name: "Speed Event", type: "event" },
      { key: "custom", name: "Custom / Other", type: "custom" },
    ],
    speeds: [
      { key: "1x", name: "Standard / 1x" },
      { key: "4x", name: "4x Speed / Event" },
      { key: "custom", name: "Custom / Unknown" },
    ],
  },

  iron_order_1919: {
    displayName: "Iron Order 1919",
    aliases: ["iron order", "iron order 1919", "io1919", "io"],
    wikiApi: "https://ironorder1919.fandom.com/api.php",
    wikiSourceName: "Iron Order 1919 Wiki",
    scenarios: [
      { key: "europe", name: "Europe", type: "scenario" },
      { key: "the_americas", name: "The Americas", type: "scenario" },
      { key: "divided_states", name: "Divided States", type: "scenario" },
      { key: "world_map", name: "World Map", type: "scenario" },
      {
        key: "the_americas_free_for_all",
        name: "The Americas Free For All",
        type: "event",
      },
      { key: "gold_rush", name: "Gold Rush", type: "event" },
      { key: "speed_round", name: "Speed Round", type: "event" },
      { key: "custom", name: "Custom / Other", type: "custom" },
    ],
    speeds: [
      { key: "1x", name: "Standard / 1x" },
      { key: "2x", name: "2x Speed / Event" },
      { key: "4x", name: "4x Speed / Event" },
      { key: "custom", name: "Custom / Unknown" },
    ],
  },
};
