"use strict";

const {
  canUseAi,
  consumeAiCredits,
  refundAiCredits,
} = require("../premium/service");
const { generateDeepSeekResponse } = require("./providers/deepseekProvider");
const prisma = require("../../lib/prisma");

// ── Flag-to-language map ──────────────────────────────────────────────
const FLAG_LANG = new Map([
  ["🇬🇧", "English"],
  ["🇺🇸", "English"],
  ["🇦🇺", "English"],
  ["🇨🇦", "English"],
  ["🇫🇷", "French"],
  ["🇩🇪", "German"],
  ["🇪🇸", "Spanish"],
  ["🇮🇹", "Italian"],
  ["🇵🇹", "Portuguese"],
  ["🇧🇷", "Portuguese"],
  ["🇳🇱", "Dutch"],
  ["🇵🇱", "Polish"],
  ["🇺🇦", "Ukrainian"],
  ["🇷🇺", "Russian"],
  ["🇹🇷", "Turkish"],
  ["🇸🇦", "Arabic"],
  ["🇯🇵", "Japanese"],
  ["🇰🇷", "Korean"],
  ["🇨🇳", "Chinese"],
  ["🇹🇼", "Chinese"],
  ["🇮🇳", "Hindi"],
  ["🇮🇩", "Indonesian"],
  ["🇵🇭", "Filipino/Tagalog"],
  ["🇹🇭", "Thai"],
  ["🇻🇳", "Vietnamese"],
]);

function getLangFromFlag(emoji) {
  return FLAG_LANG.get(emoji) || null;
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
  targetFlag,
}) {
  const targetLang = getLangFromFlag(targetFlag);
  if (!targetLang) return { success: false, error: "unsupported_flag" };

  const gate = await canUseAi(guildId, userId, 1);
  if (!gate.ok) return { success: false, error: gate.reason || "ai_blocked" };

  const premium = await prisma.guildPremium.findUnique({
    where: { guildId },
    select: { aiTranslationEnabled: true },
  });
  if (!premium?.aiTranslationEnabled)
    return { success: false, error: "translation_disabled" };

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
      await refundAiCredits(guildId, 1);
      return { success: false, error: "ai_empty_response" };
    }
    await consumeAiCredits(guildId, userId, 1, "translation");
    return { success: true, translation: translation.trim(), targetLang };
  } catch (err) {
    await refundAiCredits(guildId, 1).catch(() => {});
    return { success: false, error: err.message || "ai_failure" };
  }
}

module.exports = {
  translateMessage,
  getLangFromFlag,
  canSendCreditError,
  FLAG_LANG,
};
