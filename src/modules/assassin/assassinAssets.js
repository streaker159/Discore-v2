"use strict";

const path = require("path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const logger = require("../../lib/logger");

const ASSETS_DIR = path.join(process.cwd(), "assets", "assassin");

const SIGN_ON_PATH = path.join(ASSETS_DIR, "sign on.png");
const GAME_STARTED_PATH = path.join(ASSETS_DIR, "game started.png");
const ELIMINATED_PATH = path.join(ASSETS_DIR, "assassin eliminated.png");
const CHAMPION_PATH = path.join(ASSETS_DIR, "assassin champion.png");
const TARGET_SURVIVED_PATH = path.join(ASSETS_DIR, "target survived.png");

/**
 * Helper: Download a user's avatar as a Buffer.
 * @param {string} avatarUrl — Discord avatar URL (e.g. https://cdn.discordapp.com/avatars/...)
 * @returns {Promise<Buffer|null>}
 */
async function fetchAvatar(avatarUrl) {
  try {
    const res = await fetch(avatarUrl);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

/**
 * Composite a circular avatar onto a base image and return a Buffer (PNG).
 *
 * @param {string} baseImagePath — path to the base PNG card
 * @param {string} avatarUrl — Discord avatar URL
 * @returns {Promise<Buffer|null>}
 */
async function compositeAvatarOverlay(baseImagePath, avatarUrl) {
  try {
    const baseImg = await loadImage(baseImagePath);
    const canvas = createCanvas(baseImg.width, baseImg.height);
    const ctx = canvas.getContext("2d");

    // Draw the base card
    ctx.drawImage(baseImg, 0, 0, baseImg.width, baseImg.height);

    // Fetch the avatar
    const avatarBuf = await fetchAvatar(avatarUrl);
    if (!avatarBuf) {
      // Return base image without overlay if avatar fetch fails
      return canvas.toBuffer("image/png");
    }

    const avatarImg = await loadImage(avatarBuf);

    // Circular crop constants (center of the card, scaled relative to card width)
    const cardW = baseImg.width;
    const cardH = baseImg.height;

    // Circle parameters — positioned at approximately center-upper area of card
    // These values should be adjusted once the actual PNG dimensions are known.
    // For a typical 800×600 card, the avatar circle is around center at y≈35%
    const cx = cardW * 0.5;
    const cy = cardH * 0.35;
    const radius = cardW * 0.12; // ~96px radius on 800px wide card

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();

    // Draw avatar scaled to fill the circle
    const avatarSize = radius * 2;
    ctx.drawImage(avatarImg, cx - radius, cy - radius, avatarSize, avatarSize);

    ctx.restore();

    return canvas.toBuffer("image/png");
  } catch (e) {
    logger.error("[Assassin] Failed to composite avatar overlay", {
      error: e.message,
    });
    return null;
  }
}

/**
 * Get attachment for the sign-on card (no avatar).
 */
function getSignOnAttachment() {
  return { attachment: SIGN_ON_PATH, name: "sign_on.png" };
}

/**
 * Get attachment for the game started card (no avatar).
 */
function getGameStartedAttachment() {
  return { attachment: GAME_STARTED_PATH, name: "game_started.png" };
}

/**
 * Get attachment for the eliminated card with the eliminated player's avatar overlaid.
 * @param {string} avatarUrl
 * @returns {Promise<{attachment: Buffer, name: string}|null>}
 */
async function getEliminatedAttachment(avatarUrl) {
  const buf = await compositeAvatarOverlay(ELIMINATED_PATH, avatarUrl);
  if (!buf) return null;
  return { attachment: buf, name: "assassin_eliminated.png" };
}

/**
 * Get attachment for the champion card with the winner's avatar overlaid.
 * @param {string} avatarUrl
 * @returns {Promise<{attachment: Buffer, name: string}|null>}
 */
async function getChampionAttachment(avatarUrl) {
  const buf = await compositeAvatarOverlay(CHAMPION_PATH, avatarUrl);
  if (!buf) return null;
  return { attachment: buf, name: "assassin_champion.png" };
}

/**
 * Get attachment for the target survived card with the target's avatar overlaid.
 * @param {string} avatarUrl
 * @returns {Promise<{attachment: Buffer, name: string}|null>}
 */
async function getTargetSurvivedAttachment(avatarUrl) {
  const buf = await compositeAvatarOverlay(TARGET_SURVIVED_PATH, avatarUrl);
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
};
