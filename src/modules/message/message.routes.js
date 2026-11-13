import { authenticateUser } from '../auth/auth.hook.js';
import { Message } from './message.model.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {Object} [options]
 * @param {() => void} done
 * @returns {void}
 */
export default function (fastify, _, done) {
  fastify.post(
    '/api/v1/messages/:id/feedback',
    {
      preHandler: authenticateUser,
    },
    async (request, reply) => {
      const { id } = request.params;

      const { userId } = request;

      const { rating } = request.query;

      const message = await Message.findOne({
        _id: id,
        user: userId,
        role: 'assistant',
      }).exec();

      if (!message) return reply.notFound('Message not found.');

      message.rating = rating;

      await message.save();

      return reply.send();
    },
  );

  done();
}
