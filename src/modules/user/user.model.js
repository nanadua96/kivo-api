import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      minLength: 2,
      maxLength: 50,
      required: true,
    },

    email: {
      type: String,
      unique: true,
      required: true,
      maxLength: 250,
      //! ADD MORE RULES
    },

    passwordHash: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ['active', 'deactivated'],
      default: 'active',
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

userSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model('User', userSchema);
