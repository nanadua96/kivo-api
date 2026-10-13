import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/ping', (_, res) => res.send('pong'));

app.post('/api/chat', async (req, res) => {
  const { messages, model = 'gemini-2.5-flash' } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`;

  return res.send('Hello');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
