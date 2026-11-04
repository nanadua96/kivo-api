import { mongodbAdapter } from '@better-auth/mongo-adapter';
import { betterAuth } from 'better-auth';
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db();

export const auth = betterAuth({
  database: mongodbAdapter(db),
  advanced: {
    database: {
      joins: true,
    },
  },
  trustedOrigins: ['http://127.0.0.1:4000'],
  emailAndPassword: {
    enabled: true,
  },
  //   user: {
  //     additionalFields: {
  //       avatarKey: {
  //         type: 'string',
  //         required: false,
  //       },
  //     },
  //   },
});
