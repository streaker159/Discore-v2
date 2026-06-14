/**
 * Screenshot parser – uses DeepSeek Vision (or compatible OpenAI-style vision API)
 * to extract player / alliance stats from uploaded game screenshots.
 *
 * Falls back gracefully when no vision API key is available.
 */

const PLAYER_PARSE_SYSTEM = `You are a data-extraction assistant for the strategy game Supremacy: World War 3.
You will be shown one or more screenshots of a player profile and must extract every visible stat.
Return ONLY a raw JSON object – no markdown fences, no extra text.`;

const PLAYER_PARSE_USER = `Extract all visible player stats from these screenshots.
Return a JSON object with these exact keys (use null for anything not visible):
{
  "gameUsername": null,
  "inGameRank": null,
  "allianceName": null,
  "allianceTag": null,
  "level": null,
  "xpCurrent": null,
  "xpMax": null,
  "kdRatio": null,
  "unitsKilled": null,
  "unitsLost": null,
  "provincesTaken": null,
  "provincesLost": null,
  "gamesJoined": null,
  "soloVictories": null,
  "coalitionVictories": null,
  "overallScore": null,
  "overallRank": null,
  "economicRank": null,
  "militaryRank": null,
  "memberSince": null,
  "lastOnline": null,
  "playedOnPC": null,
  "playedOnMobile": null
}`;

const ALLIANCE_PARSE_SYSTEM = `You are a data-extraction assistant for the strategy game Supremacy: World War 3.
You will be shown one or more screenshots of an alliance profile and must extract every visible stat.
Return ONLY a raw JSON object – no markdown fences, no extra text.`;

const ALLIANCE_PARSE_USER = `Extract all visible alliance stats from these screenshots.
Return a JSON object with these exact keys (use null for anything not visible):
{
  "name": null,
  "tag": null,
  "description": null,
  "rank": null,
  "elo": null,
  "wins": null,
  "losses": null,
  "members": null,
  "maxMembers": null,
  "country": null,
  "founded": null
}`;

async function callVisionAPI(systemPrompt, userPrompt, imageUrls) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  const model = process.env.DEEPSEEK_VISION_MODEL || "deepseek-chat";

  // Build multi-modal content array
  const contentParts = [
    { type: "text", text: userPrompt },
    ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contentParts },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? "";

    // Strip any accidental markdown fences
    const cleaned = raw
      .replace(/```(?:json)?/gi, "")
      .replace(/```/g, "")
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

async function parsePlayerScreenshots(imageUrls) {
  if (!imageUrls?.length) return null;
  return callVisionAPI(PLAYER_PARSE_SYSTEM, PLAYER_PARSE_USER, imageUrls);
}

async function parseAllianceScreenshots(imageUrls) {
  if (!imageUrls?.length) return null;
  return callVisionAPI(ALLIANCE_PARSE_SYSTEM, ALLIANCE_PARSE_USER, imageUrls);
}

module.exports = { parsePlayerScreenshots, parseAllianceScreenshots };
