import argon2 from 'argon2';
import { authenticateUser } from '../auth/auth.hook.js';
import { User } from './user.model.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {Object} [options]
 * @param {() => void} done
 * @returns {void}
 */
export default function (fastify, _, done) {
  fastify.patch(
    '/api/v1/users',
    {
      preHandler: authenticateUser,
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 50 },
          },
        },
        response: {
          200: { type: 'string' },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request;

      const { name } = request.body;

      const user = await User.findById(userId).exec();

      if (!user) return reply.notFound("We couldn't find your account.");

      if (user.name) user.name = name;

      await user.save();

      return reply.send();
    },
  );

  fastify.post(
    '/api/v1/users/deactivate',
    {
      preHandler: authenticateUser,
      schema: {
        response: {
          200: { type: 'string' },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request;

      const user = await User.findById(userId).exec();

      if (!user) return reply.notFound("We couldn't find your account.");

      user.status = 'deactivated';
      user.deletedAt = Date.now();
      user.deletedUser.email = user.email;

      user.email = `deleted-${Math.random() * 100_000}@kivo.com`;

      await user.save();

      // Log person out
      await request.session.destroy();
    },
  );

  fastify.post(
    '/api/v1/users/change-email',
    {
      preHandler: authenticateUser,
      additionalProperties: false,
      schema: {
        body: {
          type: 'object',
          required: ['newEmail'],
          properties: {
            newEmail: { type: 'string', format: 'email' },
          },
        },
        response: {
          200: { type: 'string' },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request;

      const { newEmail } = request.body;

      const user = await User.findById(userId).exec();

      user.email = newEmail;

      await user.save();

      return reply.send();
    },
  );

  fastify.post(
    '/api/v1/users/change-password',
    {
      preHandler: authenticateUser,
      schema: {
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          additionalProperties: false,
          properties: {
            currentPassword: {
              type: 'string',
              minLength: 8,
              maxLength: 128,
            },
            newPassword: {
              type: 'string',
              minLength: 8,
              maxLength: 128,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request;

      const { currentPassword, newPassword } = request.body;

      const user = await User.findById(userId).exec();

      if (!user) return reply.notFound('We couldn’t find your account.');

      if (currentPassword === newPassword)
        return reply.badRequest(
          'Your new password must be different from your current password',
        );

      const isValidPassword = await argon2.verify(
        user.passwordHash,
        currentPassword,
      );

      if (!isValidPassword)
        return reply.badRequest('Your current password is incorrect.');

      const hashedPassword = await argon2.hash(newPassword);

      user.hash = hashedPassword;

      //! Send security alert

      await user.save();

      return reply.send();
    },
  );

  fastify.post(
    '/users/profile-picture/upload/complete',
    {
      preHandler: authenticateUser,
    },
    async (request, reply) => {
      const { userId } = request;

      const avatar = request.body;

      const session = await startSession();

      try {
        session.startTransaction();

        const user = await User.findById(userId).session(session).exec();

        if (!user) return reply.notFound('User not found.');

        const MAX_AVATAR_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1 MiB
        const MIN_DIMENSION_PX = 200;
        const MAX_DIMENSION_PX = 1000;
        const ALLOWED_FORMATS = ['jpeg', 'png', 'webp'];

        // ==================================
        // ASSET UPDATE
        // ==================================

        const { success, error, asset } = await completeUpload({
          key: avatar.key,
          userId,
          docModel: 'User',
          purpose: 'user_avatar',
          attachedTo: userId,
          fileType: 'image',
          allowedFileTypes: ALLOWED_FORMATS,
          session,
          maxSizeBytes: MAX_AVATAR_FILE_SIZE_BYTES,
          imageOptions: {
            minWidth: MIN_DIMENSION_PX,
            minHeight: MIN_DIMENSION_PX,
            maxWidth: MAX_DIMENSION_PX,
            maxHeight: MAX_DIMENSION_PX,
          },
        });

        if (!success) {
          await session.abortTransaction();
          return reply.badRequest(error);
        }

        // ==================================
        // DOCUMENT UPDATE
        // ==================================
        user.avatar = { key: avatar.key, bucket: asset.bucket };
        await user.save({ session });

        // ==================================
        // COMMIT
        // ==================================
        await session.commitTransaction();

        return reply.send();
      } catch (error) {
        if (__DEV__) console.log(`[${request.url}] transaction failed:`, error);
        await session.abortTransaction();
        return reply.internalServerError('Something went wrong.');
      } finally {
        session.endSession();
      }
    },
  );

  // fastify.delete('/api/v1/users/profile-picture', {
  //   preHandler: authenticateUser,
  //   config: {
  //     rateLimit: {
  //       max: 10,
  //       timeWindow: '1 hour',
  //     },
  //   },
  //   schema: {
  //     response: {
  //       200: {
  //         type: 'string',
  //       },
  //     },
  //   },
  //   async handler(request, reply) {
  //     const userId = request.session.user.id;

  //     const user = await User.findById(userId).exec();

  //     if (!user) return reply.notFound('User not found.');

  //     if (!user.avatar) return reply.badRequest('No avatar found.');

  //     const { success, error } = await deleteAsset([user.avatar.key], userId);

  //     if (!success) return reply.badRequest(error);

  //     user.avatar = null;

  //     await user.save();

  //     return reply.send();
  //   },
  // });

  done();
}
