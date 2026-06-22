# Discore AI - Multi-Game Gemini Strategy Advisor

A highly optimized, multi-game AI advisor module for Discore bot, providing expert strategy advice for Bytro/Stillfront grand strategy games.

## 🎮 Supported Games

- **Conflict of Nations** - Modern military strategy
- **Call of War** - WW2 grand strategy
- **Supremacy 1914** - WWI grand strategy (English)
- **Supremacy 1914 FR** - WWI grand strategy (French)
- **Iron Order 1919** - Alternate history strategy

## 🚀 Features

- ✅ **Multi-game support** with dynamic wiki fetching
- ✅ **Budget-optimized** - Uses `gemini-2.0-flash-lite` by default
- ✅ **Smart model selection** - Automatically uses pro model for complex questions
- ✅ **Wiki-grounded responses** - Fetches real data from Fandom wikis
- ✅ **Low memory footprint** - Safe for 512MB cloud hosts
- ✅ **Jailbreak resistant** - Strict scope enforcement
- ✅ **Session management** - Low-RAM chat history (max 3 messages)
- ✅ **Streaming support** - Efficient response delivery
- ✅ **Security hardened** - Off-topic detection, prompt validation

## 📦 Installation

```bash
npm install @google/genai
```

## ⚙️ Configuration

Add to your `.env` file:

```env
GEMINI_API_KEY=your_api_key_here
AI_DEFAULT_MODEL=gemini-2.0-flash-lite
AI_COMPLEX_MODEL=gemini-2.0-flash-exp
```

## 📖 Usage

### Basic Usage

```javascript
const { askDiscoreAI } = require("./modules/ai/strategyAdvisor");

const result = await askDiscoreAI(
  "What should I focus on as Germany on day 3?", // User's question
  "call_of_war", // Game key
  "channel-123456", // Session ID
);

if (result.ok) {
  console.log(result.answer);
  console.log("Model used:", result.modelUsed);
  console.log("Wiki pages:", result.pagesUsed);
}
```

### With Options

```javascript
const result = await askDiscoreAI(
  "Compare Western vs Eastern doctrine",
  "conflict_of_nations",
  "user-789",
  {
    complexMode: true, // Force pro model
    onChunk: (text) => {
      // Streaming callback
      process.stdout.write(text);
    },
    maxContextChars: 20000, // Custom context limit
  },
);
```

## 🎯 Game Keys

| Game                | Key                   |
| ------------------- | --------------------- |
| Conflict of Nations | `conflict_of_nations` |
| Call of War         | `call_of_war`         |
| Supremacy 1914 (EN) | `supremacy_1914_en`   |
| Supremacy 1914 (FR) | `supremacy_1914_fr`   |
| Iron Order 1919     | `iron_order_1919`     |

## 🔒 Security Features

### Jailbreak Protection

- Detects and blocks prompt injection attempts
- Ignores instructions embedded in wiki text
- Never reveals API keys or system prompts

### Off-Topic Detection

- Rejects coding/homework requests
- Blocks harmful content generation
- Stays strictly within game mechanics

### Input Validation

- Max prompt length: 2,000 characters
- Validates game keys
- Sanitizes wiki content

## 🧠 How It Works

1. **Validation** - Checks prompt and game key
2. **Page Selection** - Routes to relevant wiki pages based on keywords
3. **Wiki Fetching** - Retrieves content from Fandom MediaWiki API
4. **Context Building** - Cleans and trims wiki text (max 15KB)
5. **Model Selection** - Budget or pro model based on complexity
6. **System Instructions** - Builds strict scope guidelines
7. **Session Context** - Loads recent chat history (last 3 messages)
8. **AI Call** - Streams response from Gemini
9. **History Update** - Stores trimmed conversation

## 📊 Response Format

```javascript
{
  ok: true,                           // Success status
  answer: "Based on the wiki...",     // AI response
  modelUsed: "gemini-2.0-flash-lite", // Model name
  gameKey: "call_of_war",             // Game identifier
  gameName: "Call of War",            // Human-readable name
  pagesUsed: ["Units", "Strategy"],   // Successfully fetched pages
  pagesFailed: [],                    // Failed page fetches
  contextFound: true                  // Whether wiki context was retrieved
}
```

## 🧪 Testing

Run the test suite:

```bash
node src/modules/ai/testExamples.js
```

Tests include:

- Valid strategy questions
- Off-topic rejection
- Jailbreak attempts
- Complex mode
- Invalid game keys
- All supported games

## 📝 Module Structure

```
src/modules/ai/
├── strategyAdvisor.js    # Main entry point
├── geminiProvider.js     # Gemini API client
├── wikiFetcher.js        # Wiki content fetcher
├── pageRouter.js         # Keyword-to-page mapping
├── sessionManager.js     # Low-RAM session storage
├── testExamples.js       # Test suite
├── service.js            # Legacy credit system
└── deepseekClient.js     # Legacy DeepSeek client
```

## 🔧 Discord Integration

Example slash command integration:

```javascript
const { askDiscoreAI } = require("../modules/ai/strategyAdvisor");

// In your command handler
async execute(interaction) {
  const game = interaction.options.getString("game");
  const question = interaction.options.getString("question");
  const complex = interaction.options.getBoolean("complex") || false;

  await interaction.deferReply();

  const result = await askDiscoreAI(
    question,
    game,
    interaction.channelId,
    { complexMode: complex }
  );

  if (result.ok) {
    await interaction.editReply({
      content: result.answer,
      ephemeral: false
    });
  } else {
    await interaction.editReply({
      content: result.answer,
      ephemeral: true
    });
  }
}
```

## 💾 Memory Optimization

- **No global wiki cache** - Wiki text exists only in function scope
- **Capped session history** - Max 3 message pairs per session
- **TTL cleanup** - Sessions expire after 30 minutes
- **Max sessions** - Limits total sessions to 100
- **Response trimming** - Caps output at 6-8KB
- **Context truncation** - Limits wiki content to 15KB

## 🎛️ Environment Variables

| Variable           | Default                 | Description       |
| ------------------ | ----------------------- | ----------------- |
| `GEMINI_API_KEY`   | Required                | Google AI API key |
| `AI_DEFAULT_MODEL` | `gemini-2.0-flash-lite` | Budget model      |
| `AI_COMPLEX_MODEL` | `gemini-2.0-flash-exp`  | Pro model         |

## ⚡ Performance

- **Budget mode**: ~1-2 seconds per request
- **Complex mode**: ~3-5 seconds per request
- **Memory**: <50MB for 100 active sessions
- **Wiki fetch**: ~500ms-2s with 10s timeout
- **Session cleanup**: Auto every 10 minutes

## 🛡️ Error Handling

All errors are caught and return safe fallback messages:

- Wiki fetch failures → Try fallback pages
- Gemini API errors → User-friendly error message
- Invalid inputs → Clear validation messages
- No crashes → Always returns structured response

## 📚 API Reference

### `askDiscoreAI(prompt, gameKey, sessionId, options)`

**Parameters:**

- `prompt` (string) - User's question
- `gameKey` (string) - Game identifier
- `sessionId` (string) - Unique session ID (channelId/userId)
- `options` (object) - Optional configuration
  - `complexMode` (boolean) - Force pro model
  - `onChunk` (function) - Streaming callback
  - `maxContextChars` (number) - Max wiki context

**Returns:** Promise<object> - Response with answer and metadata

## 🤝 Contributing

When adding new games:

1. Add wiki URL to `wikiFetcher.js`
2. Add keyword routing in `pageRouter.js`
3. Update game keys in this README
4. Add test case in `testExamples.js`

## 📄 License

Part of Discore V2 - Discord strategy bot framework
