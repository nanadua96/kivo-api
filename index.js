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
import { Message } from './message.model.js';

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
    // if (data.guestSessionId) {
    //   const conversation = await Conversation.findOne({
    //     guestSessionId: data.guestSessionId,
    //   }).exec();

    //   if (conversation) {
    //     conversation.user = user._id;
    //     conversation.guestSessionId = undefined;
    //     await conversation.save();
    //   }
    // }

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
      .select({ email: 1, name: 1 })
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
    const {
      conversationId = 'new',
      model,
      message,
      sessionHistory = [],
    } = req.body;

    let history = sessionHistory;

    if (!message)
      return res.status(400).json({ error: 'Message input is required' });

    const userId = req.session.userId;

    //! USE TRANSACTIONS

    if (conversationId !== 'new') {
      if (userId)
        history = await Message.find({
          conversation: conversationId,
          user: userId,
        }).lean();

      const formattedHistory = history
        ? history.map((entry) => ({
            type: entry.role === 'assistant' ? 'model_output' : 'user_input',
            content: [{ type: 'text', text: entry.content }],
          }))
        : [];

      const input = [
        ...formattedHistory,
        { type: 'user_input', content: [{ type: 'text', text: message }] },
      ];

      const interaction = await ai.interactions.create({ model, input });

      const reply = interaction.output_text;

      await Message.create([
        {
          role: 'user',
          content: message,
          conversation: conversationId,
          user: userId,
          model,
        },
        {
          role: 'assistant',
          content: reply,
          conversation: conversationId,
          user: userId,
          model,
        },
      ]);

      return res.json({ role: 'assistant', content: reply });
    }

    if (conversationId === 'new') {
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
            text: "Give me a title for this chat. Keep it casual. Don't let it be more than 80 characters. If you have multple choices, pick the shorter version.",
          },
        ],
      });

      const interaction1 = await ai.interactions.create({ model, input });

      const title = interaction1.output_text;

      const createdConversation = await Conversation.create({
        model,
        title,
        user: userId,
      });

      await Message.create([
        {
          content: message,
          conversation: createdConversation._id,
          role: 'user',
          user: userId,
          model,
        },
        {
          content: reply,
          conversation: createdConversation._id,
          role: 'assistant',
          user: userId,
          model,
        },
      ]);

      return res.json({
        chatId: createdConversation._id,
        title,
        role: 'assistant',
        content: reply,
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
  //! ADD PAGINATION
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  try {
    const { userId } = req.session;

    const conversations = await Conversation.find(
      { user: userId, pinned: false, status: 'active' },
      'title',
    )
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

app.get('/api/chats/:id/messages', async (req, res) => {
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  try {
    const { userId } = req.session;
    const { id } = req.params;

    const isActive = await Conversation.exists({
      _id: id,
      user: userId,
      status: 'active',
    }).lean();

    if (!isActive) return res.json([]);

    const messages = await Message.find({
      conversation: id,
      user: userId,
    })
      .sort({ createdAt: 1 })
      .lean();

    return res.json(messages);
  } catch (error) {
    console.error(`[${req.url}] error:`, error);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    });
  }
});

app.delete('/api/chats/:id', async (req, res) => {
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  const userId = req.session?.userId;

  const { id } = req.params;

  try {
    const converstaion = await Conversation.findOne({
      _id: id,
      user: userId,
      status: 'active',
    }).exec();

    if (!converstaion)
      return res.status(500).json({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Something went wrong.',
      });

    converstaion.status = 'deleted';

    await converstaion.save();

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

app.post('/api/chats/delete/all', async (req, res) => {
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  const userId = req.session.userId;

  try {
    await Conversation.updateMany(
      { user: userId },
      { status: 'deleted' },
    ).exec();
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

app.post('/api/chats/:conversationId/rename', async (req, res) => {
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  const { conversationId } = req.params;
  const userId = req.session.userId;

  const { title } = req.body; //! VALIDTAE

  try {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      user: userId,
      status: 'active',
    }).exec();

    if (!conversation)
      return res.status(500).json({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Something went wrong.',
      });

    conversation.title = title;

    await conversation.save();

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

app.post('/api/chats/:chatId/pin', async (req, res) => {
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  const { userId } = req.session;

  const { chatId } = req.params;

  //! LIMIT BY 10 OR 5
  try {
    const chat = await Conversation.findOne({
      _id: chatId,
      user: userId,
    }).exec();

    // if (!chat) return res.send() //! ADD THIS

    chat.pinned = !chat.pinned;

    await chat.save();

    return res.send({
      pinned: chat.pinned,
    });
  } catch (error) {
    console.error(`[${req.url}] error:`, error);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    });
  }
});

app.post('/api/chats/pinned', async (req, res) => {
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  const { userId } = req.session;

  try {
    const pinned = await Conversation.find(
      { user: userId, pinned: true },
      'title',
    ).exec();

    return res.json(pinned);
  } catch (error) {
    console.error(`[${req.url}] error:`, error);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    });
  }
});

app.post('/api/messages/:id/feedback', async (req, res) => {
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  try {
    const { id } = req.params;
    const { userId } = req.session;
    const { rating } = req.body;

    const message = await Message.findOne({
      _id: id,
      user: userId,
      role: 'assistant',
    }).exec();

    if (!message) return res.send('Not found!'); //! FIX

    message.feedback.rating = rating;
    message.feedback.updatedAt = Date.now();

    await message.save();

    return res.json();
  } catch (error) {
    console.error(`[${req.url}] error:`, error);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    });
  }
});

//! NO AUTH
app.patch('/api/messages/:id/edit', async (req, res) => {
  try {
    const { id } = req.params;

    const { model, message, createdAt, sessionHistory = [] } = req.body;

    let history = sessionHistory;

    if (!message)
      return res.status(400).json({ error: 'Message input is required' });

    const userId = req.session.userId;

    //! USE TRANSACTIONS

    if (userId) {
      const msgs = await Message.find({
        conversation: id,
        user: userId,
        createdAt: { $lte: createdAt },
        role: 'user',
      }).lean();

      if (!msgs) return res.send('NOT FOUND!!');

      history = msgs;
    }

    // return res.json(history);

    // if (userId)
    //   history = await Message.find({ conversation: id, user: userId }).lean();

    const formattedHistory = history
      ? history.map((entry) => ({
          type: entry.role === 'assistant' ? 'model_output' : 'user_input',
          content: [{ type: 'text', text: entry.content }],
        }))
      : [];

    const input = [
      ...formattedHistory,
      { type: 'user_input', content: [{ type: 'text', text: message }] },
    ];

    const interaction = await ai.interactions.create({ model, input });

    const reply = interaction.output_text;

    await Message.deleteMany({
      conversation: id,
      user: userId,
      createdAt: { $gte: createdAt },
    });

    await Message.create([
      {
        role: 'user',
        content: message,
        conversation: id,
        user: userId,
      },
      {
        role: 'assistant',
        content: reply,
        conversation: id,
        user: userId,
      },
    ]);

    return res.json({
      role: 'assistant',
      text: reply,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error(`[${req.url}] error:`, error);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    });
  }
});

app.post('/api/messages/:id/regenerate', async (req, res) => {
  try {
    const { id } = req.params;

    const { sessionHistory = [], conversationId } = req.body;

    let history = sessionHistory;

    let model = '';
    let message = '';
    let createdAt = '';

    const userId = req.session.userId;

    //! USE TRANSACTIONS

    if (userId) {
      const msg = await Message.findOne({
        _id: id,
        conversation: conversationId,
        user: userId,
        role: 'user',
      }).lean();

      // console.log('LHLKHWEKWHEPOWUEPO', msg);

      if (!msg) return res.send('NOT FOUND!!');

      // return res.send('');

      model = msg.model;
      message = msg.message;
      createdAt = msg.createdAt;

      history = await Message.find({
        conversation: conversationId,
        user: userId,
        createdAt: { $lte: createdAt },
        role: 'user',
      }).lean();
    }

    // return res.json(history);

    // if (userId)
    //   history = await Message.find({ conversation: id, user: userId }).lean();

    const formattedHistory = history
      ? history.map((i) => ({
          type: i.role === 'assistant' ? 'model_output' : 'user_input',
          content: [{ type: 'text', text: i.content }],
        }))
      : [];

    const input = [...formattedHistory];

    // return res.json(input);

    const interaction = await ai.interactions.create({
      model,
      input,
    });

    const reply = interaction.output_text;

    await Message.deleteMany({
      conversation: conversationId,
      user: userId,
      createdAt: { $gte: createdAt },
    });

    await Message.create([
      {
        role: 'user',
        content: message,
        conversation: conversationId,
        user: userId,
      },
      {
        role: 'assistant',
        content: reply,
        conversation: conversationId,
        user: userId,
      },
    ]);

    return res.json({
      role: 'assistant',
      text: reply,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error(`[${req.url}] error:`, error);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    });
  }
});

app.patch('/api/users', async (req, res) => {
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  const { name } = req.body; //! USE ZOD OR SCHEMA VALIDATOR
  const userId = req.session.userId;

  try {
    const user = await User.findById(userId).exec();
    if (user.name) user.name = name;
    await user.save();
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

app.post('/api/users/deactivate', async (req, res) => {
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  const userId = req.session.userId;

  try {
    const user = await User.findById(userId).exec();

    user.deletedAt = Date.now();
    user.deletedUser.email = user.email;

    user.email = `deleted-${Math.random() * 1000}@kivo.com`; //! FIX

    await user.save();

    // Log person out
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction failed:', err);
        return res.status(500).json({ message: 'Logout failed' });
      }

      return res.send();
    });
  } catch (error) {
    console.error(`[${req.url}] error:`, error);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    });
  }
});

app.post('/api/users/change-email', async (req, res) => {
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  const { userId } = req.session;
  const { newEmail } = req.body;

  try {
    const user = await User.findById(userId).exec();

    if (newEmail === user.email)
      return res.status(400).send('duplicate email!');

    user.email = newEmail;

    //! HANDLE if email was found on another account
    //! Send security alert

    await user.save();

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

app.post('/api/users/change-password', async (req, res) => {
  if (!req.session?.userId) return res.send('You need to be authenticated!');

  const { userId } = req.session;

  const { newPassword } = req.body;

  try {
    const user = await User.findById(userId).exec();

    const hashedPassword = await argon2.hash(newPassword);

    user.hash = hashedPassword;

    //! Send security alert

    await user.save();

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

app.listen(PORT, HOST, () => {
  console.log(`Server started!`);
});
