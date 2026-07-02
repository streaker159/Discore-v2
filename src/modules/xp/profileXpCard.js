"use strict";

/**
 * Profile XP header card generator
 * Creates a dark-themed profile card with avatar, level, XP, rank, and progress bar
 * Uses @napi-rs/canvas for image generation.
 * Designed to be 1000x250 for future profile headers.
 * Falls back to returning null if canvas is unavailable.
 */

let canvasModule = null;
try {
  canvasModule = require("@napi-rs/canvas");
} catch {
  // Canvas not available
}

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
 * Create a profile XP header card
 * @param {object} opts
 * @param {string} opts.avatarUrl - User avatar URL
 * @param {string} opts.displayName - User display name (nickname preferred)
 * @param {number} opts.level - Current level
 * @param {number} opts.currentXp - Current XP progress (within level)
 * @param {number} opts.nextLevelXp - XP needed for next level
 * @param {number} opts.rank - Server rank (1-based)
 * @param {number} opts.progressPercent - Progress 0-100
 * @param {string} [opts.profileColor] - Accent color (default cyan)
 * @returns {Promise<Buffer|null>}
 */
async function createProfileXpCard({
  avatarUrl,
  displayName,
  level,
  currentXp,
  nextLevelXp,
  rank,
  progressPercent,
  profileColor,
}) {
  if (!canvasModule) return null;

  try {
    const { createCanvas } = canvasModule;

    const width = 1000;
    const height = 250;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const accentColor = profileColor || "#00cccc";

    // Background - dark
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, "#0a1628");
    bgGradient.addColorStop(1, "#162240");
    ctx.fillStyle = bgGradient;
    roundRect(ctx, 0, 0, width, height, 20);
    ctx.fill();

    // Angled cyan shape on the right side
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(width - 200, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, height);
    ctx.lineTo(width - 80, height);
    ctx.closePath();
    ctx.fillStyle = accentColor;
    ctx.globalAlpha = 0.08;
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.restore();

    // Avatar
    const avatarSize = 120;
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

    // Avatar border ring (cyan)
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(
      avatarX + avatarSize / 2,
      avatarY + avatarSize / 2,
      avatarSize / 2 + 2,
      0,
      Math.PI * 2,
    );
    ctx.stroke();

    // Text positioning
    const textX = avatarX + avatarSize + 40;

    // Display name
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
    ctx.fillText((displayName || "Player").substring(0, 30), textX, 75);

    // Line under username
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(textX, 90);
    ctx.lineTo(textX + 200, 90);
    ctx.stroke();

    // Stats row: Level, XP, Rank
    const statsY = 130;
    ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';

    // Level
    ctx.fillStyle = "#8899aa";
    ctx.fillText("Level", textX, statsY);
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
    ctx.fillText(String(level || 1), textX, statsY + 35);

    // XP
    const xpColX = textX + 160;
    ctx.fillStyle = "#8899aa";
    ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.fillText("XP", xpColX, statsY);
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
    const xpText = `${formatXpShort(currentXp || 0)} / ${formatXpShort(nextLevelXp || 100)}`;
    ctx.fillText(xpText, xpColX, statsY + 35);

    // Rank
    const rankColX = xpColX + 280;
    ctx.fillStyle = "#8899aa";
    ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.fillText("Rank", rankColX, statsY);
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
    ctx.fillText(rank > 0 ? `#${rank}` : "—", rankColX, statsY + 35);

    // Progress bar
    const barY = statsY + 65;
    const barWidth = 500;
    const barHeight = 16;
    const barX = textX;

    // Bar background
    ctx.fillStyle = "#1a2a3a";
    roundRect(ctx, barX, barY, barWidth, barHeight, 8);
    ctx.fill();

    // Bar fill
    const fillWidth = Math.max(
      4,
      Math.min(barWidth, (progressPercent / 100) * barWidth),
    );
    if (fillWidth > 0) {
      const barGradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
      barGradient.addColorStop(0, accentColor);
      barGradient.addColorStop(1, accentColor + "88");
      ctx.fillStyle = barGradient;
      roundRect(ctx, barX, barY, fillWidth, barHeight, 8);
      ctx.fill();
    }

    // Progress text
    ctx.fillStyle = "#ffffff";
    ctx.font = '12px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`${progressPercent}%`, barX + barWidth + 15, barY + 13);

    // Small golden accent dot
    ctx.fillStyle = "#ccaa00";
    ctx.beginPath();
    ctx.arc(width - 30, 30, 8, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toBuffer("image/png");
  } catch (err) {
    console.error("[ProfileXpCard] Generation error:", err.message);
    return null;
  }
}

function formatXpShort(xp) {
  if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(1)}M`;
  if (xp >= 1_000) return `${(xp / 1_000).toFixed(1)}K`;
  return String(Math.floor(xp));
}

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

module.exports = { createProfileXpCard, loadImage, roundRect };
