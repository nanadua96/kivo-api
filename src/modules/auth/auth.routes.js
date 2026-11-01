import argon2 from 'argon2';
import { User } from '../user/user.model.js';
import { createUser } from '../user/user.service.js';
import { authenticateUser } from './auth.hook.js';

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
              maxLength: 250,
            },
            password: {
              type: 'string',
              // minLength: 8,
              maxLength: 128,
            },
          },
        },
        response: {
          201: { type: 'string' },
        },
      },
    },
    async (request, reply) => {
      const user = await createUser(request.body);

      request.session.user = { id: user._id };

      return reply.code(201).send();
    },
  );

  fastify.post(
    '/api/v1/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: {
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
        response: {
          200: {
            type: 'string',
          },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const user = await User.findOne({ email }).lean();

      if (!user) return reply.badRequest('Invalid email or password.');

      const isValidPassword = await argon2.verify(user.passwordHash, password);

      if (!isValidPassword)
        return reply.badRequest('Invalid email or password.');

      request.session.user = { id: user._id };

      return reply.send();
    },
  );

  fastify.get(
    '/api/v1/auth/logout',
    {
      schema: {
        response: {
          200: {
            type: 'string',
          },
        },
      },
    },
    async (request, reply) => {
      await request.session.destroy();
      return reply.send();
    },
  );

  fastify.get(
    '/api/v1/auth/me',
    {
      preHandler: authenticateUser,
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['email', 'name', 'id'],
            properties: {
              id: { type: 'string' },
              email: { type: 'string', format: 'email' },
              name: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request;

      const user = await User.findById(userId)
        .select({ id: '$_id', _id: 0, email: 1, name: 1 })
        .lean();

      return reply.send(user);
    },
  );

  done();
}
