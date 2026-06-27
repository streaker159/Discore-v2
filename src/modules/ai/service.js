"use strict";

const prisma = require("../../lib/prisma");
const { generateDeepSeekResponse } = require("./providers/deepseekProvider");
const { canUseAi, consumeAiCredits } = require("../premium/service");

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Discore AI, a playful but responsible gaming assistant inside a Discord bot.

Your job is to help with strategy games, Discord community management, scoreboards, suggestions, alliance planning, events, moderation wording, and game-related advice.

You are friendly, tactical, and slightly cheeky. You may use light humour, but stay PG and respectful.

You must not provide hateful, racist, sexual, abusive, extremist, illegal, real-world harmful, or non-PG content.

If a user asks for trouble, harassment, hate, illegal actions, or anything unsafe, refuse briefly with humour:
"I'm your gaming helper, not your troublemaker 😂"

For game advice, be specific, practical, and structured. Avoid generic filler.

When game/wiki context is provided, use it as the source of truth. If you are unsure, say so.

For strategy-game advice, prefer sections:
- Situation
- Best Move
- Next Steps
- Risks
- Units / Economy
- Quick Commander Note

Response style: be direct, witty, use "commander" occasionally, avoid walls of text, keep it Discord-friendly.
Never use emojis excessively. Never be mean. Never cross into NSFW, hate, or real-world harm.`;

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
  // Check AI gate
  const gate = await canUseAi(guildId, userId, 1);
  if (!gate.ok) {
    await message.reply({ content: gate.message }).catch(() => {});
    return;
  }

  await message.channel.sendTyping().catch(() => {});

  const messages = [{ role: "user", content: content }];
  if (replyContext) {
    messages.unshift({ role: "user", content: replyContext });
  }

  try {
    const res = await generateDeepSeekResponse({
      systemPrompt: SYSTEM_PROMPT,
      messages,
      maxTokens: 1024,
      temperature: 0.7,
    });

    const replyText =
      res.text?.slice(0, 1900) ||
      "Hmm, my tactical computer fizzled. Try again, commander.";
    await message.reply({ content: replyText }).catch(() => {});

    await consumeAiCredits(guildId, userId, 1, "BOT_MENTION").catch(() => {});
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

  const messages = [{ role: "user", content: userContent }];
  if (extraContext) {
    messages.unshift({ role: "user", content: extraContext });
  }

  try {
    const res = await generateDeepSeekResponse({
      systemPrompt: SYSTEM_PROMPT,
      messages,
      maxTokens: 1200,
      temperature: 0.7,
    });

    await consumeAiCredits(guildId, userId, 1, "ASK_COMMAND").catch(() => {});

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
  SYSTEM_PROMPT,
};
