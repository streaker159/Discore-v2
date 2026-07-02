"use strict";

/**
 * Profile XP card generator — Discore Gold Edition
 * 1000x250 dark card with gold accents, avatar with gold ring,
 * nickname/display name, username, level/XP/rank stats row,
 * gold progress bar, and angled gold graphic on right.
 * Uses @napi-rs/canvas. Falls back to null.
 */

let canvasModule = null;
try {
  canvasModule = require("@napi-rs/canvas");
} catch {}

const COLORS = {
  bgDark: "#101820",
  panel: "#18212b",
  gold: "#d4af37",
  goldBright: "#f5c542",
  goldDim: "#9a7b28",
  white: "#ffffff",
  muted: "#9a9a9a",
  barBg: "#1e2a3a",
};

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
 * @param {object} opts
 * @param {string} opts.avatarUrl — PNG static URL
 * @param {string} opts.displayName — nickname or display name
 * @param {string} [opts.username] — @username (user.username)
 * @param {number} opts.level
 * @param {number} opts.currentXp — XP progress within level
 * @param {number} opts.nextLevelXp — XP needed for next level
 * @param {number} opts.rank — server rank (1-based)
 * @param {number} opts.progressPercent — 0-100
 * @param {number} [opts.messagesCounted]
 * @param {number} [opts.reactionsCounted]
 * @param {string} [opts.profileColor] — unused, kept for future
 * @returns {Promise<Buffer|null>}
 */
async function createProfileXpCard({
  avatarUrl,
  displayName,
  username,
  level,
  currentXp,
  nextLevelXp,
  rank,
  progressPercent,
  messagesCounted,
  reactionsCounted,
}) {
  if (!canvasModule) return null;

  try {
    const { createCanvas } = canvasModule;

    const width = 1000;
    const height = 250;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // ── Background ──────────────────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, COLORS.bgDark);
    bgGrad.addColorStop(0.5, "#0e1622");
    bgGrad.addColorStop(1, COLORS.panel);
    ctx.fillStyle = bgGrad;
    roundRect(ctx, 0, 0, width, height, 20);
    ctx.fill();

    // ── Angled gold shape right side ────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(width - 250, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, height);
    ctx.lineTo(width - 100, height);
    ctx.closePath();
    ctx.fillStyle = COLORS.gold;
    ctx.globalAlpha = 0.05;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── Top gold accent bar ─────────────────────────────────────────
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(0, 0, width, 4);

    // ── Avatar ──────────────────────────────────────────────────────
    const avatarSize = 120;
    const avatarX = 45;
    const avatarY = (height - avatarSize) / 2;
    const avatarCenterX = avatarX + avatarSize / 2;
    const avatarCenterY = avatarY + avatarSize / 2;

    let avatarDrawn = false;
    if (avatarUrl) {
      const img = await loadImage(avatarUrl);
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
        avatarDrawn = true;
      }
    }

    if (!avatarDrawn) {
      ctx.fillStyle = COLORS.panel;
      ctx.beginPath();
      ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();

      const initial = (displayName || "P").charAt(0).toUpperCase();
      ctx.fillStyle = COLORS.gold;
      ctx.font = 'bold 48px "Segoe UI", Arial, sans-serif';
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
    ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2 + 2, 0, Math.PI * 2);
    ctx.stroke();

    // ── Text area ───────────────────────────────────────────────────
    const textX = avatarX + avatarSize + 40;

    // Display name (large, white)
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
    const name = (displayName || "Player").substring(0, 28);
    ctx.fillText(name, textX, 75);

    // Username (smaller, muted)
    if (username) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = '16px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`@${username}`.substring(0, 35), textX, 100);
    }

    // Gold divider
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(textX, username ? 115 : 95);
    ctx.lineTo(textX + 200, username ? 115 : 95);
    ctx.stroke();

    // ── Stats row ───────────────────────────────────────────────────
    const statsY = username ? 145 : 125;

    function drawStat(label, value, x) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
      ctx.fillText(label, x, statsY);
      ctx.fillStyle = COLORS.white;
      ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
      ctx.fillText(String(value), x, statsY + 32);
    }

    drawStat("Level", level || 1, textX);
    drawStat(
      "XP",
      `${formatXpShort(currentXp || 0)} / ${formatXpShort(nextLevelXp || 100)}`,
      textX + 140,
    );
    drawStat("Rank", rank > 0 ? `#${rank}` : "—", textX + 340);

    // ── Optional mini stats ─────────────────────────────────────────
    if ((messagesCounted || 0) > 0 || (reactionsCounted || 0) > 0) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = '13px "Segoe UI", Arial, sans-serif';
      const mini = `Messages: ${messagesCounted || 0}  •  Reactions: ${reactionsCounted || 0}`;
      ctx.fillText(mini, textX + 480, statsY + 15);
    }

    // ── Progress bar ────────────────────────────────────────────────
    const barY = statsY + 52;
    const barWidth = 520;
    const barHeight = 14;
    const barX = textX;

    // Bar bg
    ctx.fillStyle = COLORS.barBg;
    roundRect(ctx, barX, barY, barWidth, barHeight, 7);
    ctx.fill();

    // Bar fill (gold gradient)
    const fillW = Math.max(
      6,
      Math.min(barWidth, (progressPercent / 100) * barWidth),
    );
    if (fillW > 0) {
      const barGrad = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
      barGrad.addColorStop(0, COLORS.goldBright);
      barGrad.addColorStop(1, COLORS.gold);
      ctx.fillStyle = barGrad;
      roundRect(ctx, barX, barY, fillW, barHeight, 7);
      ctx.fill();
    }

    // Progress %
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`${progressPercent}%`, barX + barWidth + 15, barY + 12);

    // ── Gold accent dot top-right ───────────────────────────────────
    ctx.fillStyle = COLORS.goldBright;
    ctx.beginPath();
    ctx.arc(width - 30, 30, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath();
    ctx.arc(width - 30, 30, 4, 0, Math.PI * 2);
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
