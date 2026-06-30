"use strict";

const {
  canUseAi,
  consumeAiCredits,
  refundAiCredits,
} = require("../premium/service");
const { generateDeepSeekResponse } = require("./providers/deepseekProvider");
const { getLanguageForFlag } = require("./flagLanguages");
const prisma = require("../../lib/prisma");

const DEBUG = process.env.DEBUG_SCOREBOARDS === "true";
function debugLog(...args) {
  if (DEBUG) console.log("[Translation]", ...args);
}

/**
 * Re-exported for backward compatibility.
 * @deprecated Use getLanguageForFlag from flagLanguages instead.
 */
function getLangFromFlag(emoji) {
  const info = getLanguageForFlag(emoji);
  return info ? info.language : null;
}

/**
 * Re-exported for backward compatibility.
 * @deprecated Use normalizeFlagInput from flagLanguages instead.
 */
function normalizeFlagEmoji(reactionEmoji) {
  const { normalizeFlagInput } = require("./flagLanguages");
  return normalizeFlagInput(reactionEmoji?.name || reactionEmoji);
}

// ── Rate limiting for credit error messages ───────────────────────────
const creditErrorCooldowns = new Map();
const CREDIT_ERROR_COOLDOWN_MS = 5 * 60 * 1000;

function canSendCreditError(guildId) {
  const last = creditErrorCooldowns.get(guildId) || 0;
  if (Date.now() - last < CREDIT_ERROR_COOLDOWN_MS) return false;
  creditErrorCooldowns.set(guildId, Date.now());
  return true;
}

const TRANSLATION_SYSTEM_PROMPT = `You are Discore Official's translation engine. Translate the provided Discord message into TARGET_LANGUAGE exactly.
Rules:
- Translate ONLY. Do not add commentary.
- Preserve mentions (<@...>, <@&...>, <#...>), URLs, channel/role mentions.
- Preserve usernames, numbers, game terms, emojis.
- Preserve formatting.
- If the message is already entirely in TARGET_LANGUAGE, respond with: "This message already appears to be in TARGET_LANGUAGE."
- Return ONLY the translation.`;

async function translateMessage({
  guildId,
  userId,
  messageContent,
  targetEmoji,
}) {
  debugLog("translateMessage called", {
    guildId,
    userId,
    targetEmoji,
    contentLength: messageContent?.length,
  });

  const targetLang = getLangFromFlag(targetEmoji);
  if (!targetLang) {
    debugLog("unsupported flag", { targetEmoji });
    return { success: false, error: "unsupported_flag" };
  }

  debugLog("target language resolved", { targetLang });

  const gate = await canUseAi(guildId, userId, 1);
  if (!gate.ok) {
    debugLog("AI credit check failed", { reason: gate.reason });
    return { success: false, error: gate.reason || "ai_blocked" };
  }

  debugLog("AI credit check passed");

  const premium = await prisma.guildPremium.findUnique({
    where: { guildId },
    select: { aiTranslationEnabled: true },
  });
  if (!premium?.aiTranslationEnabled) {
    debugLog("translation disabled for guild");
    return { success: false, error: "translation_disabled" };
  }

  debugLog("translation enabled, calling AI");

  try {
    const result = await generateDeepSeekResponse({
      systemPrompt: TRANSLATION_SYSTEM_PROMPT.replace(
        /TARGET_LANGUAGE/g,
        targetLang,
      ),
      messages: [
        { role: "user", content: targetLang + "\n\n" + messageContent },
      ],
      maxTokens: 1024,
      temperature: 0.3,
    });

    const translation = result?.text || null;
    if (!translation) {
      debugLog("AI returned empty response, refunding");
      await refundAiCredits(guildId, 1);
      return { success: false, error: "ai_empty_response" };
    }

    debugLog("AI translation received, consuming credit");
    await consumeAiCredits(guildId, userId, 1, "translation");
    return { success: true, translation: translation.trim(), targetLang };
  } catch (err) {
    debugLog("AI call failed, refunding", { error: err.message });
    await refundAiCredits(guildId, 1).catch(() => {});
    return { success: false, error: err.message || "ai_failure" };
  }
}

module.exports = {
  translateMessage,
  getLangFromFlag,
  normalizeFlagEmoji,
  canSendCreditError,
};
