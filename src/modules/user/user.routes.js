import { User } from './user.model.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {Object} [options]
 * @param {() => void} done
 * @returns {void}
 */
export default async function (fastify, _, done) {
  fastify.patch(
    '/api/users',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      //   if (!req.session?.userId)
      //     return res.send('You need to be authenticated!');

      const { name } = request.body; //! USE ZOD OR SCHEMA VALIDATOR
      //   const userId = request.session.userId;

      const user = await User.findById(userId).exec();

      if (!user) return reply.notFound('User not found.');

      if (user.name) user.name = name;

      await user.save();

      return res.send();
    },
  );

  app.post('/api/users/deactivate', {}, async (request, reply) => {
    // if (!req.session?.userId) return res.send('You need to be authenticated!');

    // const userId = req.session.userId;

    const user = await User.findById(userId).exec();

    if (!user) return reply.notFound('User not found.');

    user.status = 'deactivated';
    user.deletedAt = Date.now();
    user.deletedUser.email = user.email;

    user.email = `deleted-${Math.random() * 1000}@kivo.com`; //! FIX

    await user.save();

    // Log person out
    await fastify.session.destroy();
  });

  //   app.post('/api/users/change-email', async (req, res) => {
  //     if (!req.session?.userId) return res.send('You need to be authenticated!');

  //     const { userId } = req.session;
  //     const { newEmail } = req.body;

  //     try {
  //       const user = await User.findById(userId).exec();

  //       if (newEmail === user.email)
  //         return res.status(400).send('duplicate email!');

  //       user.email = newEmail;

  //       //! HANDLE if email was found on another account
  //       //! Send security alert

  //       await user.save();

  //       return res.send();
  //     } catch (error) {
  //       console.error(`[${req.url}] error:`, error);
  //       return res.status(500).json({
  //         statusCode: 500,
  //         error: 'Internal Server Error',
  //         message: 'Something went wrong.',
  //       });
  //     }
  //   });

  //   app.post('/api/users/change-password', async (req, res) => {
  //     if (!req.session?.userId) return res.send('You need to be authenticated!');

  //     const { userId } = req.session;

  //     const { newPassword } = req.body;

  //     try {
  //       const user = await User.findById(userId).exec();

  //       const hashedPassword = await argon2.hash(newPassword);

  //       user.hash = hashedPassword;

  //       //! Send security alert

  //       await user.save();

  //       return res.send();
  //     } catch (error) {
  //       console.error(`[${req.url}] error:`, error);
  //       return res.status(500).json({
  //         statusCode: 500,
  //         error: 'Internal Server Error',
  //         message: 'Something went wrong.',
  //       });
  //     }
  //   });

  done();
}
