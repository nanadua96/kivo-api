import { User } from '../user/user.model.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {Object} [options]
 * @param {() => void} done
 * @returns {void}
 */
export default async function (fastify, _, done) {
  app.post('/api/register', async (req, res) => {
    try {
      const schema = z.object({
        name: z.string(),
        password: z.string(),
        email: z.email(),
        guestSessionId: z.string().optional(),
      });

      const { data, success } = schema.safeParse(req.body);

      if (!success)
        return res.status(400).json({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid credentials.',
        });

      const exist = await User.exists({ email: data.email });

      if (exist)
        return res.status(409).json({
          statusCode: 409,
          error: 'Conflict',
          message: 'Account already exists.',
        });

      const hashedPassword = await argon2.hash(data.password);

      const createdUser = await User.create({
        name: data.name,
        hash: hashedPassword,
        email: data.email,
      });

      req.session.userId = createdUser._id;

      // Check if user has unsaved conversation
      if (data.guestSessionId) {
        const conversation = await Conversation.findOne({
          guestSessionId: data.guestSessionId,
        }).exec();

        if (conversation) {
          conversation.user = createdUser._id;
          conversation.guestSessionId = undefined;
          await conversation.save();
        }
      }

      return res.status(201).send();
    } catch (error) {
      console.error(`[${req.url}] error:`, error);
      return res.status(500).json({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Something went wrong.',
      });
    }
  });

  app.post('/api/login', async (req, res) => {
    try {
      const loginSchema = z.object({
        email: z.email(),
        password: z.string(),
        guestSessionId: z.string().optional(),
      });

      const { success, data } = loginSchema.safeParse(req.body);

      if (!success)
        return res.status(400).json({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Please provide a valid email address and password.',
        });

      const user = await User.findOne({ email: data.email }).lean();

      if (!user)
        return res.status(400).json({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid email or password.',
        });

      const isValidPassword = await argon2.verify(user.hash, data.password);

      if (!isValidPassword)
        return res.status(400).json({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid email or password.',
        });

      req.session.userId = user._id;

      // Check if user has unsaved conversation
      // if (data.guestSessionId) {
      //   const conversation = await Conversation.findOne({
      //     guestSessionId: data.guestSessionId,
      //   }).exec();

      //   if (conversation) {
      //     conversation.user = user._id;
      //     conversation.guestSessionId = undefined;
      //     await conversation.save();
      //   }
      // }

      return res.send();
    } catch (error) {
      console.error(`[${req.url}] error:`, error);
      return res.status(500).json({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Something went wrong.',
      });
    }
  });

  app.get('/api/logout', async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction failed:', err);
        return res.status(500).json({ message: 'Logout failed' });
      }

      return res.send();
    });
  });

  function errorResponse({ code = 500, message = 'Something went wrong' }) {
    let error = 'Internal Server Error';

    if (code === 401) error = 'Unauthorized';

    return {
      statusCode: code,
      error,
      message,
    };
  }

  app.get('/api/me', async (req, res) => {
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
