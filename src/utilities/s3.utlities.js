import { createId } from '@paralleldrive/cuid2';

export const resolveAssetUrl = (key) =>
  `${process.env.STORAGE_PUBLIC_URL}/${key}`;

export function createAssetKey({ userId, extension }) {
  const id = createId();
  return `assets/${userId}/${id}.${extension}`;
}
