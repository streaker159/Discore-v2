async function askDeepSeek({ system, user, maxTokens = 700 }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return 'AI is not connected yet. Add DEEPSEEK_API_KEY to enable live strategy answers.';
  }

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No AI answer returned.';
}

module.exports = { askDeepSeek };
