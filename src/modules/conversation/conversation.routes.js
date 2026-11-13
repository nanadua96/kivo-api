import mongoose from 'mongoose';
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
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['message'],
          properties: {
            conversationId: { type: 'string' },
            message: { type: 'string', minLength: 1 },
            // model: { type: 'string' },
            temporary: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const {
        conversationId = 'new',
        message,
        // model = 'openai/gpt-oss-20b',
        temporary,
      } = request.body;

      const { userId } = request;

      const model = 'qwen/qwen3.8-27b';

      let messages = [];
      let chatId = conversationId;
      let messageId = null;
      let title;

      if (conversationId === 'new') {
        const titleCompletion = await groq.chat.completions.create({
          model,
          messages: [
            {
              role: 'system',
              content:
                'Create a concise, descriptive title for a conversation based on the user message. Return only the title as plain text, with no quotes or explanation, and keep it under 80 characters.',
            },
            { role: 'user', content: message },
          ],
          stream: false,
          max_tokens: 32,
        });

        const fallbackTitle = message.trim().replace(/\s+/g, ' ').slice(0, 50);

        title =
          titleCompletion.choices[0]?.message?.content
            ?.trim()
            .replace(/^["'`]+|["'`]+$/g, '')
            .replace(/\s+/g, ' ')
            .slice(0, 80) || fallbackTitle;

        const createdConversation = await Conversation.create({
          model,
          title,
          user: userId,
          private: temporary,
        });

        const result = await Message.create([
          {
            content: message,
            conversation: createdConversation._id,
            role: 'user',
            user: userId,
            model,
            sequence: 1,
            status: 'complete',
          },
          {
            conversation: createdConversation._id,
            role: 'assistant',
            user: userId,
            model,
            sequence: 2,
          },
        ]);

        chatId = createdConversation._id;
        messageId = result[1]._id;
        messages = [{ role: 'user', content: message }];
      } else {
        const history = await Message.find({
          conversation: conversationId,
          user: userId,
          status: 'complete',
        })
          .sort({ sequence: 1 })
          .select({ _id: 0, role: 1, content: 1, sequence: 1 })
          .lean();

        if (!history.length) return reply.notFound('Conversation not found.');

        const lastMessage = history[history.length - 1];

        const result = await Message.create([
          {
            content: message,
            conversation: chatId,
            role: 'user',
            user: userId,
            model,
            sequence: lastMessage.sequence + 1,
            status: 'complete',
          },
          {
            conversation: chatId,
            role: 'assistant',
            user: userId,
            model,
            sequence: lastMessage.sequence + 2,
          },
        ]);

        messageId = result[1]._id;
        messages = [
          ...history.map(({ role, content }) => ({ role, content })),
          { role: 'user', content: message },
        ];
      }

      const allowedOrigins = ['http://127.0.0.1:3000'];

      const origin = request.headers.origin;

      if (allowedOrigins.includes(origin)) {
        reply.raw.setHeader('Access-Control-Allow-Origin', origin);
        reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
        reply.raw.setHeader('Vary', 'Origin');
      }

      reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no');

      reply.hijack();

      reply.raw.write(
        `data: ${JSON.stringify({
          id: messageId,
          conversationId: chatId,
          ...(title ? { title } : {}),
        })}\n\n`,
      );

      try {
        const completionStream = await groq.chat.completions.create({
          model,
          messages,
          stream: true,
        });

        let fullResponseText = '';

        for await (const chunk of completionStream) {
          const delta = chunk.choices[0]?.delta?.content || '';

          if (delta) {
            fullResponseText += delta;
            reply.raw.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          }
        }

        //////////////////////////////////////////////////////////////////////////////////! SUGGESTIONS CODE
        // let suggestions = [];

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
        //////////////////////////////////////////////////////////////////////////////////! SUGGESTIONS CODE

        await Message.findByIdAndUpdate(messageId, {
          content: fullResponseText,
          status: 'complete',
        });

        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
      } catch (error) {
        fastify.log.error({ err: error }, `[${request.url}] streaming error`);

        if (!reply.raw.writableEnded) {
          reply.raw.write(
            `data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`,
          );
        }

        await Message.findByIdAndUpdate(messageId, { status: 'error' });

        reply.raw.end();
      }
    },
  );

  fastify.patch(
    '/api/v1/messages/:id/edit',
    {
      preHandler: authenticateUser,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['message'],
          properties: {
            message: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { message } = request.body;
      const { userId } = request;

      const currentMessage = await Message.findOne({
        _id: id,
        user: userId,
        role: 'user',
      }).exec();

      if (!currentMessage) return reply.notFound('Message not found.');

      const isActive = await Conversation.exists({
        _id: currentMessage.conversation,
        user: userId,
        status: 'active',
      }).lean();

      if (!isActive) return reply.notFound('Conversation not found.');

      const history = await Message.find({
        conversation: currentMessage.conversation,
        user: userId,
        sequence: { $lt: currentMessage.sequence },
        status: 'complete',
      })
        .sort({ sequence: 1 })
        .select({ _id: 0, role: 1, content: 1 })
        .lean();

      currentMessage.content = message;
      await currentMessage.save();

      await Message.deleteMany({
        conversation: currentMessage.conversation,
        user: userId,
        sequence: { $gt: currentMessage.sequence },
      }).exec();

      const model = 'qwen/qwen3.8-27b';
      const [assistantMessage] = await Message.create([
        {
          conversation: currentMessage.conversation,
          role: 'assistant',
          user: userId,
          model,
          sequence: currentMessage.sequence + 1,
        },
      ]);

      const allowedOrigins = ['http://127.0.0.1:3000'];
      const origin = request.headers.origin;

      if (allowedOrigins.includes(origin)) {
        reply.raw.setHeader('Access-Control-Allow-Origin', origin);
        reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
        reply.raw.setHeader('Vary', 'Origin');
      }

      reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no');

      reply.hijack();

      reply.raw.write(
        `data: ${JSON.stringify({
          id: assistantMessage._id,
          conversationId: currentMessage.conversation,
        })}\n\n`,
      );

      try {
        const completionStream = await groq.chat.completions.create({
          model,
          messages: [
            ...history.map(({ role, content }) => ({ role, content })),
            { role: 'user', content: message },
          ],
          stream: true,
        });

        let fullResponseText = '';

        for await (const chunk of completionStream) {
          const delta = chunk.choices[0]?.delta?.content || '';

          if (delta) {
            fullResponseText += delta;
            reply.raw.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          }
        }

        await Message.findByIdAndUpdate(assistantMessage._id, {
          content: fullResponseText,
          status: 'complete',
        });

        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
      } catch (error) {
        fastify.log.error({ err: error }, `[${request.url}] streaming error`);

        if (!reply.raw.writableEnded) {
          reply.raw.write(
            `data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`,
          );
        }

        await Message.findByIdAndUpdate(assistantMessage._id, {
          status: 'error',
        });

        reply.raw.end();
      }
    },
  );

  fastify.get(
    '/api/v1/conversations',
    { preHandler: authenticateUser },
    async (request, reply) => {
      const { userId } = request;

      const { page, limit } = request.query;

      const pipeline = [
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            status: 'active',
          },
        },
        {
          $sort: {
            date: -1,
            pinned: -1,
          },
        },
        {
          $project: {
            _id: 0,
            id: '$_id',
            title: 1,
            pinned: 1,
          },
        },
      ];

      const conversations = await Conversation.aggregatePaginate(pipeline, {
        page,
        limit,
      });

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

  done();
}
