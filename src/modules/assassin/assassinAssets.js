"use strict";

const path = require("path");
const { getCanvasModule, loadImage } = require("../xp/canvasUtils");
const logger = require("../../lib/logger");

const canvasModule = getCanvasModule();
const ASSETS_DIR = path.join(process.cwd(), "assets", "assassin");

const SIGN_ON_PATH = path.join(ASSETS_DIR, "sign on.png");
const GAME_STARTED_PATH = path.join(ASSETS_DIR, "game started.png");
const ELIMINATED_PATH = path.join(ASSETS_DIR, "assassin eliminated.png");
const CHAMPION_PATH = path.join(ASSETS_DIR, "assassin champion.png");
const TARGET_SURVIVED_PATH = path.join(ASSETS_DIR, "target survived.png");

/**
 * Per-card avatar circle configuration.
 *
 * Each card has a pre-designed circular cutout. These values define the
 * circle's center (cx, cy) and radius in pixels relative to the card's
 * actual rendered dimensions.
 *
 * ⚠️ ADJUST THESE ONCE THE ACTUAL PNG DIMENSIONS ARE KNOWN.
 *    Load each PNG and measure the circle's position and size.
 */
const CIRCLE_CONFIGS = {
  eliminated: { cxRatio: 0.5, cyRatio: 0.35, radiusRatio: 0.12 },
  champion: { cxRatio: 0.5, cyRatio: 0.35, radiusRatio: 0.12 },
  targetSurvived: { cxRatio: 0.5, cyRatio: 0.35, radiusRatio: 0.12 },
};

const RING_COLORS = {
  eliminated: "#ff4444", // Red ring for eliminated
  champion: "#ffd700", // Gold ring for champion
  targetSurvived: "#44ff44", // Green ring for survivor
};

/**
 * Composite a circular avatar onto a base card image with a colored ring border.
 *
 * Uses the project's cached loadImage() (5-minute TTL) to avoid repeated
 * network fetch + decode overhead for avatars.
 *
 * @param {string} baseImagePath — absolute path to the base PNG card
 * @param {string} avatarUrl — Discord avatar URL
 * @param {{ cxRatio: number, cyRatio: number, radiusRatio: number }} circle — position config
 * @param {string} ringColor — hex color for the circular border ring
 * @returns {Promise<Buffer|null>}
 */
async function compositeAvatarOverlay(
  baseImagePath,
  avatarUrl,
  circle,
  ringColor,
) {
  if (!canvasModule) return null;

  try {
    const baseImg = await loadImage(baseImagePath);
    if (!baseImg) return null;

    const { createCanvas } = canvasModule;
    const canvas = createCanvas(baseImg.width, baseImg.height);
    const ctx = canvas.getContext("2d");

    // Draw the base card
    ctx.drawImage(baseImg, 0, 0, baseImg.width, baseImg.height);

    // Calculate circle position
    const cardW = baseImg.width;
    const cardH = baseImg.height;
    const cx = cardW * circle.cxRatio;
    const cy = cardH * circle.cyRatio;
    const radius = cardW * circle.radiusRatio;

    // ── Avatar overlay ────────────────────────────────────────────
    if (avatarUrl) {
      const avatarImg = await loadImage(avatarUrl);
      if (avatarImg) {
        ctx.save();
        // Clip to circle
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // Draw avatar scaled to fill the circle exactly
        const size = radius * 2;
        ctx.drawImage(avatarImg, cx - radius, cy - radius, size, size);
        ctx.restore();
      }
    }

    // ── Colored ring border ────────────────────────────────────────
    if (ringColor) {
      ctx.save();
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = Math.max(3, radius * 0.06); // ~3px or 6% of radius
      ctx.beginPath();
      ctx.arc(cx, cy, radius + ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    return canvas.toBuffer("image/png");
  } catch (e) {
    logger.error("[Assassin] Failed to composite avatar overlay", {
      error: e.message,
    });
    return null;
  }
}

/**
 * Get attachment for the sign-on card (no avatar overlay needed).
 */
function getSignOnAttachment() {
  return { attachment: SIGN_ON_PATH, name: "sign_on.png" };
}

/**
 * Get attachment for the game started card (no avatar overlay needed).
 */
function getGameStartedAttachment() {
  return { attachment: GAME_STARTED_PATH, name: "game_started.png" };
}

/**
 * Get attachment for the eliminated card with the eliminated player's avatar.
 */
async function getEliminatedAttachment(avatarUrl) {
  const buf = await compositeAvatarOverlay(
    ELIMINATED_PATH,
    avatarUrl,
    CIRCLE_CONFIGS.eliminated,
    RING_COLORS.eliminated,
  );
  if (!buf) return null;
  return { attachment: buf, name: "assassin_eliminated.png" };
}

/**
 * Get attachment for the champion card with the winner's avatar.
 */
async function getChampionAttachment(avatarUrl) {
  const buf = await compositeAvatarOverlay(
    CHAMPION_PATH,
    avatarUrl,
    CIRCLE_CONFIGS.champion,
    RING_COLORS.champion,
  );
  if (!buf) return null;
  return { attachment: buf, name: "assassin_champion.png" };
}

/**
 * Get attachment for the target survived card with the target's avatar.
 */
async function getTargetSurvivedAttachment(avatarUrl) {
  const buf = await compositeAvatarOverlay(
    TARGET_SURVIVED_PATH,
    avatarUrl,
    CIRCLE_CONFIGS.targetSurvived,
    RING_COLORS.targetSurvived,
  );
  if (!buf) return null;
  return { attachment: buf, name: "target_survived.png" };
}

module.exports = {
  SIGN_ON_PATH,
  GAME_STARTED_PATH,
  ELIMINATED_PATH,
  CHAMPION_PATH,
  TARGET_SURVIVED_PATH,
  getSignOnAttachment,
  getGameStartedAttachment,
  getEliminatedAttachment,
  getChampionAttachment,
  getTargetSurvivedAttachment,
  // Export configs so they can be adjusted at runtime if needed
  CIRCLE_CONFIGS,
};
