"use strict";

const prisma = require("../../lib/prisma");
const { generateDeepSeekResponse } = require("./providers/deepseekProvider");
const { canUseAi, consumeAiCredits } = require("../premium/service");

// ─── System Prompt ────────────────────────────────────────────────────────────

// Short-term memory: stores last question per user+channel (5 min TTL)
const pendingQuestions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingQuestions) {
    if (now - v.time > 300000) pendingQuestions.delete(k);
  }
}, 60000);

// ─── Question classifier ──────────────────────────────────────────────────────

const STAT_HEAVY_TYPES = ["UNIT_STATS", "UNIT_COMPARE", "DETECTION_RANGE", "STEALTH_DETECTION", "RESOURCE_COST", "BUILD_TIME", "TERRAIN_STATS"];

function classifyQuestion(text) {
  const lower = text.toLowerCase();
  if (/detect.*stealth|stealth.*detect|stealth.*range|reveal.*stealth|stealth.*reveal/i.test(lower)) return "STEALTH_DETECTION";
  if (/detect.*range|detection.*range|radar.*range|sight.*range/i.test(lower)) return "DETECTION_RANGE";
  if (/compare.*vs|vs\b.*\bvs|better.*or|which.*better|difference.*between/i.test(lower)) return "UNIT_COMPARE";
  if (/stat|stats|hp\b|health|damage|speed|range\b|attack\b|defense/i.test(lower)) return "UNIT_STATS";
  if (/cost|price|resource|supplies|manpower|build.*time|production.*time/i.test(lower)) return "RESOURCE_COST";
  if (/terrain|mountain|jungle|desert|forest.*bonus|terrain.*modifier/i.test(lower)) return "TERRAIN_STATS";
  if (/counter|weak.*against|strong.*against|what.*beats|how.*kill/i.test(lower)) return "UNIT_COUNTER";
  if (/patch|update|update.*log|change.*log|new.*update/i.test(lower)) return "PATCH_OR_UPDATE";
  if (/strategy|opening|build order|rush|turtle|expand|invade/i.test(lower)) return "GENERAL_STRATEGY";
  return "GENERAL_STRATEGY";
}

const SYSTEM_PROMPT = `You are Discore AI — a smart, cheeky, and genuinely helpful mate inside a Discord server. Talk like someone in a gaming lobby or at the pub: casual, funny when it fits, but always useful.

=== WHO YOU ARE ===
- Friendly, witty, slightly cheeky. Not a corporate bot.
- Can joke, laugh at small disasters, and roast lightly when appropriate.
- Encourages people after mistakes. Practical fixes, not just jokes.
- Talks like a real person. Short and punchy by default. Bullets when useful.
- Not rude, cruel, hateful, or genuinely insulting. PG-safe for Discord.
- Use emojis sparingly — one or two when it adds flavour, not every message.
- Ask follow-up questions only when genuinely needed.
- Confident but honest. Never invent facts.

=== REAL-WORLD CONVERSATION ===
You CAN talk about real-world topics: news, tech, gaming, history, science, culture, Discord, life stuff, general chat. Do NOT force every question into a game context.

If asked about current/breaking news:
- Answer naturally from what you know.
- If live data is unavailable, say so honestly: "I'd need live news access for the latest on that, otherwise I'm just guessing."
- Do NOT invent breaking news or pretend to have live information.

=== GAME QUESTIONS ===
If the user clearly asks about a specific game (Conflict of Nations, Call of War, Supremacy 1914, Iron Order), stay inside that game. Do not mix real-world military/politics into game advice unless explicitly asked.

If the user says something like "Italy day one" without naming a game, ask which game.

=== FAILURE HANDLING ===
When someone messes up:
1. Lightly acknowledge the pain (a joke is fine).
2. Explain what likely happened.
3. Give a practical fix.
4. Encourage them.

Example: "Yeah mate, that went sideways fast 😂 Here's how we fix it..."

=== CRITICAL RULES FOR UNIT STATS ===
1. NEVER state exact unit stats, ranges, unlock levels, stealth detection values, resource costs, build times, or terrain modifiers unless they come from VERIFIED UNIT DATABASE CONTEXT in the prompt.
2. NEVER invent numbers, fake tables, real-world unit names (F-22, Patriot, etc.), universal claims, or "km" unless the verified database uses it.
3. If VERIFIED UNIT DATABASE CONTEXT is missing: "I don't have verified stats for that yet, so I won't invent numbers." Give general advice only.
4. Stealth detection: depends on unit, level, generation, and target type. Radar range ≠ sight range ≠ stealth reveal range. Never say "all detectors are the same."
5. Database context IS the source of truth. Admit when you don't have the answer.

=== SAFETY ===
No hate, slurs, sexual content, harassment, illegal instructions, or targeted abuse. Cheeky banter is fine; cruelty is not.
If asked for something disallowed: "Nice try, chaos gremlin 😂 Not helping with that."`;

// ─── Discord mention handler ──────────────────────────────────────────────────

async function handleDiscoreMention({
  message,
  client,
  guildId,
  userId,
  channelId,
  content,
  replyContext,
}) {
  const gate = await canUseAi(guildId, userId, 1);
  if (!gate.ok) {
    await message.reply({ content: gate.message }).catch(() => {});
    return;
  }

  // Extract the actual user message
  const userMsg = content.replace(/^User:.*?\nMessage:\s*/i, "").trim();

  // Detect game from message
  let detectedGame = null;
  try {
    const { resolveGameKey, getWikiSource } = require("../gameData/wikiSources");
    detectedGame = resolveGameKey(userMsg);
  } catch (_) {}

  // Detect if it's a unit/game question
  const gameKeywords = /unit|units|stat|stats|hp|damage|speed|range|cost|infantry|tank|naval|aircraft|submarine|missile|doctrine|commander|strategy|nation|country|research|build|building|attack|defense|military|army|war|game|troop|battle|alliance|coalition/i;

  // If user only said a game name (reply to "which game?"), look up stored question
  const sessionKey = `${userId}:${channelId}`;
  if (detectedGame && !gameKeywords.test(userMsg)) {
    const stored = pendingQuestions.get(sessionKey);
    if (stored) {
      pendingQuestions.delete(sessionKey);
      // Reconstruct: use stored question with detected game
      const fullQuestion = `Game: ${detectedGame}\nOriginal question: ${stored.question}`;
      const gate2 = await canUseAi(guildId, userId, 1);
      if (!gate2.ok) { await message.reply({ content: gate2.message }).catch(() => {}); return; }
      await message.channel.sendTyping().catch(() => {});
      let ctx = "";
      try {
        const { buildAiUnitContext } = require("../gameData/unitLookupService");
        ctx = await buildAiUnitContext(detectedGame, stored.question) || "";
      } catch (_) {}
      const gi = require("../gameData/wikiSources").getWikiSource(detectedGame);
      const sp = SYSTEM_PROMPT + `\n\nYou are answering for: ${gi.displayName}. Use the VERIFIED UNIT DATABASE CONTEXT as source of truth for unit stats.`;
      const msgs = [{ role: "user", content: `User asked: ${stored.question}` }];
      if (ctx) msgs.unshift({ role: "user", content: ctx });
      try {
        const res = await generateDeepSeekResponse({ systemPrompt: sp, messages: msgs, maxTokens: 1024, temperature: 0.7 });
        await message.reply({ content: res.text?.slice(0, 1900) || "..." }).catch(() => {});
        await consumeAiCredits(guildId, userId, 1, "BOT_MENTION").catch(() => {});
      } catch (_) {
        await message.reply({ content: "⚠️ AI unavailable. Try again." }).catch(() => {});
      }
      return;
    }
  }

  if (!detectedGame && gameKeywords.test(userMsg)) {
    // Store question for follow-up
    pendingQuestions.set(sessionKey, { question: userMsg, time: Date.now() });
    await message.reply({
      content: "Which game are you asking about, commander? Reply like this:\n`@Discore CON` or `@Discore Call of War`\n\n🟢 **Conflict of Nations** (WW3 / CON)\n🔴 **Call of War 1942** (COW)\n🟡 **Supremacy 1914** (S1914)\n⚙️ **Iron Order 1919** (IO)",
    }).catch(() => {});
    return;
  }

  await message.channel.sendTyping().catch(() => {});

  // Build extra context: always check local verified unit DB first
  let extraContext = "";
  if (detectedGame) {
    try {
      const { buildAiUnitContext } = require("../gameData/unitLookupService");
      const dbCtx = await buildAiUnitContext(detectedGame, userMsg);
      if (dbCtx) extraContext = dbCtx;
    } catch (_) {}
  }

  const qType = classifyQuestion(userMsg);
  const isStatQuestion = STAT_HEAVY_TYPES.includes(qType);
  let modeNote = "";
  if (isStatQuestion) {
    modeNote = `\n\n⚠️ STRICT VERIFIED-DATA MODE: This is a "${qType}" question. You have NO permission to state exact numbers unless they appear in VERIFIED UNIT DATABASE CONTEXT above. If data is missing, say "I don't have verified stats for that yet, commander." Give general advice only. Do NOT invent numbers, unit names, ranges, or tables.`;
  }
  const gameInfo = detectedGame ? require("../gameData/wikiSources").getWikiSource(detectedGame) : null;
  const systemPrompt = detectedGame
    ? SYSTEM_PROMPT + `\n\nYou are answering for: ${gameInfo.displayName}. Use the VERIFIED UNIT DATABASE CONTEXT above as the source of truth for unit stats.${modeNote}`
    : SYSTEM_PROMPT + modeNote;

  const messages = [{ role: "user", content: content }];
  if (replyContext) messages.unshift({ role: "user", content: replyContext });
  if (extraContext) messages.unshift({ role: "user", content: extraContext });

  try {
    const res = await generateDeepSeekResponse({
      systemPrompt,
      messages,
      maxTokens: 1024,
      temperature: 0.7,
    });

    const replyText = res.text?.slice(0, 1900) || "Hmm, my tactical computer fizzled. Try again, commander.";
    await message.reply({ content: replyText }).catch(() => {});

    try {
      await consumeAiCredits(guildId, userId, 1, "BOT_MENTION");
    } catch (creditErr) {
      console.error("[Discore Mention AI] consumeAiCredits failed:", creditErr.message);
    }
  } catch (err) {
    await message.reply({
      content: "⚠️ Discore AI is having a tactical coffee break. Try again in a moment.",
    }).catch(() => {});
    console.error("[Discore Mention AI Error]", err.message);
  }
}

// ─── Answer strategy (used by /ask) ──────────────────────────────────────────

async function answerStrategy({
  guildId,
  userId,
  question,
  gameContext = "",
  extraContext = "",
}) {
  const gate = await canUseAi(guildId, userId, 1);
  if (!gate.ok) return { ok: false, answer: gate.message };

  const userContent = gameContext
    ? `Game: ${gameContext}\n\nQuestion: ${question}`
    : question;

  // Try to inject local verified unit DB context
  let allExtraContext = extraContext || "";
  if (!allExtraContext && gameContext) {
    try {
      const { buildAiUnitContext } = require("../gameData/unitLookupService");
      const { resolveGameKey } = require("../gameData/wikiSources");
      const resolved = resolveGameKey(gameContext);
      if (resolved) {
        const dbCtx = await buildAiUnitContext(resolved, question);
        if (dbCtx) allExtraContext = dbCtx;
      }
    } catch (_) {}
  }

  const qType = classifyQuestion(question);
  const isStatQuestion = STAT_HEAVY_TYPES.includes(qType);
  let modeNote = "";
  if (isStatQuestion) {
    modeNote = `\n\n⚠️ STRICT VERIFIED-DATA MODE: This is a "${qType}" question. You have NO permission to state exact numbers unless they appear in VERIFIED UNIT DATABASE CONTEXT above. If data is missing, say "I don't have verified stats for that yet, commander." Give general advice only. Do NOT invent numbers, unit names, ranges, or tables.`;
  }

  const messages = [{ role: "user", content: userContent }];
  if (allExtraContext) {
    messages.unshift({ role: "user", content: allExtraContext });
  }

  try {
    const res = await generateDeepSeekResponse({
      systemPrompt: SYSTEM_PROMPT + modeNote,
      messages,
      maxTokens: 1200,
      temperature: 0.7,
    });

    try {
      await consumeAiCredits(guildId, userId, 1, "ASK_COMMAND");
    } catch (creditErr) {
      console.error("[Ask AI] consumeAiCredits failed:", creditErr.message);
    }

    return {
      ok: true,
      answer: res.text,
      modelUsed: res.model,
      usage: res.usage,
    };
  } catch (err) {
    console.error("[answerStrategy Error]", err.message);
    if (err.message === "TIMEOUT" || err.message === "RATE_LIMIT") {
      return {
        ok: false,
        answer:
          "⚠️ Discore AI is having a tactical coffee break. Try again in a moment.",
      };
    }
    if (err.message === "AUTH_ERROR") {
      return {
        ok: false,
        answer:
          "⚠️ Discore AI is not configured correctly. The bot owner needs to set up the DeepSeek API key.",
      };
    }
    return {
      ok: false,
      answer:
        "⚠️ Discore AI could not complete this request. Try again shortly.",
    };
  }
}

module.exports = {
  handleDiscoreMention,
  answerStrategy,
  classifyQuestion,
  STAT_HEAVY_TYPES,
  SYSTEM_PROMPT,
};
