"use strict";

/**
 * Image upload handling utilities
 * Supports Discord attachments and URL fallbacks
 */

const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Extract image URL from Discord attachment or URL string
 * @param {import('discord.js').Attachment|string|null} input
 * @returns {{url: string|null, error: string|null}}
 */
function extractImageUrl(input) {
  // Null/undefined
  if (!input) {
    return { url: null, error: null };
  }

  // String URL
  if (typeof input === "string") {
    if (isValidImageUrl(input)) {
      return { url: input, error: null };
    }
    return { url: null, error: "Invalid image URL format" };
  }

  // Discord Attachment
  if (input.url && input.contentType) {
    if (!ALLOWED_IMAGE_TYPES.includes(input.contentType.toLowerCase())) {
      return {
        url: null,
        error: `Invalid image type. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
      };
    }

    if (input.size > MAX_IMAGE_SIZE) {
      return {
        url: null,
        error: `Image too large. Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`,
      };
    }

    return { url: input.url, error: null };
  }

  return { url: null, error: "Invalid input type" };
}

/**
 * Validate image URL format
 * @param {string} url
 * @returns {boolean}
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== "string") return false;

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;

    const extension = parsed.pathname.toLowerCase().split(".").pop();
    const validExtensions = ["png", "jpg", "jpeg", "gif", "webp"];

    return (
      validExtensions.includes(extension) || url.includes("cdn.discordapp.com")
    );
  } catch {
    return false;
  }
}

/**
 * Extract image from interaction option
 * Supports both attachment and string URL
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {string} optionName
 * @returns {{url: string|null, error: string|null}}
 */
function getImageFromOption(interaction, optionName) {
  const attachment = interaction.options.getAttachment(optionName);
  if (attachment) {
    return extractImageUrl(attachment);
  }

  const urlString = interaction.options.getString(optionName);
  if (urlString) {
    return extractImageUrl(urlString);
  }

  return { url: null, error: null };
}

/**
 * Get image with fallback chain
 * @param {...(import('discord.js').Attachment|string|null)} sources
 * @returns {{url: string|null, error: string|null}}
 */
function getImageWithFallback(...sources) {
  for (const source of sources) {
    const result = extractImageUrl(source);
    if (result.url) {
      return result;
    }
  }

  return { url: null, error: "No valid image found in any source" };
}

/**
 * Validate and sanitize image URL for storage
 * @param {string|null} url
 * @returns {string|null}
 */
function sanitizeImageUrl(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    // Only allow HTTPS (Discord CDN uses HTTPS)
    if (parsed.protocol !== "https:") return null;

    return url;
  } catch {
    return null;
  }
}

module.exports = {
  extractImageUrl,
  isValidImageUrl,
  getImageFromOption,
  getImageWithFallback,
  sanitizeImageUrl,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
};
