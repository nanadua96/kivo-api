import { S3Client } from '@aws-sdk/client-s3';

export const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.STORAGE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
  },
});
