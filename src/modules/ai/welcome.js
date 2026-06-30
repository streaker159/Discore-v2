"use strict";

const { canUseAi, consumeAiCredits } = require("../premium/service");
const { generateDeepSeekResponse } = require("./providers/deepseekProvider");
const prisma = require("../../lib/prisma");

// ── Rate limiting for welcome messages ─────────────────────────────────
const welcomeCounters = new Map(); // key: guildId, value: { count, windowStart }
const WELCOME_RATE_WINDOW = 10 * 60 * 1000; // 10 minutes
const MAX_WELCOMES_PER_WINDOW = 5;

function checkWelcomeRateLimit(guildId) {
  const now = Date.now();
  let entry = welcomeCounters.get(guildId);
  if (!entry || now - entry.windowStart > WELCOME_RATE_WINDOW) {
    entry = { count: 0, windowStart: now };
    welcomeCounters.set(guildId, entry);
  }
  if (entry.count >= MAX_WELCOMES_PER_WINDOW) {
    return { allowed: false };
  }
  entry.count++;
  return { allowed: true };
}

// ── Welcome system prompt ──────────────────────────────────────────────
const WELCOME_SYSTEM_PROMPT = `You write short Discord welcome messages for a server.
Mention the new member exactly as USER_MENTION and include the server name exactly as SERVER_NAME.
Keep it under 240 characters. Make it friendly, varied, sometimes lightly funny, sometimes neutral.
Sometimes use military/strategy/gaming themed welcomes (but keep it appropriate for a gaming server).
Do not include offensive jokes, politics, slurs, adult content, or private information requests.
Do not ping everyone or here. Do not mention random roles.
Do not invent server rules.
Return only the welcome message. Nothing else.`;

// ── Fallback templates (no AI credits consumed) ────────────────────────
const FALLBACK_TEMPLATES = [
  "Welcome USER_MENTION to SERVER_NAME 👋 Glad to have you here!",
  "USER_MENTION just joined SERVER_NAME — welcome aboard!",
  "Hey USER_MENTION, welcome to SERVER_NAME! Make yourself at home.",
];

function getFallbackWelcome(userMention, serverName) {
  const template =
    FALLBACK_TEMPLATES[Math.floor(Math.random() * FALLBACK_TEMPLATES.length)];
  return template
    .replace("USER_MENTION", userMention)
    .replace("SERVER_NAME", serverName);
}

// ── Main welcome generation ────────────────────────────────────────────

/**
 * Generate an AI welcome message for a new member.
 * Returns { success, message } or { success: false, skipped: true, reason }.
 */
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

  // Check welcome is enabled
  const premium = await prisma.guildPremium.findUnique({
    where: { guildId },
    select: { aiWelcomeEnabled: true },
  });
  if (!premium || !premium.aiWelcomeEnabled) {
    return { success: false, skipped: true, reason: "welcome_disabled" };
  }

  // Rate limit check
  const rateCheck = checkWelcomeRateLimit(guildId);
  if (!rateCheck.allowed) {
    return { success: false, skipped: true, reason: "rate_limited" };
  }

  // Build prompt
  const userPrompt = `USER_MENTION: ${userMention}\nSERVER_NAME: ${serverName}`;

  try {
    const result = await generateDeepSeekResponse({
      systemPrompt: WELCOME_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 120,
      temperature: 0.9, // Higher temperature for variety
    });

    const message = result?.choices?.[0]?.message?.content || null;
    if (!message) {
      return { success: false, skipped: true, reason: "ai_empty_response" };
    }

    // Clean up the message
    let cleanMessage = message.trim();
    // Strip quotes if the AI wrapped it
    if (
      (cleanMessage.startsWith('"') && cleanMessage.endsWith('"')) ||
      (cleanMessage.startsWith("'") && cleanMessage.endsWith("'"))
    ) {
      cleanMessage = cleanMessage.slice(1, -1);
    }
    // Ensure it's not too long
    if (cleanMessage.length > 400) {
      cleanMessage = cleanMessage.substring(0, 397) + "...";
    }

    // Consume credit on success
    await consumeAiCredits(guildId, userId, 1, "welcome");

    return { success: true, message: cleanMessage };
  } catch (err) {
    // AI failure — no credit consumed since canUseAi only checks, doesn't deduct
    return {
      success: false,
      skipped: true,
      reason: "ai_failure",
      fallback: getFallbackWelcome(userMention, serverName),
    };
  }
}

module.exports = { generateWelcome, getFallbackWelcome, checkWelcomeRateLimit };
