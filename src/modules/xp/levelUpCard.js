"use strict";

/**
 * Level-up card generator — Discore Gold Edition
 * Dark navy background, gold accents, circular avatar with gold ring,
 * "Level-up!" heading, display name, and oldLevel • newLevel.
 * Uses @napi-rs/canvas. Falls back to null if canvas is unavailable.
 */

const { getCanvasModule, loadImage, roundRect } = require("./canvasUtils");

const canvasModule = getCanvasModule();

const COLORS = {
  bgDark: "#101820",
  panel: "#18212b",
  gold: "#d4af37",
  goldBright: "#f5c542",
  white: "#ffffff",
  muted: "#c7c7c7",
};

/**
 * Create a level-up announcement card
 * @param {object} opts
 * @param {string} opts.avatarUrl - PNG/static avatar URL (forceStatic: true, extension: "png")
 * @param {number} opts.oldLevel
 * @param {number} opts.newLevel
 * @param {string} opts.displayName
 * @returns {Promise<Buffer|null>} PNG buffer or null
 */
async function createLevelUpCard({
  avatarUrl,
  oldLevel,
  newLevel,
  displayName,
}) {
  if (!canvasModule) return null;

  try {
    const { createCanvas } = canvasModule;

    const width = 700;
    const height = 220;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // ── Background ──────────────────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, COLORS.bgDark);
    bgGrad.addColorStop(0.6, "#0e1620");
    bgGrad.addColorStop(1, COLORS.panel);
    ctx.fillStyle = bgGrad;
    roundRect(ctx, 0, 0, width, height, 18);
    ctx.fill();

    // ── Top gold accent bar ─────────────────────────────────────────
    ctx.fillStyle = COLORS.gold;
    roundRect(ctx, 0, 0, width, 5, 18);
    ctx.fill();

    // ── Subtle angled gold shape bottom-right ───────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(width - 180, height);
    ctx.lineTo(width, height);
    ctx.lineTo(width, height - 80);
    ctx.closePath();
    ctx.fillStyle = COLORS.gold;
    ctx.globalAlpha = 0.06;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── Avatar ──────────────────────────────────────────────────────
    const avatarSize = 100;
    const avatarX = 45;
    const avatarY = (height - avatarSize) / 2;
    const avatarCenterX = avatarX + avatarSize / 2;
    const avatarCenterY = avatarY + avatarSize / 2;

    // Default placeholder if no avatar
    let avatarDrawn = false;
    if (avatarUrl) {
      const avatarImg = await loadImage(avatarUrl);
      if (avatarImg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
        avatarDrawn = true;
      }
    }

    // Fallback: gold circle with first letter
    if (!avatarDrawn) {
      ctx.fillStyle = COLORS.panel;
      ctx.beginPath();
      ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();

      const initial = (displayName || "P").charAt(0).toUpperCase();
      ctx.fillStyle = COLORS.gold;
      ctx.font = 'bold 40px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initial, avatarCenterX, avatarCenterY);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }

    // ── Gold avatar ring ────────────────────────────────────────────
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2 + 3, 0, Math.PI * 2);
    ctx.stroke();

    // ── Text area ───────────────────────────────────────────────────
    const textX = avatarX + avatarSize + 35;

    // "Level-up!" heading — gold gradient
    const headingGrad = ctx.createLinearGradient(textX, 0, textX + 200, 0);
    headingGrad.addColorStop(0, COLORS.goldBright);
    headingGrad.addColorStop(1, COLORS.gold);
    ctx.fillStyle = headingGrad;
    ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
    ctx.fillText("Level-up!", textX, 72);

    // Display name
    ctx.fillStyle = COLORS.white;
    ctx.font = '18px "Segoe UI", Arial, sans-serif';
    const name = (displayName || "Player").substring(0, 35);
    ctx.fillText(name, textX, 105);

    // Gold divider line under name
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(textX, 118);
    ctx.lineTo(textX + 220, 118);
    ctx.stroke();

    // Level numbers: "1  •  2"
    const levelText = `${oldLevel}  •  ${newLevel}`;
    ctx.fillStyle = COLORS.goldBright;
    ctx.font = 'bold 52px "Segoe UI", Arial, sans-serif';
    ctx.fillText(levelText, textX, 175);

    // ── Small gold accent gem ───────────────────────────────────────
    ctx.fillStyle = COLORS.goldBright;
    ctx.beginPath();
    ctx.arc(width - 25, 25, 7, 0, Math.PI * 2);
    ctx.fill();

    // Inner glow
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath();
    ctx.arc(width - 25, 25, 3.5, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toBuffer("image/png");
  } catch (err) {
    console.error("[LevelUpCard] Generation error:", err.message);
    return null;
  }
}

module.exports = { createLevelUpCard, loadImage, roundRect };
