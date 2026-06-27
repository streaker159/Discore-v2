"use strict";

const DEEPSEEK_BASE =
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

async function generateDeepSeekResponse({
  systemPrompt,
  messages = [],
  maxTokens = 1024,
  temperature = 0.7,
}) {
  if (!DEEPSEEK_KEY) {
    throw new Error("DeepSeek API key not configured.");
  }

  const formatted = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: formatted,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("RATE_LIMIT");
      if (res.status === 401) throw new Error("AUTH_ERROR");
      throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || "";
    const usage = json.usage || {};

    return {
      text: content,
      model: json.model || DEEPSEEK_MODEL,
      usage: {
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
      },
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("TIMEOUT");
    throw err;
  }
}

module.exports = { generateDeepSeekResponse };
