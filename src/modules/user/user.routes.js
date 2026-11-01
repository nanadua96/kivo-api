import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import argon2 from 'argon2';
import sharp from 'sharp';
import { s3 } from '../../config/s3.config.js';
import {
  createAssetKey,
  resolveAssetUrl,
} from '../../utilities/s3.utlities.js';
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
    '/api/v1/users/avatar',
    {
      preHandler: authenticateUser,
    },
    async (request, reply) => {
      const { userId } = request;

      const data = await request.file({
        limits: {
          fields: 1,
          fileSize: 5_000_000, // 5 MiB
          files: 1,
          parts: 1,
        },
      });

      if (!data) return reply.badRequest('Image is required');

      try {
        const buffer = await data.toBuffer();

        // Resize and convert to WebP
        const webpBuffer = await sharp(buffer)
          .rotate()
          .resize({
            width: 800,
            height: 800,
          })
          .webp({
            quality: 75,
          })
          .toBuffer();

        const key = createAssetKey({ userId, extension: 'webp' });

        // Upload processed image to S3
        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.STORAGE_BUCKET,
            Key: key,
            Body: webpBuffer,
            ContentType: 'image/webp',
          }),
        );

        const user = await User.findById(userId).exec();

        user.avatar.key = key;

        await user.save();

        return reply.code(201).send({ url: resolveAssetUrl(key) });
      } catch (error) {
        console.log(`$[{request.url}] error:`);
        console.error(error);
        return reply.internalServerError('Image upload failed');
      }
    },
  );

  fastify.delete('/api/v1/users/profile-picture', {
    preHandler: authenticateUser,
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 hour',
      },
    },
    schema: {
      response: {
        200: {
          type: 'string',
        },
      },
    },
    async handler(request, reply) {
      const userId = request.session.user.id;

      const user = await User.findById(userId).exec();

      if (!user) return reply.notFound('User not found.');

      if (!user.avatar) return reply.badRequest('No avatar found.');

      const command = new DeleteObjectCommand({
        Bucket: process.env.STORAGE_BUCKET,
        Key: user.avatar.key,
      });

      await s3Client.send(command);

      user.avatar = undefined;

      await user.save();

      return reply.send();
    },
  });

  done();
}
