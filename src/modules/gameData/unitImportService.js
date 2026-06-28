"use strict";

const { parsePage, queryCategoryMembers, parseMultiplePages, sleep } = require("./mediaWikiClient");
const { getWikiSource } = require("./wikiSources");
const { parseUnitTables, extractUnitLinks, buildUnitObject, computeConfidence } = require("./unitImportParser");
const repo = require("./unitRepository");
const logger = require("../../lib/logger");

async function syncGame(gameKey) {
  const src = getWikiSource(gameKey);
  if (!src) return { ok: false, error: `No wiki source for ${gameKey}` };
  const { apiUrl, targetPage, requestDelayMs, timeoutMs, maxPagesPerSync, sourceName, unitCategories, unitLinkPatterns } = src;
  logger.info(`[UnitImport] Syncing ${src.game}`);

  let pagesScanned = 0, tablesFound = 0, draftCount = 0, lowConfidence = 0;
  const errors = [];

  try {
    // Step 1: Main Units page
    const main = await parsePage({ apiUrl, page: targetPage, timeoutMs });
    pagesScanned++;
    if (!main.ok) {
      await repo.updateDataSourceSync(gameKey, { lastError: main.error });
      return { ok: false, error: `Main page error: ${main.error}` };
    }

    // Parse tables from main page
    if (main.text) {
      const parsed = parseUnitTables(main.text, targetPage);
      tablesFound += parsed.tableCount;
      for (const table of parsed.tables) {
        for (const row of table.rows) {
          const u = buildUnitObject(row, targetPage, gameKey);
          if (!u) continue;
          const c = computeConfidence(u, true);
          await repo.createDraft({ game: src.game, gameKey, sourceUrl: apiUrl, sourceName, sourcePage: targetPage, rawExtract: JSON.stringify(row), parsedJson: u, confidence: c.level, warnings: c.warnings });
          draftCount++;
          if (c.level === "LOW") lowConfidence++;
        }
      }
    }

    // Step 2: Discover unit pages from links
    const unitLinks = extractUnitLinks(main.links || [], unitLinkPatterns);
    logger.info(`[UnitImport] Found ${unitLinks.length} unit pages via links`);

    if (unitLinks.length > 0) {
      await sleep(requestDelayMs);
      const subResults = await parseMultiplePages({ apiUrl, pages: unitLinks, delayMs: requestDelayMs, timeoutMs, maxPages: Math.min(maxPagesPerSync - pagesScanned, 50) });
      for (const sub of subResults) {
        pagesScanned++;
        if (!sub.ok) { errors.push(`${sub.page}: ${sub.error}`); continue; }
        if (sub.text) {
          const parsed = parseUnitTables(sub.text, sub.title);
          tablesFound += parsed.tableCount;
          if (parsed.tableCount > 0) {
            for (const table of parsed.tables) {
              for (const row of table.rows) {
                const u = buildUnitObject(row, sub.title, gameKey);
                if (!u) continue;
                const c = computeConfidence(u, true);
                await repo.createDraft({ game: src.game, gameKey, sourceUrl: apiUrl, sourceName, sourcePage: sub.title, rawExtract: JSON.stringify(row), parsedJson: u, confidence: c.level, warnings: c.warnings });
                draftCount++;
                if (c.level === "LOW") lowConfidence++;
              }
            }
          } else {
            const u = { name: sub.title, slug: sub.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), category: require("./unitImportParser").inferCategory(sub.title), stats: {}, cost: {}, research: {} };
            const c = computeConfidence(u, false);
            await repo.createDraft({ game: src.game, gameKey, sourceUrl: apiUrl, sourceName, sourcePage: sub.title, rawExtract: sub.text ? sub.text.slice(0, 5000) : "", parsedJson: u, confidence: c.level, warnings: c.warnings });
            draftCount++; lowConfidence++;
          }
        }
      }
    }

    // Step 3: Category members fallback
    for (const cat of unitCategories) {
      try {
        await sleep(requestDelayMs);
        const catR = await queryCategoryMembers({ apiUrl, category: cat, timeoutMs });
        if (catR.ok && catR.members.length > 0) {
          const cp = catR.members.filter((m) => m.title !== targetPage).map((m) => m.title);
          if (cp.length > 0) {
            const cr = await parseMultiplePages({ apiUrl, pages: cp, delayMs: requestDelayMs, timeoutMs, maxPages: Math.min(maxPagesPerSync - pagesScanned, 20) });
            for (const sub of cr) {
              pagesScanned++;
              if (!sub.ok) continue;
              if (sub.text) {
                const parsed = parseUnitTables(sub.text, sub.title);
                tablesFound += parsed.tableCount;
                if (parsed.tableCount > 0) {
                  for (const table of parsed.tables) {
                    for (const row of table.rows) {
                      const u = buildUnitObject(row, sub.title, gameKey);
                      if (!u) continue;
                      const c = computeConfidence(u, true);
                      await repo.createDraft({ game: src.game, gameKey, sourceUrl: apiUrl, sourceName, sourcePage: sub.title, rawExtract: JSON.stringify(row), parsedJson: u, confidence: c.level, warnings: c.warnings });
                      draftCount++;
                      if (c.level === "LOW") lowConfidence++;
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e) { logger.warn(`[UnitImport] Category ${cat}: ${e.message}`); }
    }

    await repo.updateDataSourceSync(gameKey, { lastSyncAt: new Date() });
    return { ok: true, game: src.game, source: `${sourceName} (MediaWiki API)`, pagesScanned, tablesFound, draftCount, lowConfidence, errors };
  } catch (err) {
    logger.error(`[UnitImport] Sync failed: ${err.message}`);
    await repo.updateDataSourceSync(gameKey, { lastError: err.message });
    return { ok: false, error: err.message };
  }
}

async function syncPage(gameKey, pageTitle) {
  const src = getWikiSource(gameKey);
  if (!src) return { ok: false, error: `No wiki source for ${gameKey}` };
  const { apiUrl, sourceName, timeoutMs } = src;
  let draftCount = 0, lowConfidence = 0;

  const result = await parsePage({ apiUrl, page: pageTitle, timeoutMs });
  if (!result.ok) return { ok: false, error: result.error };

  if (result.text) {
    const parsed = parseUnitTables(result.text, pageTitle);
    for (const table of parsed.tables) {
      for (const row of table.rows) {
        const u = buildUnitObject(row, pageTitle, gameKey);
        if (!u) continue;
        const c = computeConfidence(u, true);
        await repo.createDraft({ game: src.game, gameKey, sourceUrl: apiUrl, sourceName, sourcePage: pageTitle, rawExtract: JSON.stringify(row), parsedJson: u, confidence: c.level, warnings: c.warnings });
        draftCount++;
        if (c.level === "LOW") lowConfidence++;
      }
    }
  }

  return { ok: true, game: src.game, page: pageTitle, tableCount: parseUnitTables(result.text || "", pageTitle).tableCount, draftCount, lowConfidence };
}

async function approveDraft(draftId) {
  const draft = await repo.getDraftById(draftId);
  if (!draft) return { ok: false, error: "Draft not found" };
  if (draft.status !== "PENDING") return { ok: false, error: `Draft is already ${draft.status}` };

  const u = draft.parsedJson;
  if (!u || !u.name) return { ok: false, error: "No valid unit data in draft" };

  const existing = await repo.getUnitBySlug(draft.gameKey, u.slug);
  if (existing && existing.verified && existing.manuallyEdited) {
    return { ok: false, error: `Unit "${u.name}" exists and was manually edited. Review changes before overwriting.` };
  }

  const unit = await repo.upsertUnit({
    game: draft.game, gameKey: draft.gameKey, name: u.name, slug: u.slug,
    category: u.category, description: u.description || null,
    sourceUrl: draft.sourceUrl, sourceName: draft.sourceName, sourcePage: draft.sourcePage,
    verified: true,
  });

  await repo.clearVariants(unit.id);
  if (u.stats || u.cost) {
    const v = await repo.upsertVariant(unit.id, {
      hitPoints: u.stats?.hitPoints, speed: u.stats?.speed, range: u.stats?.range,
      sightRange: u.stats?.sightRange, radarRange: u.stats?.radarRange,
      stealthDetectionRange: u.stats?.stealthDetectionRange,
      tier: u.research?.tier, doctrine: u.research?.doctrine,
    });
    if (u.cost) {
      await repo.createCost(v.id, {
        supplies: u.cost.supplies, components: u.cost.components, manpower: u.cost.manpower,
        electronics: u.cost.electronics, fuel: u.cost.fuel, cash: u.cost.cash,
        rareMaterials: u.cost.rareMaterials, timeSeconds: u.cost.timeSeconds, rawTimeText: u.cost.rawTimeText,
      });
    }
  }

  await repo.approveDraft(draftId);
  return { ok: true, unit: u.name, message: `✅ Unit "${u.name}" verified in database.` };
}

async function getSyncStatus() {
  const sources = await repo.getAllDataSources();
  return Promise.all(sources.map(async (s) => ({
    game: s.game, gameKey: s.gameKey, sourceName: s.sourceName, sourceType: s.sourceType,
    apiUrl: s.apiUrl, lastSyncAt: s.lastSyncAt, lastError: s.lastError,
    draftsPending: await repo.countDrafts(s.gameKey, "PENDING"),
    verifiedUnits: await repo.countVerifiedUnits(s.gameKey),
  })));
}

async function initializeDataSources() {
  const { getAllSources } = require("./wikiSources");
  for (const s of getAllSources()) {
    await repo.upsertDataSource({
      game: s.game, gameKey: s.gameKey, sourceName: s.sourceName,
      apiUrl: s.apiUrl, targetPage: s.targetPage, sourceType: s.sourceType,
    });
  }
  logger.info(`[UnitImport] Initialized game data sources`);
}

module.exports = { syncGame, syncPage, approveDraft, getSyncStatus, initializeDataSources };
