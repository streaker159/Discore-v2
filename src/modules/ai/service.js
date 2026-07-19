"use strict";

const prisma = require("../../lib/prisma");
const { generateDeepSeekResponse } = require("./providers/deepseekProvider");
const { canUseAi, consumeAiCredits } = require("../premium/service");
const {
  SYSTEM_PROMPT,
  classifyQuestion,
  isDiscoreSelfHelpQuestion,
  STAT_HEAVY_TYPES,
} = require("./personality");

// ─── Short-term memory: stores last question per user+channel (5 min TTL) ─────
const pendingQuestions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingQuestions) {
    if (now - v.time > 300000) pendingQuestions.delete(k);
  }
}, 60000);

function isLikelyGameQuestionText(text) {
  const message = String(text || "");
  const explicitGameTerms =
    /\b(con|conflict of nations|call of war|cow|supremacy|s1914|iron order|io|ww3)\b/i;
  const gameDomainTerms =
    /\b(unit|units|hp|damage|range|cost|infantry|tank|naval|aircraft|submarine|missile|doctrine|research|build|building|troop|troops|coalition|alliance|commander)\b/i;
  const militaryContextTerms =
    /\b(attack|defense|army|war|battle|nation|country)\b/i;
  const statOnlyTerms = /\b(stat|stats|speed)\b/i;

  return (
    explicitGameTerms.test(message) ||
    gameDomainTerms.test(message) ||
    (militaryContextTerms.test(message) && statOnlyTerms.test(message))
  );
}

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

  // ── CONVERSATION MEMORY ──────────────────────────────────────────
  const {
    getContextString,
    isCorrectionMessage,
    isGameSelectorAnswer,
    addTurn: addMemoryTurn,
  } = require("./conversationMemory");

  const contextStr = getContextString({ guildId, channelId, userId });
  const isCorrection = isCorrectionMessage(userMsg);
  const isGameAnswer = isGameSelectorAnswer(userMsg);

  // ── SELF-HELP DETECTION ───────────────────────────────────────
  // Must run BEFORE game routing to avoid asking "which game?" for bot-help Qs
  // If the user is correcting us ("no, not the game"), treat as self-help
  if (isDiscoreSelfHelpQuestion(userMsg) || isCorrection) {
    const promptContext = contextStr
      ? `Recent conversation history:\n${contextStr}\n\nUse this context. If the previous answer was wrong, briefly acknowledge and correct it. Do not repeat the same clarification if the user already corrected it.\n\nUser message: ${userMsg}`
      : `The user is asking about me (Discore Official). Give a helpful, funny, self-aware answer.\n\nUser message: ${userMsg}`;

    await message.channel.sendTyping().catch(() => {});
    try {
      const res = await generateDeepSeekResponse({
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content: promptContext }],
        maxTokens: 800,
        temperature: 0.8,
      });
      const replyText =
        res.text?.slice(0, 1900) ||
        "I know I am amazing, but my processor fizzled. Ask again?";

      // Store our reply in memory
      const sent = await message.reply({ content: replyText }).catch(() => {});
      if (sent) {
        addMemoryTurn({
          guildId,
          channelId,
          userId,
          role: "assistant",
          content: replyText.substring(0, 200),
          messageId: sent.id,
          intent: "self_help",
        });
      }
      await consumeAiCredits(guildId, userId, 1, "BOT_MENTION").catch(() => {});
    } catch (_) {
      await message
        .reply({ content: "⚠️ AI unavailable. Try again." })
        .catch(() => {});
    }
    return;
  }

  // Detect game from message
  let detectedGame = null;
  try {
    const {
      resolveGameKey,
      getWikiSource,
    } = require("../gameData/wikiSources");
    detectedGame = resolveGameKey(userMsg);
  } catch (_) {}

  // Detect if it's a unit/game question. Keep this conservative so general
  // real-world questions like "speed of light" do not get forced into game routing.
  const isLikelyGameQuestion = isLikelyGameQuestionText(userMsg);

  // If user only said a game name (reply to "which game?"), look up stored question
  const sessionKey = `${userId}:${channelId}`;
  if (detectedGame && !isLikelyGameQuestion) {
    const stored = pendingQuestions.get(sessionKey);
    if (stored) {
      pendingQuestions.delete(sessionKey);
      // Reconstruct: use stored question with detected game
      const fullQuestion = `Game: ${detectedGame}\nOriginal question: ${stored.question}`;
      const gate2 = await canUseAi(guildId, userId, 1);
      if (!gate2.ok) {
        await message.reply({ content: gate2.message }).catch(() => {});
        return;
      }
      await message.channel.sendTyping().catch(() => {});
      let ctx = "";
      try {
        const { buildAiUnitContext } = require("../gameData/unitLookupService");
        ctx = (await buildAiUnitContext(detectedGame, stored.question)) || "";
      } catch (_) {}
      const gi = require("../gameData/wikiSources").getWikiSource(detectedGame);
      const sp =
        SYSTEM_PROMPT +
        `\n\nYou are answering for: ${gi.displayName}. Use the VERIFIED UNIT DATABASE CONTEXT as source of truth for unit stats.`;
      const msgs = [
        { role: "user", content: `User asked: ${stored.question}` },
      ];
      if (ctx) msgs.unshift({ role: "user", content: ctx });
      try {
        const msgsWithContext = contextStr
          ? [
              ...msgs,
              { role: "user", content: `Recent conversation:\n${contextStr}` },
            ]
          : msgs;
        const res = await generateDeepSeekResponse({
          systemPrompt: sp,
          messages: msgsWithContext,
          maxTokens: 1024,
          temperature: 0.7,
        });
        const replyText = res.text?.slice(0, 1900) || "...";
        const sent = await message
          .reply({ content: replyText })
          .catch(() => {});
        if (sent) {
          addMemoryTurn({
            guildId,
            channelId,
            userId,
            role: "assistant",
            content: replyText.substring(0, 200),
            messageId: sent.id,
            intent: "game",
          });
        }
        await consumeAiCredits(guildId, userId, 1, "BOT_MENTION").catch(
          () => {},
        );
      } catch (_) {
        await message
          .reply({ content: "⚠️ AI unavailable. Try again." })
          .catch(() => {});
      }
      return;
    }
  }

  if (!detectedGame && isLikelyGameQuestion) {
    // Store question for follow-up
    pendingQuestions.set(sessionKey, { question: userMsg, time: Date.now() });
    await message
      .reply({
        content:
          "Which game are you asking about, commander? Reply like this:\n`@Discore CON` or `@Discore Call of War`\n\n🟢 **Conflict of Nations** (WW3 / CON)\n🔴 **Call of War 1942** (COW)\n🟡 **Supremacy 1914** (S1914)\n⚙️ **Iron Order 1919** (IO)",
      })
      .catch(() => {});
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
  const gameInfo = detectedGame
    ? require("../gameData/wikiSources").getWikiSource(detectedGame)
    : null;
  const systemPrompt = detectedGame
    ? SYSTEM_PROMPT +
      `\n\nYou are answering for: ${gameInfo.displayName}. Use the VERIFIED UNIT DATABASE CONTEXT above as the source of truth for unit stats.${modeNote}`
    : SYSTEM_PROMPT + modeNote;

  const messages = [{ role: "user", content: content }];
  if (replyContext) messages.unshift({ role: "user", content: replyContext });
  if (extraContext) messages.unshift({ role: "user", content: extraContext });

  try {
    const msgsWithContext = contextStr
      ? [
          ...messages,
          { role: "user", content: `Recent conversation:\n${contextStr}` },
        ]
      : messages;
    const res = await generateDeepSeekResponse({
      systemPrompt,
      messages: msgsWithContext,
      maxTokens: 1024,
      temperature: 0.7,
    });

    const replyText =
      res.text?.slice(0, 1900) ||
      "Hmm, my tactical computer fizzled. Try again, commander.";
    const sent = await message.reply({ content: replyText }).catch(() => {});
    if (sent) {
      addMemoryTurn({
        guildId,
        channelId,
        userId,
        role: "assistant",
        content: replyText.substring(0, 200),
        messageId: sent.id,
        intent: "general",
      });
    }

    try {
      await consumeAiCredits(guildId, userId, 1, "BOT_MENTION");
    } catch (creditErr) {
      console.error(
        "[Discore Mention AI] consumeAiCredits failed:",
        creditErr.message,
      );
    }
  } catch (err) {
    await message
      .reply({
        content:
          "⚠️ Discore AI is having a tactical coffee break. Try again in a moment.",
      })
      .catch(() => {});
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
  isLikelyGameQuestionText,
  classifyQuestion,
  isDiscoreSelfHelpQuestion,
  STAT_HEAVY_TYPES,
  SYSTEM_PROMPT,
};
