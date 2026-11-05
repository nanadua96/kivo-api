import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
// import argon2 from 'argon2';
import { fromNodeHeaders } from 'better-auth/node';
import sharp from 'sharp';
import { s3 } from '../../config/s3.config.js';
// import { User } from './user.model.js';
import { auth } from '../../lib/auth.js';
import {
  createAssetKey,
  resolveAssetUrl,
} from '../../utilities/s3.utlities.js';
import { authenticateUser } from '../auth/auth.hook.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {Object} [options]
 * @param {() => void} done
 * @returns {void}
 */
export default function (fastify, _, done) {
  // fastify.patch(
  //   '/api/v1/users/avatar',
  //   {
  //     preHandler: authenticateUser,
  //   },
  //   async (request, reply) => {
  //     const { userId } = request;

  //     const data = await request.file({
  //       limits: {
  //         fields: 1,
  //         fileSize: 5_000_000, // 5 MiB
  //         files: 1,
  //         parts: 1,
  //       },
  //     });

  //     if (!data) return reply.badRequest('Image is required');

  //     try {
  //       const buffer = await data.toBuffer();

  //       // Resize and convert to WebP
  //       const webpBuffer = await sharp(buffer)
  //         .rotate()
  //         .resize({
  //           width: 800,
  //           height: 800,
  //         })
  //         .webp({
  //           quality: 75,
  //         })
  //         .toBuffer();

  //       const key = createAssetKey({ userId, extension: 'webp' });

  //       // Upload processed image to S3
  //       await s3.send(
  //         new PutObjectCommand({
  //           Bucket: process.env.STORAGE_BUCKET,
  //           Key: key,
  //           Body: webpBuffer,
  //           ContentType: 'image/webp',
  //         }),
  //       );

  //       const user = await User.findById(userId).exec();

  //       user.avatar.key = key;

  //       await user.save();

  //       return reply.code(201).send({ url: resolveAssetUrl(key) });
  //     } catch (error) {
  //       console.log(`$[{request.url}] error:`);
  //       console.error(error);
  //       return reply.internalServerError('Image upload failed');
  //     }
  //   },
  // );

  fastify.delete('/api/v1/users/avatar', {
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
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      const image = session.user.image;
      console.log(session);

      return image;

      const command = new DeleteObjectCommand({
        Bucket: process.env.STORAGE_BUCKET,
        Key: user.avatar.key,
      });

      await s3.send(command);

      await auth.api.updateUser({
        body: { image: null },
        headers: fromNodeHeaders(request.headers),
      });

      return reply.send();
    },
  });

  done();
}
