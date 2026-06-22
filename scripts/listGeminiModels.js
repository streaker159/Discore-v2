"use strict";

require("dotenv").config();

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ Missing GEMINI_API_KEY in .env");
    process.exit(1);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;

  console.log("🔍 Fetching available Gemini models...\n");

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Failed to list models:", data);
      process.exit(1);
    }

    const models = data.models || [];

    console.log(`✅ Found ${models.length} models:\n`);

    for (const model of models) {
      const modelName = model.name.replace("models/", "");
      const methods = (model.supportedGenerationMethods || []).join(", ");

      console.log(`📦 ${modelName}`);
      console.log(`   Methods: ${methods || "none"}`);
      console.log("");
    }

    console.log("\n💡 Recommended models for Discore:");
    console.log("   - gemini-2.5-flash-lite (fast, budget)");
    console.log("   - gemini-2.0-flash (fallback)");
    console.log("   - gemini-2.5-pro (complex questions)");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();
