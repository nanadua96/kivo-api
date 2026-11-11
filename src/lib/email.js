import 'dotenv/config';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOTPEmail({ to, otp, type }) {
  const subjects = {
    'sign-in': 'Your sign-in code',

  };

  await resend.emails.send({
    from: 'Kivo <onboarding@resend.dev>',
    to,
    subject: subjects[type],
    html: `
      <h2>Your verification code</h2>
      <p>Use the code below to continue:</p>
      <h1>${otp}</h1>
      <p>This code expires in 5 minutes.</p>
    `,
  });
}
