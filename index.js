import 'dotenv/config';
import MongoStore from 'connect-mongo';
import Fastify from 'fastify';
import mongoose from 'mongoose';
import { __DEV__ } from './src/constants/index.js';

(async () => {
  // =================================
  // FASTIFY INSTANCE
  // =================================
  const fastify = Fastify({
    logger: process.env.NODE_ENV === 'production' || {
      transport: {
        target: '@fastify/one-line-logger',
      },
    },
  });

  // =================================
  // MONGODB
  // =================================
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
      fastify.log.info('Connected to MongoDB.');
    })
    .catch((error) => {
      fastify.log.error('MongoDB connection error:');
      console.error(error);
      process.exit(1);
    });

  // =================================
  // PLUGINS
  // =================================
  await fastify.register(import('@fastify/rate-limit'), {
    global: true,
    max: 100,
    timeWindow: '1m',
    skipOnError: true,
    keyGenerator: (request) =>
      request.headers['x-real-ip'] || // nginx
      request.session?.user?.id || // Limit based on user id value
      request.ip, // fallback to default
  });

  await fastify.register(import('@fastify/cors'), {
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: ['http://127.0.0.1:3000', 'http://192.168.100.4:8081'],
  });

  await fastify.register(import('@fastify/helmet'), { global: true });

  await fastify.register(import('@fastify/multipart'));

  await fastify.register(import('@fastify/cookie'));

  fastify.register(import('@fastify/session'), {
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
      // domain: process.env.NODE_ENV === 'production' ? 'onrender.com' : undefined,
      secure: process.env.NODE_ENV === 'production',
    },
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
    }),
  });

  await fastify.register(import('@fastify/sensible'));

  // =================================
  // DECORATORS
  // =================================
  fastify.decorateRequest('userId', '');

  // =================================
  // SCHEMAS
  // =================================
  // fastify.addSchema(mongodbObjectIdSchema);

  // =================================
  // ROUTES
  // =================================
  fastify.get('/ping', (_, reply) => reply.send('pong'));
  fastify.register(import('./src/modules/auth/auth.routes.js'));
  fastify.register(import('./src/modules/user/user.routes.js'));

  // fastify.register(
  //   import('./src/modules/auth/auth.routes.js', { prefix: '/api/v1/auth' }),
  // );

  // fastify.register(
  //   import('./src/modules/user/user.routes.js', { prefix: '/api/v1/users' }),
  // );

  // =================================
  // ERROR HANDLERS
  // =================================
  fastify.setNotFoundHandler(
    { preHandler: fastify.rateLimit() },
    (request, reply) =>
      reply.notFound(
        `The requested route ${request.method} ${request.url} does not exist.`,
      ),
  );

  fastify.setErrorHandler(function (error, _, reply) {
    const GENERIC_MESSAGE = __DEV__
      ? 'Something went wrong. Check console for details.'
      : 'Something went wrong. Please try again later.';

    // Handle Mongoose errors
    if (error?.code === 11000 && error?.name === 'MongoServerError')
      return reply.conflict(
        'A record with the same information already exists.',
      );

    if (error?.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return reply.badRequest(`Invalid input data: ${messages.join('. ')}`);
    }

    if (error?.name === 'CastError') {
      if (__DEV__) this.log.error('MongoDB error. See error below:');
      if (__DEV__) console.error(error);
      return reply.badRequest(
        `Invalid format for field ${error.path}: ${error.value}`,
      );
    }

    if (error?.name === 'MongoServerError') {
      if (__DEV__) this.log.error('MongoDB error. See error below:');
      if (__DEV__) console.error(error);
      return reply.internalServerError(GENERIC_MESSAGE);
    }

    // Handle internal errors and send a generic response
    if (
      error.name === 'ReferenceError' ||
      error.name === 'TypeError' ||
      error.name === 'EvalError' ||
      error.name === 'RangeError' ||
      error.name === 'SyntaxError' ||
      error.name === 'URIError'
    ) {
      if (__DEV__) this.log.error('An error occurred. See error below:');
      if (__DEV__) console.error(error);
      return reply.internalServerError(GENERIC_MESSAGE);
    }

    return reply.send(error);
  });

  // =================================
  // SERVER
  // =================================
  fastify
    .listen({ host: process.env.HOST, port: process.env.PORT })
    .catch((error) => {
      fastify.log.error('Error starting server:');
      console.error(error);
      process.exit(1);
    });

  // =================================
  // APP HOOKS
  // =================================
  fastify.addHook('onClose', async (fastify, done) => {
    await mongoose.connection.close();
    fastify.log.info('MongoDB connection closed.');
    done();
  });

  // =================================
  // GRACEFUL SHUTDOWN
  // =================================
  async function shutdown() {
    try {
      await fastify.close();
      process.exit(0);
    } catch (error) {
      fastify.log.error('Error shutting down server:');
      console.error(error);
      process.exit(1);
    }
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();
