import argon2 from 'argon2';
import { User } from './user.model.js';

export async function createUser(data) {
  const passwordHash = await argon2.hash(data.password);

  return await User.create({
    email: data.email,
    name: data.name,
    passwordHash,
  });
}
