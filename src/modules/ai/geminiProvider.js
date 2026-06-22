"use strict";

require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");

const DEFAULT_MODEL = process.env.AI_DEFAULT_MODEL || "gemini-2.5-flash-lite";
const FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL || "gemini-2.0-flash";
const COMPLEX_MODEL = process.env.AI_COMPLEX_MODEL || "gemini-2.5-pro";

function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing from environment variables.");
  }

  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });
}

function isModelNotFoundError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("404") ||
    message.includes("not found") ||
    message.includes("not supported")
  );
}

/**
 * Call Gemini with fallback model support
 * @param {object} options
 * @param {string} options.systemInstruction - System instructions for the AI
 * @param {array} options.messages - Chat history [{role: 'user'|'model', parts: [{text: string}]}]
 * @param {string} options.userPrompt - Current user question
 * @param {boolean} options.complexMode - Use pro model if true
 * @param {function} options.onChunk - Optional streaming callback
 * @param {number} options.maxOutputTokens - Max response length
 * @returns {Promise<{text: string, modelUsed: string}>}
 */
async function callGemini({
  systemInstruction,
  messages = [],
  userPrompt,
  complexMode = false,
  onChunk = null,
  maxOutputTokens = 2048,
}) {
  try {
    const ai = getGeminiClient();

    const modelsToTry = complexMode
      ? [COMPLEX_MODEL, DEFAULT_MODEL, FALLBACK_MODEL]
      : [DEFAULT_MODEL, FALLBACK_MODEL];

    let lastError = null;

    for (const model of modelsToTry) {
      try {
        // Build contents from history + current prompt
        const contents = [
          ...messages.map((msg) => ({
            role: msg.role === "model" ? "model" : "user",
            parts: [{ text: msg.parts[0].text }],
          })),
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ];

        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            maxOutputTokens,
            temperature: 0.7,
            topP: 0.9,
            topK: 40,
          },
        });

        let text = response.text || "No response generated.";

        // Trim if too long
        if (text.length > 6000) {
          text =
            text.substring(0, 6000) +
            "\n\n[Response trimmed for Discord. Ask a follow-up for more detail.]";
        }

        return {
          text,
          modelUsed: model,
        };
      } catch (error) {
        lastError = error;
        console.error(
          `[Gemini] Failed using model ${model}:`,
          error?.message || error,
        );

        // If it's a model not found error, try next model
        if (!isModelNotFoundError(error)) {
          // Other error (quota, API key, etc.) - don't try fallback
          break;
        }
      }
    }

    // All models failed
    console.error("[Gemini] All models failed. Last error:", lastError);

    // Handle specific errors
    const errorMsg = String(
      lastError?.message || lastError || "",
    ).toLowerCase();

    if (errorMsg.includes("api key") || errorMsg.includes("authentication")) {
      return {
        text: "Discore AI encountered an authentication error. Please contact the bot administrator.",
        modelUsed: "none",
      };
    }

    if (errorMsg.includes("quota") || errorMsg.includes("limit")) {
      return {
        text: "Discore AI is temporarily unavailable due to usage limits. Please try again later.",
        modelUsed: "none",
      };
    }

    return {
      text: "Discore AI could not complete this request right now. Please try again shortly.",
      modelUsed: "none",
    };
  } catch (error) {
    console.error("[Gemini] Fatal error:", error);
    return {
      text: "Discore AI is currently disabled. The bot administrator needs to configure the AI system.",
      modelUsed: "none",
    };
  }
}

module.exports = {
  callGemini,
};
