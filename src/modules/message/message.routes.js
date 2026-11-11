import { User } from '../user/user.model.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {Object} [options]
 * @param {() => void} done
 * @returns {void}
 */
export default async function (fastify, _, done) {
  app.post('/api/messages/:id/feedback', async (req, res) => {
    if (!req.session?.userId) return res.send('You need to be authenticated!');

    try {
      const { id } = req.params;
      const { userId } = req.session;
      const { rating } = req.body;

      //! REMOVE IF ITS THE SAME

      const message = await Message.findOne({
        _id: id,
        user: userId,
        role: 'assistant',
      }).exec();

      if (!message) return res.send('Not found!'); //! FIX

      message.rating = rating;

      await message.save();

      return res.json();
    } catch (error) {
      console.error(`[${req.url}] error:`, error);
      return res.status(500).json({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Something went wrong.',
      });
    }
  });

  app.patch('/api/messages/:id/edit', async (req, res) => {
    try {
      const { id } = req.params;

      const { model, message, messages = [] } = req.body;

      if (!message)
        return res.status(400).json({ error: 'Message input is required' });

      const userId = req.session.userId;

      //! USE TRANSACTIONS

      if (userId) {
        const currentMessage = await Message.findOne({
          _id: id,
          user: userId,
          role: 'user',
        }).lean();

        if (!currentMessage) return res.send('MESSAGE NOT FOUND!');

        const conversationId = currentMessage.conversation;

        const history = await Message.find(
          {
            conversation: conversationId,
            user: userId,
            _id: { $lt: id },
          },
          'role content',
        ).lean();

        const mapped = history.map((i) => ({
          role: i.role,
          content: i.content,
        }));

        // return res.json({ currentMessage, history, mapped });

        const chatCompletion = await groq.chat.completions.create({
          messages: [...mapped, { role: 'user', content: message }],
          model: 'openai/gpt-oss-120b',
          stream: false,
        });

        const reply = chatCompletion.choices[0]?.message?.content || '';

        await Message.deleteMany({
          conversation: conversationId,
          user: userId,
          _id: { $gte: id },
        });

        await Message.create([
          {
            role: 'user',
            content: message,
            conversation: conversationId,
            user: userId,
            model,
          },
          {
            role: 'assistant',
            content: reply,
            conversation: conversationId,
            user: userId,
            model,
          },
        ]);

        return res.json({
          role: 'assistant',
          text: reply,
          timestamp: new Date(),
        });
      }

      return res.send('Hello world!');
    } catch (error) {
      console.error(`[${req.url}] error:`, error);
      return res.status(500).json({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Something went wrong.',
      });
    }
  });



  done();
}
