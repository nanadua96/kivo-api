import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/ping', (_, res) => res.send('pong'));

function formatMessagesForGemini(messages) {
  return messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));
}

app.post('/api/chat', async (req, res) => {
  const { messages, model = 'gemini-2.5-flash' } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`;

  const geminiPayload = {
    contents: formatMessagesForGemini(messages),
  };

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(geminiPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    res.write(`data: ${JSON.stringify({ error: errorText })}\n\n`);
    return res.end();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ''; // Accumulates data across chunk boundaries

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Append new chunk to the buffer
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');

    // Keep the last item in the buffer if it's an incomplete line
    buffer = lines.pop();

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('data: ')) {
        try {
          const rawData = JSON.parse(trimmedLine.slice(6));
          const textDelta =
            rawData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

          if (textDelta) {
            const normalizedChunk = {
              choices: [
                {
                  delta: { content: textDelta },
                },
              ],
            };
            res.write(`data: ${JSON.stringify(normalizedChunk)}\n\n`);
          }
        } catch (err) {
          // Safe to ignore if a chunk fragment isn't fully formed JSON yet
        }
      }
    }
  }

  res.write('data: [DONE]\n\n');
  res.end();

  return res.send('Hello');
});

app.post('/api/prompt', async (req, res) => {
  try {
    const { messages, model = 'gemini-2.5-flash' } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res
        .status(400)
        .json({ error: 'Invalid or missing messages array.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res
        .status(500)
        .json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    // Gemini standard non-streaming REST endpoint URL
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const geminiPayload = {
      contents: formatMessagesForGemini(messages),
    };

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(geminiPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();

    // Extract text response from Gemini response structure
    const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Send a simple, standard JSON response back to React
    return res.json({
      role: 'assistant',
      content: replyText,
    });
  } catch (error) {
    console.error('Gemini Proxy Error:', error);
    return res.status(500).json({
      error: 'Internal server error while communicating with Gemini.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});
