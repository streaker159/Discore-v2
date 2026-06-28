"use strict";

const prisma = require("../../lib/prisma");

// ─── GameDataSource ───────────────────────────────────────────

async function upsertDataSource({ game, gameKey, sourceName, apiUrl, targetPage, sourceType }) {
  return prisma.gameDataSource.upsert({
    where: { gameKey },
    update: { game, sourceName, apiUrl, targetPage, sourceType: sourceType || "MEDIAWIKI_API" },
    create: { game, gameKey, sourceName, apiUrl, targetPage, sourceType: sourceType || "MEDIAWIKI_API" },
  });
}

async function updateDataSourceSync(gameKey, { lastSyncAt, lastError }) {
  const existing = await prisma.gameDataSource.findUnique({ where: { gameKey } });
  if (!existing) {
    // Create if not exists (init might not have been run yet)
    return prisma.gameDataSource.create({
      data: { game: gameKey, gameKey, sourceName: gameKey, apiUrl: "", targetPage: "Units", lastSyncAt: lastSyncAt || new Date(), lastError: lastError || null },
    });
  }
  return prisma.gameDataSource.update({
    where: { gameKey },
    data: { lastSyncAt: lastSyncAt || new Date(), lastError: lastError || null },
  });
}

async function getDataSource(gameKey) {
  return prisma.gameDataSource.findUnique({ where: { gameKey } });
}

async function getAllDataSources() {
  return prisma.gameDataSource.findMany({ orderBy: { game: "asc" } });
}

// ─── GameUnit ─────────────────────────────────────────────────

async function upsertUnit({ game, gameKey, name, slug, category, description, sourceUrl, sourceName, sourcePage, verified }) {
  return prisma.gameUnit.upsert({
    where: { gameKey_slug: { gameKey, slug } },
    update: {
      name, category, description, sourceUrl, sourceName, sourcePage,
      sourceLastSyncedAt: new Date(),
      ...(verified ? { verified } : {}),
    },
    create: {
      game, gameKey, name, slug, category, description, sourceUrl, sourceName, sourcePage,
      sourceLastSyncedAt: new Date(), verified: verified || false,
    },
  });
}

async function getUnitById(id) {
  return prisma.gameUnit.findUnique({
    where: { id },
    include: { variants: { include: { costs: true, upkeep: true, terrainStats: true } }, features: true },
  });
}

async function getUnitBySlug(gameKey, slug) {
  return prisma.gameUnit.findUnique({
    where: { gameKey_slug: { gameKey, slug } },
    include: { variants: { include: { costs: true, upkeep: true, terrainStats: true } }, features: true },
  });
}

async function searchUnits(gameKey, query) {
  return prisma.gameUnit.findMany({
    where: {
      gameKey,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { category: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ],
    },
    include: { variants: { include: { costs: true, upkeep: true, terrainStats: true } }, features: true },
    take: 25,
  });
}

async function getAllVerifiedUnits(gameKey) {
  return prisma.gameUnit.findMany({
    where: { gameKey, verified: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

async function countVerifiedUnits(gameKey) {
  return prisma.gameUnit.count({ where: { gameKey, verified: true } });
}

// ─── GameUnitVariant ──────────────────────────────────────────

async function upsertVariant(unitId, data) {
  return prisma.gameUnitVariant.create({ data: { unitId, ...data } });
}

async function clearVariants(unitId) {
  await prisma.gameUnitVariant.deleteMany({ where: { unitId } });
}

// ─── GameUnitCost ─────────────────────────────────────────────

async function createCost(variantId, data) {
  return prisma.gameUnitCost.create({ data: { variantId, ...data } });
}

// ─── GameUnitFeature ──────────────────────────────────────────

async function upsertFeature(unitId, variantId, data) {
  return prisma.gameUnitFeature.create({ data: { unitId, variantId, ...data } });
}

async function clearFeatures(unitId) {
  await prisma.gameUnitFeature.deleteMany({ where: { unitId } });
}

// ─── GameUnitImportDraft ──────────────────────────────────────

async function createDraft(data) {
  return prisma.gameUnitImportDraft.create({ data: { ...data, status: "PENDING" } });
}

async function getDrafts(gameKey, status = "PENDING") {
  return prisma.gameUnitImportDraft.findMany({
    where: { gameKey, status },
    orderBy: { createdAt: "desc" },
  });
}

async function getAllDrafts(status = "PENDING") {
  return prisma.gameUnitImportDraft.findMany({
    where: { status },
    orderBy: [{ game: "asc" }, { createdAt: "desc" }],
  });
}

async function countDrafts(gameKey, status = "PENDING") {
  return prisma.gameUnitImportDraft.count({ where: { gameKey, status } });
}

async function approveDraft(draftId) {
  return prisma.gameUnitImportDraft.update({ where: { id: draftId }, data: { status: "APPROVED" } });
}

async function rejectDraft(draftId) {
  return prisma.gameUnitImportDraft.update({ where: { id: draftId }, data: { status: "REJECTED" } });
}

async function getDraftById(id) {
  return prisma.gameUnitImportDraft.findUnique({ where: { id } });
}

async function deleteOldDrafts(gameKey, olderThanDays = 30) {
  const cutoff = new Date(Date.now() - olderThanDays * 86400000);
  return prisma.gameUnitImportDraft.deleteMany({
    where: { gameKey, status: "REJECTED", createdAt: { lt: cutoff } },
  });
}

module.exports = {
  upsertDataSource, updateDataSourceSync, getDataSource, getAllDataSources,
  upsertUnit, getUnitById, getUnitBySlug, searchUnits, getAllVerifiedUnits, countVerifiedUnits,
  upsertVariant, clearVariants, createCost,
  upsertFeature, clearFeatures,
  createDraft, getDrafts, getAllDrafts, countDrafts, approveDraft, rejectDraft, getDraftById, deleteOldDrafts,
};