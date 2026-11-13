import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../lib/auth.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {Object} [options]
 * @param {() => void} done
 * @returns {void}
 */
export default function (fastify, _, done) {
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      try {
        const url = new URL(request.url, `http://${request.headers.host}`);

        const headers = fromNodeHeaders(request.headers);

        const req = new Request(url.toString(), {
          method: request.method,
          headers,
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        });

        const response = await auth.handler(req);

        reply.status(response.status);

        response.headers.forEach((value, key) => reply.header(key, value));

        return reply.send(response.body ? await response.text() : null);
      } catch (error) {
        fastify.log.error('[better-auth] Authentication Error:');
        console.log(error);
        return reply.internalServerError('Internal authentication error');
      }
    },
  });

  done();
}
