"use strict";

// Supported game wikis mapping
const GAME_WIKIS = {
  // New standardized keys
  supremacy_ww3: {
    name: "Supremacy: World War 3",
    apiUrl: "https://conflictnations.fandom.com/api.php",
  },
  call_of_war_1942: {
    name: "Supremacy: Call of War 1942",
    apiUrl: "https://call-of-war-by-bytro.fandom.com/api.php",
  },
  supremacy_1914: {
    name: "Supremacy 1914",
    apiUrl: "https://supremacy1914.fandom.com/api.php",
  },
  iron_order_1919: {
    name: "Iron Order 1919",
    apiUrl: "https://ironorder1919.fandom.com/api.php",
  },

  // Backward compatibility aliases
  conflict_of_nations: {
    name: "Conflict of Nations",
    apiUrl: "https://conflictnations.fandom.com/api.php",
  },
  call_of_war: {
    name: "Call of War",
    apiUrl: "https://call-of-war-by-bytro.fandom.com/api.php",
  },
  supremacy_1914_en: {
    name: "Supremacy 1914",
    apiUrl: "https://supremacy1914.fandom.com/api.php",
  },
};

/**
 * Validate game key
 * @param {string} gameKey
 * @returns {boolean}
 */
function isValidGameKey(gameKey) {
  return gameKey && GAME_WIKIS[gameKey] !== undefined;
}

/**
 * Get game info
 * @param {string} gameKey
 * @returns {object|null}
 */
function getGameInfo(gameKey) {
  return GAME_WIKIS[gameKey] || null;
}

/**
 * Get list of supported games
 * @returns {string}
 */
function getSupportedGamesList() {
  return Object.values(GAME_WIKIS)
    .map((g) => g.name)
    .join(", ");
}

/**
 * Fetch a wiki page from Fandom MediaWiki API
 * @param {string} gameKey - The game identifier
 * @param {string} pageTitle - Page title to fetch
 * @param {number} timeoutMs - Request timeout in milliseconds
 * @returns {Promise<{ok: boolean, content?: string, error?: string}>}
 */
async function fetchWikiPage(gameKey, pageTitle, timeoutMs = 10000) {
  if (!isValidGameKey(gameKey)) {
    return {
      ok: false,
      error: `Unsupported game. Discore AI currently supports: ${getSupportedGamesList()}.`,
    };
  }

  const gameInfo = getGameInfo(gameKey);
  const apiUrl = gameInfo.apiUrl;

  // Build MediaWiki API request
  const params = new URLSearchParams({
    action: "query",
    prop: "revisions",
    titles: pageTitle,
    rvprop: "content",
    rvslots: "main",
    format: "json",
    formatversion: "2",
  });

  const requestUrl = `${apiUrl}?${params.toString()}`;

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(requestUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "DiscoreBot/2.0 (Discord Strategy Bot)",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: `Wiki request failed with status ${response.status}`,
      };
    }

    const data = await response.json();

    // Extract page content from MediaWiki response
    const pages = data?.query?.pages;
    if (!pages || pages.length === 0) {
      return {
        ok: false,
        error: `Page "${pageTitle}" not found in ${gameInfo.name} wiki`,
      };
    }

    const page = pages[0];

    // Check if page exists
    if (page.missing) {
      return {
        ok: false,
        error: `Page "${pageTitle}" does not exist in ${gameInfo.name} wiki`,
      };
    }

    // Extract content from various possible structures
    let content = null;

    if (page.revisions && page.revisions[0]) {
      const revision = page.revisions[0];

      // Try different content locations
      if (revision.slots?.main?.content) {
        content = revision.slots.main.content;
      } else if (revision.slots?.main?.["*"]) {
        content = revision.slots.main["*"];
      } else if (revision["*"]) {
        content = revision["*"];
      } else if (revision.content) {
        content = revision.content;
      }
    }

    if (!content) {
      return {
        ok: false,
        error: `Could not extract content from page "${pageTitle}"`,
      };
    }

    return {
      ok: true,
      content: content,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      return {
        ok: false,
        error: `Wiki request timed out for ${gameInfo.name}`,
      };
    }

    console.error(`[Wiki Fetch Error] ${gameKey}/${pageTitle}:`, error.message);
    return {
      ok: false,
      error: `Failed to fetch wiki page: ${error.message}`,
    };
  }
}

/**
 * Clean and trim wiki content for AI context
 * @param {string} rawContent - Raw wikitext
 * @param {number} maxChars - Maximum characters to keep
 * @returns {string}
 */
function cleanWikiContent(rawContent, maxChars = 15000) {
  if (!rawContent) return "";

  let cleaned = rawContent;

  // Remove common wiki templates that don't add value
  cleaned = cleaned.replace(/\{\{[Nn]avbox.*?\}\}/gs, "");
  cleaned = cleaned.replace(/\{\{[Ss]tub.*?\}\}/gs, "");
  cleaned = cleaned.replace(/__NOTOC__/g, "");
  cleaned = cleaned.replace(/__TOC__/g, "");

  // Remove complex nested templates (basic cleanup)
  cleaned = cleaned.replace(/\{\{Infobox.*?\}\}/gs, "");

  // Remove image syntax but keep captions
  cleaned = cleaned.replace(/\[\[File:.*?\]\]/g, "");
  cleaned = cleaned.replace(/\[\[Image:.*?\]\]/g, "");

  // Simplify internal links [[Page|Display]] -> Display
  cleaned = cleaned.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  cleaned = cleaned.replace(/\[\[([^\]]+)\]\]/g, "$1");

  // Remove external links but keep text
  cleaned = cleaned.replace(/\[https?:\/\/[^\s\]]+ ([^\]]+)\]/g, "$1");

  // Remove category tags
  cleaned = cleaned.replace(/\[\[Category:.*?\]\]/g, "");

  // Remove reference tags
  cleaned = cleaned.replace(/<ref.*?>.*?<\/ref>/gs, "");
  cleaned = cleaned.replace(/<ref.*?\/>/g, "");

  // Clean up excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.trim();

  // Truncate if too long
  if (cleaned.length > maxChars) {
    cleaned = cleaned.substring(0, maxChars) + "\n\n[Content truncated...]";
  }

  return cleaned;
}

module.exports = {
  GAME_WIKIS,
  isValidGameKey,
  getGameInfo,
  getSupportedGamesList,
  fetchWikiPage,
  cleanWikiContent,
};
