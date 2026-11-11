import { mongodbAdapter } from '@better-auth/mongo-adapter';
import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import { MongoClient } from 'mongodb';
import { sendOTPEmail } from './email.js';

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
    enabled: false,
  },
  //   user: {
  //     additionalFields: {
  //       avatarKey: {
  //         type: 'string',
  //         required: false,
  //       },
  //     },
  //   },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        try {
          if (type === 'sign-in') {
            await sendOTPEmail({ to: email, otp, type });
          } else if (type === 'email-verification') {
            // Send the OTP for email verification
          } else {
            // Send the OTP for password reset
          }
        } catch (error) {
          console.log('Error sending email:', error);
        }
      },
    }),
  ],
});
