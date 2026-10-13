import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { Groq } from 'groq-sdk';

const groq = new Groq();

const ai = new GoogleGenAI({});

const app = express();

const HOST = process.env.HOST || 'http://127.0.0.1';
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/ping', (_, res) => res.send('pong'));

function formatMessagesForGemini(messages) {
  return messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));
}

app.post('/api/prompt2', async (req, res) => {
  const { model, input } = req.body;

  const interaction = await ai.interactions.create({
    model,
    input,
  });
  //   console.log(interaction.output_text);

  return res.send(interaction.output_text);
});

app.listen(PORT, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
