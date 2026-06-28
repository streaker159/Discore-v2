"use strict";

/**
 * MediaWiki API Client
 *
 * Uses action=parse for structured page content (HTML, links, sections).
 * Falls back to action=query with categorymembers for bulk unit discovery.
 * Rate-limited with configurable delays.
 */

const logger = require("../../lib/logger");

const USER_AGENT = "DiscoreBot/2.0 (unit-data-sync; Discord Strategy Bot)";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_DELAY_MS = 800;

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch from a URL with timeout and User-Agent
 */
async function fetchJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return { ok: false, error: "Request timed out" };
    }
    return { ok: false, error: err.message };
  }
}

/**
 * Build a MediaWiki API URL
 */
function buildApiUrl(apiUrl, params) {
  const url = new URL(apiUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * Parse a wiki page using action=parse.
 * Returns structured content: HTML body, links, sections, categories.
 *
 * @param {object} options
 * @param {string} options.apiUrl - MediaWiki API base URL
 * @param {string} options.page - Page title
 * @param {number} [options.timeoutMs]
 * @returns {Promise<object>}
 */
async function parsePage({ apiUrl, page, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const params = {
    action: "parse",
    page,
    prop: "text|links|sections|categories",
    format: "json",
    formatversion: "2",
    redirects: "1",
  };

  const url = buildApiUrl(apiUrl, params);
  logger.info(`[MediaWiki] Parsing page: ${page}`, { apiUrl });

  const result = await fetchJson(url, timeoutMs);

  if (!result.ok) {
    return { ok: false, error: result.error, page };
  }

  const parse = result.data?.parse;
  if (!parse) {
    return { ok: false, error: `No parse data returned for "${page}"`, page };
  }

  return {
    ok: true,
    page,
    pageId: parse.pageid,
    title: parse.title,
    text: parse.text || "", // Parsed HTML
    links: (parse.links || []).map((l) => ({
      title: l.title,
      exists: l.exists !== false,
    })),
    sections: (parse.sections || []).map((s) => ({
      index: s.index,
      line: s.line,
      number: s.number,
      level: s.level,
      anchor: s.anchor,
      fromTitle: s.fromtitle,
    })),
    categories: (parse.categories || []).map((c) => ({
      sortkey: c.sortkey,
      category: c["*"] || c.category,
    })),
  };
}

/**
 * Query category members to discover pages in a category.
 *
 * @param {object} options
 * @param {string} options.apiUrl
 * @param {string} options.category - e.g. "Category:Units"
 * @param {number} [options.limit=500]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<object>}
 */
async function queryCategoryMembers({
  apiUrl,
  category,
  limit = 500,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const params = {
    action: "query",
    list: "categorymembers",
    cmtitle: category,
    cmlimit: String(Math.min(limit, 500)),
    format: "json",
    formatversion: "2",
  };

  const url = buildApiUrl(apiUrl, params);
  logger.info(`[MediaWiki] Querying category: ${category}`);

  const result = await fetchJson(url, timeoutMs);

  if (!result.ok) {
    return { ok: false, error: result.error, category };
  }

  const members = (result.data?.query?.categorymembers || []).map((m) => ({
    pageId: m.pageid,
    title: m.title,
    ns: m.ns,
  }));

  return {
    ok: true,
    category,
    members,
    continue: result.data?.continue?.cmcontinue || null,
  };
}

/**
 * Fetch parse results for multiple pages with rate limiting.
 *
 * @param {object} options
 * @param {string} options.apiUrl
 * @param {string[]} options.pages - Array of page titles
 * @param {number} [options.delayMs=800]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxPages=100]
 * @returns {Promise<object[]>}
 */
async function parseMultiplePages({
  apiUrl,
  pages,
  delayMs = DEFAULT_DELAY_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxPages = 100,
}) {
  const results = [];
  const toProcess = pages.slice(0, maxPages);

  for (let i = 0; i < toProcess.length; i++) {
    if (i > 0) {
      await sleep(delayMs);
    }
    const result = await parsePage({
      apiUrl,
      page: toProcess[i],
      timeoutMs,
    });
    results.push(result);
  }

  return results;
}

module.exports = {
  parsePage,
  queryCategoryMembers,
  parseMultiplePages,
  fetchJson,
  buildApiUrl,
  sleep,
  USER_AGENT,
};
