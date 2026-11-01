import argon2 from 'argon2';
import { User } from '../user/user.model.js';
import { createUser } from '../user/user.service.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {Object} [options]
 * @param {() => void} done
 * @returns {void}
 */
export default function (fastify, _, done) {
  fastify.post(
    '/api/v1/auth/signup',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'email', 'password'],
          additionalProperties: false,
          properties: {
            name: {
              type: 'string',
              minLength: 2,
              maxLength: 50,
            },
            email: {
              type: 'string',
              format: 'email',
              maxLength: 254,
            },
            password: {
              type: 'string',
              // minLength: 8,
              maxLength: 128,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await createUser(request.body);

      request.session.user = { id: user._id };

      return reply.code(201).send();
    },
  );

  fastify.post('/api/v1/auth/login', async (request, reply) => {
    const { email, password } = request.body;

    const user = await User.findOne({ email }).lean();

    if (!user) return reply.badRequest('Invalid email or password.');

    const isValidPassword = await argon2.verify(user.passwordHash, password);

    if (!isValidPassword) reply.badRequest('Invalid email or password.');

    request.session.user = { id: user._id };
  });

  fastify.get('/api/v1/auth/logout', async (request, reply) => {
    await request.session.destroy();
    return reply.send();
  });

  fastify.get('/api/v1/auth/me', async (request, reply) => {
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

  done();
}
