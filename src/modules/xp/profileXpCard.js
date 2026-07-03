"use strict";

/**
 * Profile card generator — Discore Gold Edition (Full Dashboard)
 * ~1000x540 dark card with gold accents. Contains all user-facing profile
 * information so the embed below can stay slim (roles + admin mod summary).
 * Uses @napi-rs/canvas. Falls back to null.
 */

const { getCanvasModule, loadImage, roundRect } = require("./canvasUtils");

const canvasModule = getCanvasModule();

const COLORS = {
  bgDark: "#101820",
  panel: "#18212b",
  gold: "#d4af37",
  goldBright: "#f5c542",
  white: "#ffffff",
  muted: "#9a9a9a",
  dim: "#6a7a8a",
  barBg: "#1e2a3a",
};

/**
 * @param {object} opts
 * @param {string} opts.avatarUrl
 * @param {string} opts.displayName
 * @param {string} [opts.username]
 * @param {number} opts.level
 * @param {number} opts.totalXp
 * @param {number} opts.currentXp
 * @param {number} opts.nextLevelXp
 * @param {number} opts.rank
 * @param {number} opts.progressPercent
 * @param {number} [opts.messagesCounted]
 * @param {number} [opts.reactionsCounted]
 * @param {number} [opts.dailyXp]
 * @param {number} [opts.weeklyXp]
 * @param {number} [opts.monthlyXp]
 * @param {string} [opts.joinedServer] — plain formatted date string
 * @param {string} [opts.accountCreated] — plain formatted date string
 * @param {string} [opts.lastActive] — plain relative time string
 * @param {number} [opts.activeStreak] — days
 * @param {string} [opts.mostActiveChannel] — plain "#channel-name" string
 * @returns {Promise<Buffer|null>}
 */
async function createProfileXpCard(opts) {
  if (!canvasModule) return null;

  try {
    const { createCanvas } = canvasModule;
    const {
      avatarUrl,
      displayName,
      username,
      level,
      totalXp,
      currentXp,
      nextLevelXp,
      rank,
      progressPercent,
      messagesCounted,
      reactionsCounted,
      dailyXp,
      weeklyXp,
      monthlyXp,
      joinedServer,
      accountCreated,
      lastActive,
      activeStreak,
      mostActiveChannel,
    } = opts;

    const width = 1000;
    const height = 540;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // ── Background ──────────────────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, COLORS.bgDark);
    bgGrad.addColorStop(0.6, "#0e1622");
    bgGrad.addColorStop(1, COLORS.panel);
    ctx.fillStyle = bgGrad;
    roundRect(ctx, 0, 0, width, height, 22);
    ctx.fill();

    // ── Gold top bar ────────────────────────────────────────────────
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(0, 0, width, 4);

    // ── Angled gold shape right ─────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(width - 280, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, height);
    ctx.lineTo(width - 120, height);
    ctx.closePath();
    ctx.fillStyle = COLORS.gold;
    ctx.globalAlpha = 0.04;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── Avatar ──────────────────────────────────────────────────────
    const avatarSize = 120;
    const avatarX = 45;
    const avatarY = 45;
    const avatarCX = avatarX + avatarSize / 2;
    const avatarCY = avatarY + avatarSize / 2;

    let avatarDrawn = false;
    if (avatarUrl) {
      const img = await loadImage(avatarUrl);
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarCX, avatarCY, avatarSize / 2, 0, Math.PI * 2);
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
      ctx.arc(avatarCX, avatarCY, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
      const initial = (displayName || "P").charAt(0).toUpperCase();
      ctx.fillStyle = COLORS.gold;
      ctx.font = 'bold 48px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initial, avatarCX, avatarCY);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }

    // ── Gold avatar ring ────────────────────────────────────────────
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(avatarCX, avatarCY, avatarSize / 2 + 2, 0, Math.PI * 2);
    ctx.stroke();

    // ── Identity column (right of avatar) ───────────────────────────
    const col1X = avatarX + avatarSize + 40;

    // Display name
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
    ctx.fillText((displayName || "Player").substring(0, 28), col1X, 80);

    // @username
    if (username) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = '16px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`@${username}`.substring(0, 32), col1X, 105);
    }

    // Gold divider under identity
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(col1X, 118);
    ctx.lineTo(col1X + 220, 118);
    ctx.stroke();

    // ── Main XP stat blocks (row 1) ─────────────────────────────────
    const row1Y = 155;
    drawStatBlock(ctx, "Level", String(level || 1), col1X, row1Y);
    drawStatBlock(
      ctx,
      "Total XP",
      formatXpShort(totalXp || 0),
      col1X + 130,
      row1Y,
    );
    drawStatBlock(ctx, "Rank", rank > 0 ? `#${rank}` : "—", col1X + 260, row1Y);
    drawStatBlock(
      ctx,
      "Progress",
      `${progressPercent || 0}%`,
      col1X + 380,
      row1Y,
    );

    // ── Progress bar (row 2) ────────────────────────────────────────
    const barY = row1Y + 65;
    const barW = 500;
    const barH = 14;
    ctx.fillStyle = COLORS.barBg;
    roundRect(ctx, col1X, barY, barW, barH, 7);
    ctx.fill();

    const fillW = Math.max(
      6,
      Math.min(barW, ((progressPercent || 0) / 100) * barW),
    );
    if (fillW > 0) {
      const barGrad = ctx.createLinearGradient(col1X, 0, col1X + barW, 0);
      barGrad.addColorStop(0, COLORS.goldBright);
      barGrad.addColorStop(1, COLORS.gold);
      ctx.fillStyle = barGrad;
      roundRect(ctx, col1X, barY, fillW, barH, 7);
      ctx.fill();
    }
    ctx.fillStyle = COLORS.muted;
    ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    ctx.fillText(
      `${formatXpShort(currentXp || 0)} / ${formatXpShort(nextLevelXp || 100)} XP`,
      col1X,
      barY + 30,
    );

    // ── Divider line ────────────────────────────────────────────────
    ctx.strokeStyle = "#253040";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(avatarX, barY + 55);
    ctx.lineTo(width - avatarX, barY + 55);
    ctx.stroke();

    // ── Lower sections ──────────────────────────────────────────────
    const secY = barY + 78;
    const secLeftX = avatarX;
    const secColW = 285;

    // ── Section: Period XP ──────────────────────────────────────────
    drawSectionLabel(ctx, "Period XP", secLeftX, secY);
    const pItems = [];
    if (dailyXp !== undefined) pItems.push(`Today  ${formatXpShort(dailyXp)}`);
    if (weeklyXp !== undefined) pItems.push(`Week  ${formatXpShort(weeklyXp)}`);
    if (monthlyXp !== undefined)
      pItems.push(`Month  ${formatXpShort(monthlyXp)}`);
    if (pItems.length === 0) pItems.push("No data yet");
    drawSectionItems(ctx, pItems, secLeftX, secY + 24, COLORS.muted);

    // ── Section: Activity ───────────────────────────────────────────
    const sec2X = secLeftX + secColW + 20;
    drawSectionLabel(ctx, "Activity", sec2X, secY);
    const aItems = [];
    if (typeof messagesCounted === "number")
      aItems.push(`Messages  ${messagesCounted}`);
    if (typeof reactionsCounted === "number")
      aItems.push(`Reactions  ${reactionsCounted}`);
    if (lastActive) aItems.push(`Last active  ${lastActive}`);
    if (activeStreak > 0) aItems.push(`Streak  ${activeStreak} day(s)`);
    if (mostActiveChannel) aItems.push(`Most active  ${mostActiveChannel}`);
    if (aItems.length === 0) aItems.push("No activity yet");
    drawSectionItems(ctx, aItems, sec2X, secY + 24, COLORS.muted);

    // ── Section: Account ────────────────────────────────────────────
    const sec3X = sec2X + secColW + 20;
    drawSectionLabel(ctx, "Account", sec3X, secY);
    const acItems = [];
    if (joinedServer) acItems.push(`Joined  ${joinedServer}`);
    if (accountCreated) acItems.push(`Created  ${accountCreated}`);
    if (acItems.length === 0) acItems.push("—");
    drawSectionItems(ctx, acItems, sec3X, secY + 24, COLORS.muted);

    // ── Gold accent dot ─────────────────────────────────────────────
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

// ── Drawing helpers ──────────────────────────────────────────────────────

function drawStatBlock(ctx, label, value, x, y) {
  ctx.fillStyle = COLORS.muted;
  ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
  ctx.fillText(label, x, y);
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
  ctx.fillText(String(value), x, y + 32);
}

function drawSectionLabel(ctx, text, x, y) {
  ctx.fillStyle = COLORS.gold;
  ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
  ctx.fillText(text, x, y);
}

function drawSectionItems(ctx, items, x, y, color) {
  ctx.fillStyle = color;
  ctx.font = '14px "Segoe UI", Arial, sans-serif';
  for (let i = 0; i < items.length; i++) {
    ctx.fillText(items[i].substring(0, 35), x, y + i * 22);
  }
}

function formatXpShort(xp) {
  if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(1)}M`;
  if (xp >= 1_000) return `${(xp / 1_000).toFixed(1)}K`;
  return String(Math.floor(xp));
}

module.exports = { createProfileXpCard, loadImage, roundRect };
