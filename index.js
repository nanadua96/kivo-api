import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import helmet from 'helmet';
import session from 'express-session';
import z from 'zod';
import argon2 from 'argon2';
import mongoose from 'mongoose';
import { User } from './user.model.js';
import MongoStore from 'connect-mongo';
import { Conversation } from './conversation.model.js';
import morgan from 'morgan';

const app = express();

const ai = new GoogleGenAI({});

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
}

main().catch((err) => console.log(err));

// Constants
const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());

app.use(helmet());

app.use(morgan('dev'));

app.set('trust proxy', 1);

app.use(
  cors({
    origin: ['http://127.0.0.1:4000', 'https://kivo-web-vqiz.onrender.com'],
    credentials: true,
  }),
);

app.use(
  session({
    name: 'connect.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
    }),
    cookie: {
      path: '/',
      httpOnly: true,
      // domain:
      //   process.env.NODE_ENV === 'production' ? 'onrender.com' : undefined,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
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
      guestSessionId: z.string().optional(),
    });

    const { data, success } = schema.safeParse(req.body);

    if (!success)
      return res.status(400).json({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid credentials.',
      });

    const exist = await User.exists({ email: data.email });

    if (exist)
      return res.status(409).json({
        statusCode: 409,
        error: 'Conflict',
        message: 'Account already exists.',
      });

    const hashedPassword = await argon2.hash(data.password);

    const createdUser = await User.create({
      name: data.name,
      hash: hashedPassword,
      email: data.email,
    });

    req.session.userId = createdUser._id;

    // Check if user has unsaved conversation
    if (data.guestSessionId) {
      const conversation = await Conversation.findOne({
        guestSessionId: data.guestSessionId,
      }).exec();

      if (conversation) {
        conversation.user = createdUser._id;
        conversation.guestSessionId = undefined;
        await conversation.save();
      }
    }

    return res.status(201).send();
  } catch (error) {
    console.error(`[${req.url}] error:`, error);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const loginSchema = z.object({
      email: z.email(),
      password: z.string(),
      guestSessionId: z.string().optional(),
    });

    const { success, data } = loginSchema.safeParse(req.body);

    if (!success)
      return res.status(400).json({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Please provide a valid email address and password.',
      });

    const user = await User.findOne({ email: data.email }).lean();

    if (!user)
      return res.status(400).json({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid email or password.',
      });

    const isValidPassword = await argon2.verify(user.hash, data.password);

    if (!isValidPassword)
      return res.status(400).json({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid email or password.',
      });

    req.session.userId = user._id;

    // Check if user has unsaved conversation
    if (data.guestSessionId) {
      const conversation = await Conversation.findOne({
        guestSessionId: data.guestSessionId,
      }).exec();

      if (conversation) {
        conversation.user = user._id;
        conversation.guestSessionId = undefined;
        await conversation.save();
      }
    }

    return res.send();
  } catch (error) {
    console.error(`[${req.url}] error:`, error);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
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
    const { chatId = 'new', model, message, guestSessionId } = req.body;

    let history = [];

    if (!message)
      return res.status(400).json({ error: 'Message input is required' });

    const userId = req.session.userId;

    //! if not authed, make guestSessionId required!

    //! FIX: PREVENT CREATING AN EXISTING CONVO

    if (chatId !== 'new') {
      history = userId
        ? await Conversation.findOne({ _id: chatId, user: userId }).exec()
        : await Conversation.findOne({ guestSessionId }).exec();

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
      // Avoid duplicates if guest
      if (!userId) {
        const checkConvo = await Conversation.exists({ guestSessionId });

        if (checkConvo)
          return res.status(409).json({
            statusCode: 409,
            error: 'Conflict',
            message: 'A conversation already exists for this guest session.',
          });
      }

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
            text: "Give me a title for this chat. It's for a LLM chat app. Don't let it be more than 80 characters. If you have multple choices, pick the shorter version",
          },
        ],
      });

      const interaction1 = await ai.interactions.create({ model, input });

      const title = interaction1.output_text;

      const created = await Conversation.create({
        title,
        user: userId,
        guestSessionId,
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
    console.error(`[${req.url}] error:`, error);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    });
  }
});

app.get('/api/chats', async (req, res) => {
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  try {
    const { userId } = req.session;

    const conversations = await Conversation.find({ user: userId }, 'title')
      .sort({ updatedAt: -1 })
      .lean();

    return res.json(conversations);
  } catch (error) {
    console.error(`[${req.url}] error:`, error);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    });
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

app.get('/api/chats/:conversationId', async (req, res) => {
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  try {
    const { userId } = req.session;
    const { conversationId } = req.params;

    const conversations = await Conversation.findOne({
      _id: conversationId,
      user: userId,
    }).lean();

    return res.json(conversations.messages);
  } catch (error) {
    console.error(`[${req.url}] error:`, error);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    });
  }
});

app.delete('/api/chats/:conversationId', async (req, res) => {
  const userId = req.session?.userId;

  const { conversationId } = req.params;
  const { guestSessionId } = req.query;

  try {
    //! ADD  NOT FOUND ERROR
    // If user id authenticated
    if (userId)
      await Conversation.deleteOne({
        _id: conversationId,
        user: userId,
      }).lean();
    else
      await Conversation.deleteOne({
        _id: conversationId,
        guestSessionId,
      }).lean();

    return res.send();
  } catch (error) {
    console.error(`[${req.url}] error:`, error);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    });
  }
});

// // Error handler
// app.use((err, req, res, _next) => {
//   console.error('Request failed:', err);

//   if (res.headersSent) return;

//   res.status(500).json({
//     success: false,
//     message: 'An unexpected server error occurred.',
//   });
// });

app.listen(PORT, HOST, () => {
  console.log(`Server started!`);
});

// Graceful shutdown
//! FIX
// async function closeServer() {
//   app.close(async () => {
//     try {
//       await shutdown();
//       process.exit(0);
//     } catch (error) {
//       console.error('Shutdown error:', error);
//       process.exit(1);
//     }
//   });
// }

// process.on('SIGINT', closeServer);
// process.on('SIGTERM', closeServer);
