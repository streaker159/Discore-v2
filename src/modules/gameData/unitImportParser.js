"use strict";

/**
 * Unit Import Parser
 *
 * Parses HTML content from MediaWiki API's action=parse response.
 * Extracts unit tables, names, stats, and assigns confidence scores.
 */

const cheerio = require("cheerio");

// Known table header patterns mapped to canonical field names
const HEADER_MAP = {
  unit: ["unit", "unit name", "name", "unit type"],
  name: ["name", "unit name", "unit"],
  hp: ["hp", "health", "hit points", "hitpoints", "hit point", "health points"],
  health: ["health", "hp", "hit points", "hitpoints", "health points"],
  damage: ["damage", "attack", "attack damage", "dmg", "offense", "offensive damage"],
  attack: ["attack", "damage", "attack damage", "offense", "offensive damage"],
  defense: ["defense", "defence", "defensive", "defensive damage", "armor", "armour"],
  speed: ["speed", "movement", "move speed", "movement speed", "velocity"],
  range: ["range", "attack range", "firing range", "weapon range", "engagement range"],
  sightRange: ["sight", "sight range", "vision", "vision range", "spotting", "spotting range", "view range"],
  radarRange: ["radar", "radar range", "radar signature", "detection", "detection range", "stealth detection"],
  supplies: ["supplies", "supply"],
  components: ["components", "component"],
  manpower: ["manpower", "manpower cost", "personnel", "troops"],
  electronics: ["electronics", "electronic"],
  fuel: ["fuel", "fuel cost", "oil"],
  cash: ["cash", "money", "money cost", "cost", "price"],
  rareMaterials: ["rare materials", "rare", "rare material", "rare mats", "uranium", "rarematerials"],
  time: ["time", "production time", "build time", "training time", "recruitment time", "research time"],
  research: ["research", "technology", "tech", "tech level", "required research"],
  tier: ["tier", "level", "generation", "gen"],
  doctrine: ["doctrine", "doctrines"],
  requirements: ["requirements", "required", "requires", "building required"],
  terrain: ["terrain", "terrain type", "environment", "terrain bonuses", "terrain penalty"],
};

function normalizeHeader(text) {
  if (!text) return null;
  const cleaned = text.toLowerCase().trim().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  for (const [key, aliases] of Object.entries(HEADER_MAP)) {
    if (aliases.includes(cleaned)) return key;
  }
  for (const [key, aliases] of Object.entries(HEADER_MAP)) {
    for (const alias of aliases) {
      if (cleaned.includes(alias) || alias.includes(cleaned)) return key;
    }
  }
  return cleaned;
}

function cleanCellText(text) {
  if (!text) return "";
  return text.replace(/\[\d+\]/g, "").replace(/\u00A0/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function parseNumber(text) {
  if (!text || typeof text !== "string") return null;
  const cleaned = text.replace(/[^0-9.\-]/g, "").trim();
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseTimeToSeconds(text) {
  if (!text) return null;
  const cleaned = text.toLowerCase().trim();
  let total = 0;
  const hourMatch = cleaned.match(/(\d+)\s*h/);
  if (hourMatch) total += parseInt(hourMatch[1], 10) * 3600;
  const minMatch = cleaned.match(/(\d+)\s*m(?!\s*[sa])/);
  if (minMatch) total += parseInt(minMatch[1], 10) * 60;
  const secMatch = cleaned.match(/(\d+)\s*s/);
  if (secMatch) total += parseInt(secMatch[1], 10);
  if (total > 0) return total;
  const dayMatch = cleaned.match(/(\d+)\s*d/);
  if (dayMatch) total += parseInt(dayMatch[1], 10) * 86400;
  const num = parseNumber(cleaned);
  return num;
}

function isUnitStatsTable($, table) {
  const hdrs = [];
  $(table).find("th").each((_, th) => { hdrs.push(cleanCellText($(th).text())); });
  const ht = hdrs.join(" ").toLowerCase();
  const kws = ["unit", "name", "hp", "health", "damage", "attack", "defense", "speed", "range", "cost", "supplies", "manpower", "research", "tier", "level"];
  return kws.filter((k) => ht.includes(k)).length >= 2;
}

function extractRowData($, row, headerMap) {
  const cells = $(row).find("td, th");
  const data = {};
  cells.each((i, cell) => {
    const key = headerMap[i];
    if (key) data[key] = cleanCellText($(cell).text());
  });
  return data;
}

function parseUnitTables(html, pageTitle = "") {
  const $ = cheerio.load(html);
  const tables = [];
  $("table").each((ti, table) => {
    if (!isUnitStatsTable($, table)) return;
    const rows = $(table).find("tr");
    if (rows.length < 2) return;
    const hdrs = [];
    $(rows[0]).find("th, td").each((_, c) => { hdrs.push(cleanCellText($(c).text())); });
    const hm = {};
    hdrs.forEach((h, i) => { hm[i] = normalizeHeader(h) || h; });
    const drs = [];
    rows.slice(1).each((_, row) => {
      const rd = extractRowData($, row, hm);
      if (Object.keys(rd).length > 0) drs.push(rd);
    });
    if (drs.length > 0) tables.push({ tableIndex: ti, headers: hdrs, headerMap: Object.values(hm), rowCount: drs.length, rows: drs });
  });
  return { pageTitle, tableCount: tables.length, tables, warnings: [] };
}

function extractUnitLinks(links, unitLinkPatterns = []) {
  if (!links || links.length === 0) return [];
  const unitPages = [];
  for (const link of links) {
    if (!link.exists) continue;
    if (link.title.startsWith("Category:") || link.title.startsWith("File:") || link.title.startsWith("Template:") || link.title.startsWith("Special:") || link.title.startsWith("Talk:") || link.title.startsWith("User:")) continue;
    if (link.title === "Units" || link.title === "Main Page") continue;
    if (unitLinkPatterns.length > 0) {
      if (!unitLinkPatterns.some((p) => p.test(link.title))) continue;
    }
    unitPages.push(link.title);
  }
  return [...new Set(unitPages)];
}

function inferCategory(pageTitle, categoryContext = "") {
  const lower = (pageTitle + " " + categoryContext).toLowerCase();
  if (/infantry|motorized|mechanized|rifle|militia/i.test(lower)) return "Infantry";
  if (/armored|tank|heavy tank|light tank|medium tank|main battle|afv/i.test(lower)) return "Armored";
  if (/artillery|howitzer|mortar|rocket launcher|spg|mlrs/i.test(lower)) return "Artillery";
  if (/fighter|interceptor|air superiority/i.test(lower)) return "Fighters";
  if (/bomber|stealth|strike aircraft/i.test(lower)) return "Bombers";
  if (/helicopter|heli|attack heli|gunship/i.test(lower)) return "Helicopters";
  if (/naval|ship|destroyer|cruiser|battleship|carrier|corvette|frigate/i.test(lower)) return "Naval";
  if (/submarine|sub/i.test(lower) && !/sub.*machine/i.test(lower)) return "Submarines";
  if (/missile|cruise|ballistic|icbm|nuke/i.test(lower)) return "Missiles";
  if (/officer|commander/i.test(lower)) return "Officers";
  if (/support|radar|recon|reconnaissance|transport/i.test(lower)) return "Support";
  if (/drone|uav|unmanned/i.test(lower)) return "Drones";
  if (/deployable|outpost|bunker|fortification/i.test(lower)) return "Deployables";
  if (/aircraft|plane|air/i.test(lower)) return "Aircraft";
  return "Other";
}

function extractUnitName(rowData) {
  return rowData.unit || rowData.name || rowData["unit name"] || rowData.type || "";
}

function buildUnitObject(rowData, pageTitle, gameKey) {
  const name = extractUnitName(rowData);
  if (!name) return null;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    name, slug,
    category: inferCategory(pageTitle, rowData.category || ""),
    stats: {
      hitPoints: parseNumber(rowData.hp || rowData.health || rowData["hit points"]),
      speed: parseNumber(rowData.speed),
      range: parseNumber(rowData.range),
      sightRange: parseNumber(rowData.sightRange || rowData.sight || rowData.vision),
      radarRange: parseNumber(rowData.radarRange || rowData.radar || rowData.detection),
      attack: parseNumber(rowData.attack || rowData.damage),
      defense: parseNumber(rowData.defense),
    },
    cost: {
      supplies: parseNumber(rowData.supplies) || 0,
      components: parseNumber(rowData.components) || 0,
      manpower: parseNumber(rowData.manpower) || 0,
      electronics: parseNumber(rowData.electronics) || 0,
      fuel: parseNumber(rowData.fuel) || 0,
      cash: parseNumber(rowData.cash || rowData.money || rowData.cost) || 0,
      rareMaterials: parseNumber(rowData.rareMaterials || rowData.rare) || 0,
      timeSeconds: parseTimeToSeconds(rowData.time),
      rawTimeText: rowData.time || null,
    },
    research: {
      tier: parseNumber(rowData.tier || rowData.level) || null,
      doctrine: rowData.doctrine || null,
    },
  };
}

function computeConfidence(unitObj, fromTable = false) {
  let score = 0;
  const warnings = [];
  if (!unitObj || !unitObj.name) return { level: "LOW", score: 0, warnings: ["Missing unit name"] };
  score += 10;
  if (unitObj.category) score += 5;
  const stats = unitObj.stats || {};
  const statFields = Object.values(stats).filter((v) => v !== null && v !== undefined);
  score += statFields.length * 10;
  const cost = unitObj.cost || {};
  const costFields = Object.values(cost).filter((v) => v !== null && v !== undefined);
  score += costFields.length * 3;
  if (fromTable) score += 15;
  if (unitObj.research?.tier) score += 5;
  let level;
  if (score >= 50) level = "HIGH";
  else if (score >= 25) level = "MEDIUM";
  else { level = "LOW"; warnings.push("Limited stats extracted"); }
  if (!fromTable) warnings.push("Extracted from text links, no stat table found");
  if (statFields.length < 2) warnings.push("Few stat fields found");
  return { level, score, warnings };
}

module.exports = {
  parseUnitTables, extractUnitLinks, inferCategory, extractUnitName,
  buildUnitObject, computeConfidence, normalizeHeader, cleanCellText,
  parseNumber, parseTimeToSeconds, isUnitStatsTable,
};