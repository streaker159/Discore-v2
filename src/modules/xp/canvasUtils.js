"use strict";

/**
 * Shared canvas helpers for XP card generators (profile, level-up, leaderboard).
 * Centralizes:
 *  - safe @napi-rs/canvas loading (module may be absent on some hosts)
 *  - avatar image loading/decoding (uses the canvas module's own async
 *    loadImage() which waits for full decode — constructing `new Image(buffer)`
 *    directly does NOT decode synchronously and silently draws nothing)
 *  - a short-lived avatar cache so rendering multiple cards (e.g. a 10-row
 *    leaderboard) doesn't re-fetch/re-decode the same avatar over and over
 *  - roundRect drawing helper
 */

const { TTLCache } = require("../../lib/cache");

let canvasModule = null;
try {
  canvasModule = require("@napi-rs/canvas");
} catch {
  // Canvas not available on this host — callers must handle null return
}

// Avatar URLs embed a content hash, so the same URL always points to the same
// image — safe to cache for a while to save repeated network+decode work.
const avatarImageCache = new TTLCache(5 * 60_000);

function getCanvasModule() {
  return canvasModule;
}

/**
 * Load + decode an image URL into a canvas Image, with short-term caching.
 * @param {string} url
 * @returns {Promise<import("@napi-rs/canvas").Image|null>}
 */
async function loadImage(url) {
  if (!canvasModule || !url) return null;

  const cached = avatarImageCache.get(url);
  if (cached) return cached;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    // canvasModule.loadImage() decodes the image before resolving.
    const img = await canvasModule.loadImage(Buffer.from(buf));
    avatarImageCache.set(url, img);
    return img;
  } catch {
    return null;
  }
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

function formatCompactNumber(n) {
  const value = Number(n) || 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.floor(value));
}

module.exports = {
  getCanvasModule,
  loadImage,
  roundRect,
  formatCompactNumber,
};
