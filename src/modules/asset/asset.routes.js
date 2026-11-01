import { authenticateUser } from '../auth/auth.hook.js';
import { createUploadUrls } from './asset.service.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {Object} [options]
 * @param {() => void} done
 * @returns {void}
 */
export default function (fastify, _, done) {
  fastify.post(
    '/api/v1/asset/presign',
    {
      preHandler: authenticateUser,
    },
    async (request, reply) => {
      const files = request.body;

      const userId = request.session.user.id;

      const result = await createUploadUrls(files, userId);

      if (!result.success) return reply.badRequest(result.error);

      return reply.send(result.data);
    },
  );

  done();
}
