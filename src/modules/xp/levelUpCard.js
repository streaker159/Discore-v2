"use strict";

/**
 * Level-up card generator
 * Creates a dark-themed card with avatar, "Level-up!" text, and level numbers
 * Uses @napi-rs/canvas for image generation.
 * Falls back to returning null if canvas is unavailable.
 */

let canvasModule = null;
try {
  canvasModule = require("@napi-rs/canvas");
} catch {
  // Canvas not available - all functions will return null
}

/**
 * Load an image from a URL into a canvas Image
 * @param {string} url
 * @returns {Promise<import('@napi-rs/canvas').Image|null>}
 */
async function loadImage(url) {
  if (!canvasModule || !url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return new canvasModule.Image(Buffer.from(buffer));
  } catch {
    return null;
  }
}

/**
 * Create a level-up announcement card
 * @param {object} opts
 * @param {string} opts.avatarUrl - User avatar URL
 * @param {number} opts.oldLevel - Previous level
 * @param {number} opts.newLevel - New level
 * @param {string} opts.displayName - User display name
 * @returns {Promise<Buffer|null>} PNG buffer or null on failure
 */
async function createLevelUpCard({
  avatarUrl,
  oldLevel,
  newLevel,
  displayName,
}) {
  if (!canvasModule) return null;

  try {
    const { createCanvas, GlobalFonts } = canvasModule;

    const width = 500;
    const height = 150;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Background - dark gradient
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, "#0d1b2a");
    bgGradient.addColorStop(1, "#1b2838");
    ctx.fillStyle = bgGradient;
    roundRect(ctx, 0, 0, width, height, 16);
    ctx.fill();

    // Cyan accent line at top
    ctx.fillStyle = "#00cccc";
    roundRect(ctx, 0, 0, width, 4, 16);
    ctx.fill();

    // Avatar circle
    const avatarSize = 80;
    const avatarX = 40;
    const avatarY = (height - avatarSize) / 2;

    if (avatarUrl) {
      const avatarImg = await loadImage(avatarUrl);
      if (avatarImg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(
          avatarX + avatarSize / 2,
          avatarY + avatarSize / 2,
          avatarSize / 2,
          0,
          Math.PI * 2,
        );
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
      }
    }

    // Avatar border
    ctx.strokeStyle = "#00cccc";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      avatarX + avatarSize / 2,
      avatarY + avatarSize / 2,
      avatarSize / 2,
      0,
      Math.PI * 2,
    );
    ctx.stroke();

    // "Level-up!" text
    const textX = avatarX + avatarSize + 30;
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
    ctx.fillText("Level-up!", textX, 55);

    // Display name
    ctx.fillStyle = "#aabbcc";
    ctx.font = '14px "Segoe UI", Arial, sans-serif';
    const name = displayName || "Player";
    ctx.fillText(name.substring(0, 30), textX, 78);

    // Level numbers: "7 • 8"
    ctx.fillStyle = "#00cccc";
    ctx.font = 'bold 40px "Segoe UI", Arial, sans-serif';
    const levelText = `${oldLevel}  •  ${newLevel}`;
    ctx.fillText(levelText, textX, 130);

    // Small golden accent dot
    ctx.fillStyle = "#ccaa00";
    ctx.beginPath();
    ctx.arc(width - 20, 20, 6, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toBuffer("image/png");
  } catch (err) {
    console.error("[LevelUpCard] Generation error:", err.message);
    return null;
  }
}

/**
 * Helper: draw rounded rectangle
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

module.exports = { createLevelUpCard, loadImage, roundRect };
