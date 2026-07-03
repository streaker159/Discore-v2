"use strict";

/**
 * XP leaderboard card generator — Discore Gold Edition
 * Same dark navy / gold palette as profileXpCard.js. Renders up to 10 rows
 * (rank, avatar, name, level, metric value) plus a "Your Rank" panel at the
 * bottom when the viewer isn't in the visible top list.
 * Uses @napi-rs/canvas. Falls back to null if canvas is unavailable.
 */

const {
  getCanvasModule,
  loadImage,
  roundRect,
  formatCompactNumber,
} = require("./canvasUtils");

const canvasModule = getCanvasModule();

const COLORS = {
  bgDark: "#101820",
  panel: "#18212b",
  gold: "#d4af37",
  goldBright: "#f5c542",
  silver: "#c7cdd6",
  bronze: "#c98a4b",
  white: "#ffffff",
  muted: "#9a9a9a",
  dim: "#6a7a8a",
  rowAlt: "#141e28",
  highlight: "#2a2313",
};

const MEDAL_COLORS = { 1: COLORS.gold, 2: COLORS.silver, 3: COLORS.bronze };

const ROW_H = 62;
const HEADER_H = 96;
const PADDING_X = 40;
const PADDING_BOTTOM = 26;
const AVATAR_SIZE = 40;

function metricLabel(period) {
  if (period === "messages") return "msgs";
  if (period === "reactions") return "reactions";
  return "XP";
}

function formatMetricValue(value, period) {
  const compact = formatCompactNumber(value || 0);
  return period === "messages" || period === "reactions"
    ? compact
    : `${compact} XP`;
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.guildName]
 * @param {string} opts.period - overall|daily|weekly|monthly|messages|reactions
 * @param {Array<object>} opts.entries - top N leaderboard rows (already sorted)
 * @param {object} [opts.viewer] - { userId, displayName, avatarUrl, level, value, rank, inTop }
 * @returns {Promise<Buffer|null>}
 */
async function createLeaderboardCard(opts) {
  if (!canvasModule) return null;

  try {
    const { createCanvas } = canvasModule;
    const { title, guildName, period, entries = [], viewer } = opts;

    // Warm the avatar cache for every row in parallel up-front, instead of
    // awaiting each avatar one at a time inside the row-drawing loop below —
    // this turns up to 11 sequential network round-trips into a single batch.
    const avatarUrls = entries.map((e) => e.avatarUrl).filter(Boolean);
    if (viewer?.avatarUrl) avatarUrls.push(viewer.avatarUrl);
    await Promise.all(avatarUrls.map((url) => loadImage(url)));

    const showViewerPanel = viewer && !viewer.inTop;
    const rowCount = Math.max(entries.length, 1);
    const width = 820;
    const height =
      HEADER_H +
      rowCount * ROW_H +
      (showViewerPanel ? 40 + ROW_H : 0) +
      PADDING_BOTTOM;

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

    // ── Angled gold accent (top-right) ──────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(width - 220, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, 140);
    ctx.closePath();
    ctx.fillStyle = COLORS.gold;
    ctx.globalAlpha = 0.05;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── Header ──────────────────────────────────────────────────────
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
    ctx.fillText(title || "XP Leaderboard", PADDING_X, 52);

    ctx.fillStyle = COLORS.muted;
    ctx.font = '16px "Segoe UI", Arial, sans-serif';
    ctx.fillText(guildName || "Discore", PADDING_X, 78);

    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PADDING_X, HEADER_H - 8);
    ctx.lineTo(width - PADDING_X, HEADER_H - 8);
    ctx.stroke();

    // ── Rows ────────────────────────────────────────────────────────
    let rowY = HEADER_H;

    if (entries.length === 0) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = '16px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(
        "No data yet for this period — get active!",
        width / 2,
        rowY + ROW_H / 2 + 6,
      );
      ctx.textAlign = "start";
      rowY += ROW_H;
    } else {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const rank = i + 1;
        const isViewerRow = viewer?.inTop && entry.userId === viewer.userId;

        if (isViewerRow) {
          ctx.fillStyle = COLORS.highlight;
          roundRect(
            ctx,
            PADDING_X - 12,
            rowY + 4,
            width - (PADDING_X - 12) * 2,
            ROW_H - 10,
            10,
          );
          ctx.fill();
        } else if (i % 2 === 1) {
          ctx.fillStyle = COLORS.rowAlt;
          roundRect(
            ctx,
            PADDING_X - 12,
            rowY + 4,
            width - (PADDING_X - 12) * 2,
            ROW_H - 10,
            10,
          );
          ctx.fill();
        }

        await drawRow(ctx, {
          x: PADDING_X,
          y: rowY,
          width,
          rank,
          displayName: entry.displayName || entry.userTag || "Unknown",
          avatarUrl: entry.avatarUrl,
          level: entry.level,
          value: formatMetricValue(getEntryMetric(entry, period), period),
        });

        rowY += ROW_H;
      }
    }

    // ── Viewer panel (only if not already visible in the rows above) ─
    if (showViewerPanel) {
      rowY += 20;
      ctx.strokeStyle = "#253040";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PADDING_X, rowY - 6);
      ctx.lineTo(width - PADDING_X, rowY - 6);
      ctx.stroke();

      ctx.fillStyle = COLORS.gold;
      ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
      ctx.fillText("YOUR RANK", PADDING_X, rowY + 10);
      rowY += 18;

      ctx.fillStyle = COLORS.highlight;
      roundRect(
        ctx,
        PADDING_X - 12,
        rowY + 4,
        width - (PADDING_X - 12) * 2,
        ROW_H - 10,
        10,
      );
      ctx.fill();

      if (viewer.rank > 0) {
        await drawRow(ctx, {
          x: PADDING_X,
          y: rowY,
          width,
          rank: viewer.rank,
          displayName: viewer.displayName || "You",
          avatarUrl: viewer.avatarUrl,
          level: viewer.level,
          value: formatMetricValue(viewer.value, period),
        });
      } else {
        ctx.fillStyle = COLORS.muted;
        ctx.font = '15px "Segoe UI", Arial, sans-serif';
        ctx.fillText(
          `Not ranked yet — get some ${metricLabel(period)} to appear here!`,
          PADDING_X + 4,
          rowY + ROW_H / 2 + 4,
        );
      }
    }

    return canvas.toBuffer("image/png");
  } catch (err) {
    console.error("[LeaderboardCard] Generation error:", err.message);
    return null;
  }
}

function getEntryMetric(entry, period) {
  if (period === "messages") return entry.messagesCounted || 0;
  if (period === "reactions") return entry.reactionsCounted || 0;
  return entry.totalXp || 0;
}

/**
 * Draw a single leaderboard row (rank badge, avatar, name/level, value).
 */
async function drawRow(
  ctx,
  { x, y, width, rank, displayName, avatarUrl, level, value },
) {
  const centerY = y + ROW_H / 2;

  // ── Rank badge ────────────────────────────────────────────────────
  const medalColor = MEDAL_COLORS[rank];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (medalColor) {
    ctx.fillStyle = medalColor;
    ctx.beginPath();
    ctx.arc(x + 16, centerY, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.bgDark;
    ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
    ctx.fillText(String(rank), x + 16, centerY + 1);
  } else {
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`#${rank}`, x + 18, centerY + 1);
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";

  // ── Avatar ──────────────────────────────────────────────────────
  const avatarX = x + 46;
  const avatarCX = avatarX + AVATAR_SIZE / 2;
  const avatarCY = centerY;

  let avatarDrawn = false;
  if (avatarUrl) {
    const img = await loadImage(avatarUrl);
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarCX, avatarCY, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(
        img,
        avatarX,
        avatarCY - AVATAR_SIZE / 2,
        AVATAR_SIZE,
        AVATAR_SIZE,
      );
      ctx.restore();
      avatarDrawn = true;
    }
  }
  if (!avatarDrawn) {
    ctx.fillStyle = COLORS.panel;
    ctx.beginPath();
    ctx.arc(avatarCX, avatarCY, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    const initial = (displayName || "P").charAt(0).toUpperCase();
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initial, avatarCX, avatarCY);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(avatarCX, avatarCY, AVATAR_SIZE / 2 + 1.5, 0, Math.PI * 2);
  ctx.stroke();

  // ── Name + level ──────────────────────────────────────────────────
  const nameX = avatarX + AVATAR_SIZE + 18;
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
  ctx.fillText((displayName || "Player").substring(0, 28), nameX, centerY - 3);

  ctx.fillStyle = COLORS.muted;
  ctx.font = '13px "Segoe UI", Arial, sans-serif';
  ctx.fillText(`LVL ${level || 1}`, nameX, centerY + 15);

  // ── Value (right aligned) ─────────────────────────────────────────
  ctx.fillStyle = COLORS.goldBright;
  ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = "right";
  ctx.fillText(value, (width || 820) - PADDING_X, centerY + 6);
  ctx.textAlign = "start";
}

module.exports = { createLeaderboardCard };
