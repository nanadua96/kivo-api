import { createId } from '@paralleldrive/cuid2';
// import 'dotenv/config';

export function createAssetKey({ userId, extension }) {
  const id = createId();
  return `assets/${userId}/${id}.${extension}`;
}

// export function resolveAssetUrl({ key, bucket }) {
//   let prefix;
//   if (bucket === 'wessey') prefix = process.env.STORAGE_PUBLIC_URL;
//   return `${prefix}/${key}`;
// }

// console.log(resolveAssetUrl({ key: '/example/image.jpg', bucket: 'wessey' }));
