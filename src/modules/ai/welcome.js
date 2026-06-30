"use strict";

const { canUseAi, consumeAiCredits } = require("../premium/service");
const { generateDeepSeekResponse } = require("./providers/deepseekProvider");
const prisma = require("../../lib/prisma");

// ── Rate limiting ─────────────────────────────────────────────────────
const welcomeCounters = new Map();
const WELCOME_RATE_WINDOW = 10 * 60 * 1000;
const MAX_WELCOMES_PER_WINDOW = 5;

function checkWelcomeRateLimit(guildId) {
  const now = Date.now();
  let entry = welcomeCounters.get(guildId);
  if (!entry || now - entry.windowStart > WELCOME_RATE_WINDOW) {
    entry = { count: 0, windowStart: now };
    welcomeCounters.set(guildId, entry);
  }
  if (entry.count >= MAX_WELCOMES_PER_WINDOW) return { allowed: false };
  entry.count++;
  return { allowed: true };
}

// ── Welcome system prompt ─────────────────────────────────────────────
const WELCOME_SYSTEM_PROMPT = `You write short Discord welcome messages for a server.
Mention the new member exactly as USER_MENTION and include the server name exactly as SERVER_NAME.
Keep it under 240 characters. Make it friendly, welcoming, and natural.
Vary the wording. Sometimes be lightly funny, sometimes simple and warm.
Do NOT use battle, war, soldier, recruit, command, briefing, or military language
unless the server instructions specifically ask for that style.
Do not include offensive jokes, politics, slurs, adult content, or private information requests.
Do not ping @everyone or @here. Do not mention random roles. Do not invent server rules.
Return only the welcome message. Nothing else.`;

// ── Fallback templates ───────────────────────────────────────────────
const FALLBACK_TEMPLATES = [
  "Welcome USER_MENTION 👋 Glad to have you here in SERVER_NAME!",
  "Hey USER_MENTION, welcome to SERVER_NAME! Make yourself at home.",
  "USER_MENTION just joined SERVER_NAME — say hi when you're ready 👋",
  "Welcome aboard USER_MENTION! SERVER_NAME is happy to have you here.",
  "Nice to see you, USER_MENTION 👋 Welcome to SERVER_NAME!",
];

function getFallbackWelcome(userMention, serverName) {
  const template =
    FALLBACK_TEMPLATES[Math.floor(Math.random() * FALLBACK_TEMPLATES.length)];
  return template
    .replace("USER_MENTION", userMention)
    .replace("SERVER_NAME", serverName);
}

// ── Main welcome generation ──────────────────────────────────────────
async function generateWelcome({ guildId, userId, userMention, serverName }) {
  // Check AI access
  const gate = await canUseAi(guildId, userId, 1);
  if (!gate.ok) {
    return {
      success: false,
      skipped: true,
      reason: gate.reason || "ai_blocked",
    };
  }

  // Check welcome is enabled + get instructions
  const premium = await prisma.guildPremium.findUnique({
    where: { guildId },
    select: {
      aiWelcomeEnabled: true,
      aiWelcomeInstructions: true,
    },
  });
  if (!premium || !premium.aiWelcomeEnabled) {
    return { success: false, skipped: true, reason: "welcome_disabled" };
  }

  // Rate limit check
  if (!checkWelcomeRateLimit(guildId).allowed) {
    return { success: false, skipped: true, reason: "rate_limited" };
  }

  // Build prompt with server instructions
  const instructions = premium.aiWelcomeInstructions
    ? `Server welcome instructions: ${premium.aiWelcomeInstructions}\nFollow these instructions for the welcome style.`
    : "No custom server instructions. Use a friendly, fun, general community welcome.";

  const userPrompt = [
    `USER_MENTION: ${userMention}`,
    `SERVER_NAME: ${serverName}`,
    instructions,
  ].join("\n");

  try {
    const result = await generateDeepSeekResponse({
      systemPrompt: WELCOME_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 120,
      temperature: 0.9,
    });

    const message = result?.text || null;
    if (!message) {
      return { success: false, skipped: true, reason: "ai_empty_response" };
    }

    let cleanMessage = message.trim();
    if (
      (cleanMessage.startsWith('"') && cleanMessage.endsWith('"')) ||
      (cleanMessage.startsWith("'") && cleanMessage.endsWith("'"))
    ) {
      cleanMessage = cleanMessage.slice(1, -1);
    }
    if (cleanMessage.length > 400) {
      cleanMessage = cleanMessage.substring(0, 397) + "...";
    }

    await consumeAiCredits(guildId, userId, 1, "welcome");
    return { success: true, message: cleanMessage };
  } catch (err) {
    return {
      success: false,
      skipped: true,
      reason: "ai_failure",
      fallback: getFallbackWelcome(userMention, serverName),
    };
  }
}

module.exports = { generateWelcome, getFallbackWelcome, checkWelcomeRateLimit };
