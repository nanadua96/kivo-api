import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      minLength: 1,
      maxLength: 100,
      required: true,
    },

    email: {
      type: String,
      unique: true,
      required: true,
      //! ADD MORE RULES
    },

    passwordHash: {
      type: String,
      minLength: 1,
      maxLength: 256,
      required: true,
    },

    status: {
      type: String,
      enum: ['active', 'deactivated'],
    },

    deletedAt: {
      type: Date,
    },

    deletedUser: {
      email: String,
    },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
