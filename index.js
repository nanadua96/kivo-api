import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import helmet from 'helmet';
import session from 'express-session';
import z from 'zod';
import argon2 from 'argon2';
import mongoose, { isValidObjectId } from 'mongoose';
import { User } from './user.model.js';
import MongoStore from 'connect-mongo';
import { History } from './chat.model.js';

const app = express();

const redis = () => {};

const ai = new GoogleGenAI({});

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');
}

main().catch((err) => console.log(err));

// Constants
const HOST = process.env.HOST || 'http://127.0.0.1';
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());

app.use(helmet());

app.use(
  cors({
    origin: ['http://127.0.0.1:4000'],
    credentials: true,
  }),
);

app.use(
  session({
    name: 'connect.sid',
    secret: process.env.SESSION_SECRET || 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
    }),
    cookie: {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
    },
  }),
);

// Routes
app.get('/ping', (_, res) => res.send('pong'));

app.post('/api/register', async (req, res) => {
  try {
    const schema = z.object({
      name: z.string(),
      password: z.string(),
      email: z.email(),
    });

    const result = schema.safeParse(req.body);

    if (!result.success)
      return res.status(400).json({ message: 'invalid shit' });

    const exist = await User.exists({ email: result.data.email });

    if (exist) return res.status(409).send('Duplicate account');

    const hashedPassword = await argon2.hash(result.data.password);

    const createdUser = await User.create({
      name: result.data.name,
      hash: hashedPassword,
      createdAt: new Date().toISOString(),
      email: result.data.email,
    });

    req.session.userId = createdUser._id;

    return res.send();
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: 'Error!',
    });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const schema = z.object({
      email: z.email(),
      password: z.string(),
    });

    const result = schema.safeParse(req.body);

    if (!result.success)
      return res.status(400).json({ message: 'invalid shit' });

    const user = await User.findOne({ email: result.data.email }).lean();

    if (!user) return res.status(400).json({ message: 'Really?' });

    const isValidPassword = await argon2.verify(
      user.hash,
      result.data.password,
    );

    if (!isValidPassword) return res.status(400).json({ message: 'Really?' });

    req.session.userId = user._id;

    return res.send();
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: 'Error!',
    });
  }
});

app.get('/api/logout', async (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction failed:', err);
      return res.status(500).json({ message: 'Logout failed' });
    }

    return res.send();
  });
});

function errorResponse({ code = 500, message = 'Something went wrong' }) {
  let error = 'Internal Server Error';

  if (code === 401) error = 'Unauthorized';

  return {
    statusCode: code,
    error,
    message,
  };
}
app.get('/api/me', async (req, res) => {
  try {
    if (!req.session?.userId)
      return res.status(401).json(
        errorResponse({
          code: 401,
          message: 'You need to be authenticated to access this route.',
        }),
      );

    const { userId } = req.session;

    const user = await User.findById(userId)
      .select({ password: 0, __v: 0 })
      .lean();

    if (!user) return res.send('User not found!');

    return res.send(user);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: 'Error!' });
  }
});

app.post('/api/chats', async (req, res) => {
  try {
    const { chatId, model, message } = req.body;

    let history = [];

    if (!message)
      return res.status(400).json({ error: 'Message input is required' });

    const userId = req.session.userId;

    if (chatId !== 'new' && isValidObjectId(chatId)) {
      history = await History.findOne({ _id: chatId, user: userId }).exec();

      const formattedHistory = history
        ? history.messages.map((entry) => ({
            type: entry.role === 'assistant' ? 'model_output' : 'user_input',
            content: [{ type: 'text', text: entry.text }],
          }))
        : [];

      const input = [
        ...formattedHistory,
        { type: 'user_input', content: [{ type: 'text', text: message }] },
      ];

      const interaction = await ai.interactions.create({ model, input });

      const reply = interaction.output_text;

      history.messages.push({
        role: 'user',
        text: message,
        timestamp: new Date(),
      });

      history.messages.push({
        role: 'assistant',
        text: reply,
        timestamp: new Date(),
      });

      await history.save();

      return res.json({
        role: 'assistant',
        text: reply,
        timestamp: new Date(),
      });
    }

    if (chatId === 'new') {
      const input = [
        { type: 'user_input', content: [{ type: 'text', text: message }] },
      ];

      const interaction = await ai.interactions.create({ model, input });

      const reply = interaction.output_text;

      // Get title
      input.push({
        type: 'model_output',
        content: [{ type: 'text', text: message }],
      });

      input.push({
        type: 'user_input',
        content: [
          {
            type: 'text',
            text: 'Give me a title for this chat. Its for a LLM chat app. Dont let it be more than 80 characters',
          },
        ],
      });

      const interaction1 = await ai.interactions.create({
        model,
        input: input,
      });

      const title = interaction1.output_text;

      const created = await History.create({
        title,
        user: userId,
        messages: [
          {
            role: 'user',
            text: message,
            timestamp: new Date(),
          },
          {
            role: 'assistant',
            text: reply,
            timestamp: new Date(),
          },
        ],
      });

      return res.json({
        chatId: created._id,
        title,
        role: 'assistant',
        text: reply,
        timestamp: new Date(),
      });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/chats', async (req, res) => {
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  try {
    const { userId } = req.session;

    const history = await History.find({ user: userId }, 'title').lean();

    return res.json(history);
  } catch (error) {
    console.log(error);

    return res.send('Eroor!');
  }
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Request failed:', err);

  if (res.headersSent) return;

  res.status(500).json({
    success: false,
    message: 'An unexpected server error occurred.',
  });
});

app.get('/api/chats/:chatId', async (req, res) => {
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  try {
    const { userId } = req.session;
    const { chatId } = req.params;

    const history = await History.findOne({ _id: chatId, user: userId }).lean();

    return res.json(history.messages);
  } catch (error) {
    console.log(error);
    return res.send('Eroor!');
  }
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Request failed:', err);

  if (res.headersSent) return;

  res.status(500).json({
    success: false,
    message: 'An unexpected server error occurred.',
  });
});

app.listen(PORT, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});

// Graceful shutdown
async function shutdown() {
  try {
    await new Promise((resolve) => {
      app.close?.(resolve);
      resolve();
    });
    await redis.quit();
  } catch (error) {
    console.error('Shutdown error:', error);
    process.exitCode = 1;
  }
}

async function closeServer() {
  server.close(async () => {
    try {
      await shutdown();
      process.exit(0);
    } catch (error) {
      console.error('Shutdown error:', error);
      process.exit(1);
    }
  });
}

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
