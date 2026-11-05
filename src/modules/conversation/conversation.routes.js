import { groq } from '../../lib/index.js';
import { authenticateUser } from '../auth/auth.hook.js';
import { Message } from '../message/message.model.js';
import { Conversation } from './conversation.model.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {Object} [options]
 * @param {() => void} done
 * @returns {void}
 */
export default function (fastify, _, done) {
  fastify.post(
    '/api/v1/conversations',
    {
      preHandler: authenticateUser,
      schema: {},
    },
    async (request, reply) => {
      try {
        const {
          conversationId = 'new',
          model,
          message,
          messages = [],
          temporary = false,
        } = request.body;

        const { userId } = request;

        //! UNAUTHED USER
        if (!userId) {
          const assistantResponses = messages.filter(
            (i) => i.role === 'assistant',
          );

          const UNAUTH_LIMIT = 3;
          // console.log(assistantResponses);

          if (assistantResponses.length > UNAUTH_LIMIT)
            return reply.badRequest(
              'You’ve reached the free chat limit. Sign in or create an account to continue chatting.',
            );

          const chatCompletion = await groq.chat.completions.create({
            messages,
            model: 'openai/gpt-oss-120b',
            stream: false,
          });

          const assistantReply =
            chatCompletion.choices[0]?.message?.content || '';

          return reply.send({ role: 'assistant', content: assistantReply });
        }

        if (temporary) {
          //! CHECK IF array has at least 1 role="user". DO THIS CHECK FOR UNAUTHED USERS too
          if (!messages.length)
            return reply.badRequest(
              'Provide at least one message. Messages required for temporary',
            );

          const chatCompletion = await groq.chat.completions.create({
            messages,
            model: 'openai/gpt-oss-120b',
            stream: false,
          });

          const assistantReply =
            chatCompletion.choices[0]?.message?.content || '';

          //! ADD SUGGESTIONS

          return res.json({ role: 'assistant', content: assistantReply });
        }

        //! USE TRANSACTIONS
        if (!message) return reply.badRequest('Message input is required');

        if (conversationId !== 'new') {
          const history = await Message.find({
            conversation: conversationId,
            user: userId,
          })
            .select({ _id: 0, role: 1, content: 1 })
            .lean();

          const messages = [...history, { role: 'user', content: message }];

          const chatCompletion = await groq.chat.completions.create({
            messages,
            model: 'openai/gpt-oss-120b',
            stream: false,
          });

          const assistantReply =
            chatCompletion.choices[0]?.message?.content || '';

          await Message.create([
            {
              role: 'user',
              content: message,
              conversation: conversationId,
              user: userId,
            },
            {
              role: 'assistant',
              content: assistantReply,
              conversation: conversationId,
              user: userId,
              model,
            },
          ]);

          //! ADD SUGGESTIONS

          return reply.send({
            role: 'assistant',
            content: assistantReply,
          });
        }

        if (conversationId === 'new') {
          const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: message }],
            model: 'openai/gpt-oss-120b',
            stream: false,
          });

          const assistantReply =
            chatCompletion.choices[0]?.message?.content || '';

          const chatCompletion2 = await groq.chat.completions.create({
            messages: [
              { role: 'user', content: message },
              // { role: 'assistant', content: assistantReply },
              {
                role: 'user',
                content:
                  'Give this chat a casual title under 80 characters. Return plain text only, no line breaks, no special characters. Choose the shortest option if there are multiple.',
              },
            ],
            model: 'openai/gpt-oss-120b',
            stream: false,
          });

          const title = chatCompletion2.choices[0]?.message?.content || '';

          // Store in db
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
              content: assistantReply,
              conversation: createdConversation._id,
              role: 'assistant',
              user: userId,
              model,
            },
          ]);

          let suggestions = [];

          // const chatCompletion3 = await groq.chat.completions.create({
          //   messages: [
          //     { role: 'user', content: message },
          //     // { role: 'assistant', content: assistantReply },
          //     {
          //       role: 'user',
          //       content:
          //         // 'Give me 3 suggestions for this chat. Return result in an json array. If no result, return an empty json array. Dont put in code block. just the raw json',
          //         "Give me 3 suggestions for this chat as a raw JSON array. If there are none, return an empty array. Don't use a code block.",
          //     },
          //   ],
          //   model: 'openai/gpt-oss-120b',
          //   stream: false,
          // });

          // const result = chatCompletion3.choices[0]?.message?.content;
          // suggestions = JSON.parse(result);

          // console.log(JSON.parse(result));

          return reply.send({
            conversationId: createdConversation._id,
            title,
            role: 'assistant',
            content: assistantReply,
            suggestions,
          });
        }
      } catch (error) {
        console.error(`[${request.url}] error:`, error);
        return reply.internalServerError('Something went wrong.');
      }
    },
  );

  fastify.get(
    '/api/v1/conversations',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const { userId } = request;

      const conversations = await Conversation.find({
        user: userId,
        status: 'active',
      })
        .select({ _id: 0, id: '$_id', title: 1, pinned: 1 })
        .sort({ updatedAt: -1, pinned: 1 })
        .lean();

      return reply.send(conversations);
    },
  );

  fastify.get(
    '/api/v1/conversations/:id/messages',
    {
      preHandler: authenticateUser,
      schema: {},
    },
    async (request, reply) => {
      const { userId } = request;

      const { id } = request.params;

      const isActive = await Conversation.exists({
        _id: id,
        user: userId,
        status: 'active',
      }).lean();

      if (!isActive) return reply.send([]);

      const messages = await Message.find({ conversation: id, user: userId })
        .sort({ createdAt: 1 })
        .select({
          _id: 0,
          id: '$_id',
          role: 1,
          content: 1,
          model: 1,
          rating: 1,
          createdAt: 1,
        })
        .lean();

      return reply.send(messages);
    },
  );

  fastify.delete(
    '/api/v1/conversations/:id',
    {
      preHandler: authenticateUser,
      schema: {},
    },
    async (request, reply) => {
      const { userId } = request;

      const { id } = request.params;

      const converstaion = await Conversation.findOne({
        _id: id,
        user: userId,
        status: 'active',
      }).exec();

      if (!converstaion) return reply.notFound('Conversation not found.');

      converstaion.status = 'deleted';

      await converstaion.save();

      return reply.send();
    },
  );

  fastify.post(
    '/api/v1/conversations/delete/all',
    {
      preHandler: authenticateUser,
      schema: {},
    },
    async (request, reply) => {
      const { userId } = request;

      await Conversation.deleteMany({ user: userId }).exec();
      await Message.deleteMany({ user: userId }).exec();

      return reply.send();
    },
  );

  fastify.post(
    '/api/v1/conversations/:id/rename',
    {
      preHandler: authenticateUser,
      schema: {},
    },
    async (request, reply) => {
      const { id } = request.params;

      const { userId } = request;

      const { title } = request.body;

      const conversation = await Conversation.findOne({
        _id: id,
        user: userId,
        status: 'active',
      }).exec();

      if (!conversation) return reply.notFound('Conversation not found.');

      conversation.title = title;

      await conversation.save();

      return reply.send();
    },
  );

  fastify.post(
    '/api/v1/conversations/:id/pin',
    {
      preHandler: authenticateUser,
      schema: {},
    },
    async (request, reply) => {
      const { userId } = request;

      const { id } = request.params;

      //! LIMIT BY 10 OR 5

      const conversation = await Conversation.findOne({
        _id: id,
        user: userId,
      }).exec();

      if (!conversation) return reply.notFound('Conversation not found.');

      conversation.pinned = !conversation.pinned;

      await conversation.save();

      return reply.send({ pinned: conversation.pinned });
    },
  );

  ////////////////////////////////////////////////////////////////////////! STREAMING
  fastify.post('/api/chat/stream', async (req, res) => {
    const { chatId, message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // 1. Set headers required for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Optional: Disable compression for proxies that buffer SSE streams
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      // 2. Request streaming completion from Groq
      const completionStream = await groq.chat.completions.create({
        model: 'openai/gpt-oss-20b',
        messages: [{ role: 'user', content: message }],
        stream: true,
      });

      let fullResponseText = '';

      // 3. Iterate over async iterable chunks from Groq
      for await (const chunk of completionStream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullResponseText += delta;
          // Format as standard SSE data packet
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
      }

      // 4. Signal stream completion to the frontend
      res.write('data: [DONE]\n\n');
      res.end();

      // 5. Save the complete accumulated response to MongoDB asynchronously
      // await Message.create({
      //   chatId: chatId || null,
      //   role: 'assistant',
      //   content: fullResponseText,
      //   createdAt: new Date(),
      // });
    } catch (error) {
      console.error('Groq streaming error:', error);
      // If headers haven't been sent yet, send a standard JSON error
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to generate stream response' });
      } else {
        // If stream already started, push an error event down the pipe
        res.write(
          `data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`,
        );
        res.end();
      }
    }
  });

  done();
}
