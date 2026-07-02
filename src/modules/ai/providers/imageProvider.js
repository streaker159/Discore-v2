"use strict";

const IMAGE_API_URL =
  process.env.IMAGE_GEN_API_URL || "https://image.pollinations.ai/prompt";

/**
 * Generate an image from a text prompt.
 * Uses Pollinations.ai by default (free, no API key).
 * Override with IMAGE_GEN_API_URL env var for other providers.
 *
 * @param {Object} options
 * @param {string} options.prompt - The image description
 * @param {string} [options.style] - Optional style modifier
 * @param {number} [options.width=1024] - Image width
 * @param {number} [options.height=1024] - Image height
 * @returns {Promise<{url: string, buffer: Buffer}>}
 */
async function generateImage({
  prompt,
  style = "",
  width = 1024,
  height = 1024,
}) {
  const fullPrompt = style ? `${prompt}, ${style}` : prompt;
  const encodedPrompt = encodeURIComponent(fullPrompt);

  const url = `${IMAGE_API_URL}/${encodedPrompt}?width=${width}&height=${height}&nologo=true`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(
        `Image generation failed: HTTP ${res.status} ${res.statusText}`,
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    if (buffer.length < 100) {
      throw new Error("Image generation returned an empty or invalid image");
    }

    return { url, buffer };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError")
      throw new Error("Image generation timed out");
    throw err;
  }
}

/**
 * Extract image prompt from a user message.
 * Strips command words like "generate", "draw", "create", "make me a", etc.
 *
 * @param {string} content - User message content
 * @returns {string|null} - Clean prompt or null if no image intent detected
 */
function extractImagePrompt(content) {
  const lower = content.toLowerCase();

  const patterns = [
    /(?:generate|draw|create|make)\s+(?:me\s+)?(?:a\s+)?(?:an\s+)?(?:image|picture|art|photo|illustration)\s+(?:of\s+)?(.+)/i,
    /(?:generate|draw|create|make)\s+(?:me\s+)?(?:a\s+)?(?:an\s+)?(.+?)(?:\s+(?:image|picture|art|photo|illustration))?$/i,
    /(?:show|give)\s+(?:me\s+)?(?:a\s+)?(?:an\s+)?(?:image|picture|art|photo)\s+(?:of\s+)?(.+)/i,
    /(?:can\s+you\s+)?(?:generate|draw|create|make|show)\s+(?:me\s+)?(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      let prompt = match[1].trim();

      // Remove trailing "image" / "picture" words that may have been captured
      prompt = prompt
        .replace(/\s+(?:image|picture|art|photo|illustration)\s*$/i, "")
        .trim();

      if (prompt.length > 5) {
        return prompt;
      }
    }
  }

  return null;
}

/**
 * Quick check if a message is requesting image generation.
 *
 * @param {string} content - User message content
 * @returns {boolean}
 */
function isImageGenerationRequest(content) {
  const lower = content.toLowerCase();
  const imageKeywords = [
    /\bgenerate\b.*\b(image|picture|art|photo|draw|illustration)\b/i,
    /\bdraw\b.*\b(me|a|an)\b/i,
    /\bcreate\b.*\b(image|picture|art|photo)\b/i,
    /\bmake\b.*\b(image|picture|art|photo)\b/i,
    /\bshow\b.*\b(image|picture|art|photo)\b/i,
  ];

  return imageKeywords.some((pattern) => pattern.test(lower));
}

/**
 * Basic safety filter for prompts.
 * Rejects obviously NSFW, violent, or harmful requests.
 *
 * @param {string} prompt
 * @returns {{safe: boolean, reason: string|null}}
 */
function filterPrompt(prompt) {
  const lower = prompt.toLowerCase();

  const blockedTerms = [
    "nude",
    "naked",
    "nsfw",
    "porn",
    "sex",
    "sexual",
    "gore",
    "torture",
    "kill",
    "murder",
    "suicide",
    "child",
    "minor",
    "underage",
    "racist",
    "nazi",
    "hitler",
    "terrorist",
    "realistic violence",
    "realistic gore",
  ];

  for (const term of blockedTerms) {
    if (lower.includes(term)) {
      return {
        safe: false,
        reason: `Your prompt contains a blocked term ("${term}"). Keep it PG, commander.`,
      };
    }
  }

  if (prompt.length > 500) {
    return {
      safe: false,
      reason: "Prompt is too long. Keep it under 500 characters.",
    };
  }

  if (prompt.length < 5) {
    return {
      safe: false,
      reason: "Prompt is too short. Describe what you want me to generate.",
    };
  }

  return { safe: true, reason: null };
}

module.exports = {
  generateImage,
  extractImagePrompt,
  isImageGenerationRequest,
  filterPrompt,
};
